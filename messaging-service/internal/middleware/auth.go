package middleware

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	jwtgo "github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/messaging-service/internal/pkg/tenant"
)

// JWKSCache caches the JWKS keys from Zitadel.
type JWKSCache struct {
	url        string
	httpClient *http.Client
	hostHeader string
	ttl        time.Duration
	mu         sync.RWMutex
	keys       map[string]*rsa.PublicKey
	exp        time.Time
}

// NewJWKSCache creates a new JWKS cache.
func NewJWKSCache(url string, httpClient *http.Client, hostHeader string, ttl time.Duration) *JWKSCache {
	if ttl <= 0 {
		ttl = 5 * time.Minute
	}
	return &JWKSCache{
		url:        url,
		httpClient: httpClient,
		hostHeader: hostHeader,
		ttl:        ttl,
		keys:       make(map[string]*rsa.PublicKey),
	}
}

func (c *JWKSCache) getKey(kid string) (*rsa.PublicKey, error) {
	c.mu.RLock()
	if time.Now().Before(c.exp) {
		if key, ok := c.keys[kid]; ok {
			c.mu.RUnlock()
			return key, nil
		}
	}
	c.mu.RUnlock()

	if err := c.refresh(); err != nil {
		return nil, err
	}

	c.mu.RLock()
	defer c.mu.RUnlock()
	if key, ok := c.keys[kid]; ok {
		return key, nil
	}
	return nil, fmt.Errorf("key %s not found in JWKS", kid)
}

func (c *JWKSCache) refresh() error {
	req, err := http.NewRequest("GET", c.url, nil)
	if err != nil {
		return fmt.Errorf("create JWKS request: %w", err)
	}
	if c.hostHeader != "" {
		req.Host = c.hostHeader
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("fetch JWKS: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read JWKS body: %w", err)
	}

	var jwks struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.Unmarshal(body, &jwks); err != nil {
		return fmt.Errorf("parse JWKS: %w", err)
	}

	newKeys := make(map[string]*rsa.PublicKey, len(jwks.Keys))
	for _, k := range jwks.Keys {
		if k.Kty != "RSA" {
			continue
		}
		nBytes, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil {
			continue
		}
		eBytes, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil {
			continue
		}
		n := new(big.Int).SetBytes(nBytes)
		e := int(new(big.Int).SetBytes(eBytes).Int64())
		newKeys[k.Kid] = &rsa.PublicKey{N: n, E: e}
	}

	c.mu.Lock()
	c.keys = newKeys
	c.exp = time.Now().Add(c.ttl)
	c.mu.Unlock()

	return nil
}

// sessionCacheEntry stores a successfully validated session in Redis.
type sessionCacheEntry struct {
	UserID      string `json:"user_id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
}

// Auth middleware validates Zitadel-issued JWTs or session tokens and sets user context.
// pool resolves the Zitadel identity to Simplify Projects's stable internal user ID —
// see resolveUserID for why this can no longer be a pure derivation.
func Auth(jwksURL, issuer, hostHeader, zitadelInternalURL, serviceToken string, rdb *redis.Client, pool *pgxpool.Pool, jwksTTL time.Duration) func(http.Handler) http.Handler {
	cache := NewJWKSCache(jwksURL, &http.Client{Timeout: 10 * time.Second}, hostHeader, jwksTTL)
	sessionClient := &http.Client{Timeout: 10 * time.Second}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				if token := r.URL.Query().Get("token"); token != "" {
					authHeader = "Bearer " + token
				}
			}
			if authHeader == "" {
				http.Error(w, `{"message":"missing authorization header"}`, http.StatusUnauthorized)
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
				http.Error(w, `{"message":"invalid authorization format"}`, http.StatusUnauthorized)
				return
			}
			tokenStr := parts[1]

			// Try JWT validation first
			token, jwtErr := jwtgo.Parse(tokenStr, func(token *jwtgo.Token) (any, error) {
				if _, ok := token.Method.(*jwtgo.SigningMethodRSA); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
				}
				kid, ok := token.Header["kid"].(string)
				if !ok {
					return nil, fmt.Errorf("missing kid in token header")
				}
				return cache.getKey(kid)
			}, jwtgo.WithIssuer(issuer))

			if jwtErr == nil && token.Valid {
				claims, ok := token.Claims.(jwtgo.MapClaims)
				if !ok {
					http.Error(w, `{"message":"invalid claims"}`, http.StatusUnauthorized)
					return
				}

				sub, _ := claims["sub"].(string)
				email, _ := claims["email"].(string)
				userID, err := resolveUserID(r.Context(), pool, sub, email)
				if err != nil {
					log.Error().Err(err).Msg("resolve user id failed")
					http.Error(w, `{"message":"could not resolve user"}`, http.StatusInternalServerError)
					return
				}

				ctx := tenant.SetUserID(r.Context(), userID)
				ctx = tenant.SetEmail(ctx, email)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			// Fallback: try session token — check Redis cache first
			if rdb != nil {
				cacheKey := "session:validated:" + tokenStr[:min(len(tokenStr), 64)]
				if cached, err := rdb.Get(r.Context(), cacheKey).Bytes(); err == nil {
					var entry sessionCacheEntry
					if json.Unmarshal(cached, &entry) == nil && entry.UserID != "" {
						userID, _ := uuid.Parse(entry.UserID)
						if userID == uuid.Nil {
							userID = uuid.NewSHA1(uuid.NameSpaceURL, []byte(entry.UserID))
						}
						ctx := tenant.SetUserID(r.Context(), userID)
						ctx = tenant.SetEmail(ctx, entry.Email)
						ctx = tenant.SetDisplayName(ctx, entry.DisplayName)
						next.ServeHTTP(w, r.WithContext(ctx))
						return
					}
				}
			}

			// This app's OIDC client issues opaque (non-JWT) access tokens by
			// default, so the JWT attempt above misses essentially every real
			// token from the normal login flow — validate those the OIDC-
			// standard way, via the userinfo endpoint, which needs no client
			// credentials, just the token itself. Mirrors the main backend's
			// ValidateToken (backend/internal/auth/zitadel.go) — this
			// service's auth is a deliberate duplicate of that logic and had
			// fallen out of sync missing this exact fallback.
			userID, email, displayName, opaqueErr := validateOpaqueAccessToken(r.Context(), sessionClient, pool, zitadelInternalURL, hostHeader, tokenStr)
			if opaqueErr != nil {
				var sessionErr error
				userID, email, displayName, sessionErr = validateSessionToken(r.Context(), sessionClient, pool, zitadelInternalURL, hostHeader, serviceToken, tokenStr)
				if sessionErr != nil {
					log.Debug().Err(jwtErr).Str("opaque_err", opaqueErr.Error()).Str("session_err", sessionErr.Error()).Msg("token validation failed")
					http.Error(w, `{"message":"invalid token"}`, http.StatusUnauthorized)
					return
				}
			}

			// Cache the validated session in Redis for 30s
			if rdb != nil {
				cacheKey := "session:validated:" + tokenStr[:min(len(tokenStr), 64)]
				entry := sessionCacheEntry{UserID: userID.String(), Email: email, DisplayName: displayName}
				if data, jsonErr := json.Marshal(entry); jsonErr == nil {
					_ = rdb.Set(r.Context(), cacheKey, data, 30*time.Second).Err()
				}
			}

			ctx := tenant.SetUserID(r.Context(), userID)
			ctx = tenant.SetEmail(ctx, email)
			ctx = tenant.SetDisplayName(ctx, displayName)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// validateOpaqueAccessToken validates a real Zitadel-issued opaque/encrypted
// OIDC access token via the userinfo endpoint (RFC 6749/OIDC standard way to
// check a non-JWT bearer token — needs no client credentials, just the
// token). This is the actual token type the app's OIDC client issues by
// default, so this is the fallback that matters most in practice, not an
// edge case.
func validateOpaqueAccessToken(ctx context.Context, client *http.Client, pool *pgxpool.Pool, zitadelURL, hostHeader, tokenStr string) (uuid.UUID, string, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, zitadelURL+"/oidc/v1/userinfo", nil)
	if err != nil {
		return uuid.Nil, "", "", fmt.Errorf("build userinfo request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	if hostHeader != "" {
		req.Host = hostHeader
	}

	resp, err := client.Do(req)
	if err != nil {
		return uuid.Nil, "", "", fmt.Errorf("fetch userinfo: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return uuid.Nil, "", "", fmt.Errorf("userinfo returned status %d", resp.StatusCode)
	}

	var info struct {
		Sub   string `json:"sub"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return uuid.Nil, "", "", fmt.Errorf("decode userinfo response: %w", err)
	}
	if info.Sub == "" {
		return uuid.Nil, "", "", fmt.Errorf("userinfo response missing sub")
	}

	userID, err := resolveUserID(ctx, pool, info.Sub, info.Email)
	if err != nil {
		return uuid.Nil, "", "", fmt.Errorf("resolve user id: %w", err)
	}

	return userID, info.Email, info.Name, nil
}

// validateSessionToken validates a base64-encoded session token by calling Zitadel's session API.
func validateSessionToken(ctx context.Context, client *http.Client, pool *pgxpool.Pool, zitadelURL, hostHeader, serviceToken, tokenStr string) (uuid.UUID, string, string, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(tokenStr)
	if err != nil {
		return uuid.Nil, "", "", fmt.Errorf("decode session token: %w", err)
	}
	tokenParts := strings.SplitN(string(decoded), ":", 2)
	if len(tokenParts) != 2 {
		return uuid.Nil, "", "", fmt.Errorf("invalid session token format")
	}
	sessionID := tokenParts[0]

	reqURL := zitadelURL + "/v2/sessions/" + sessionID
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return uuid.Nil, "", "", fmt.Errorf("create session request: %w", err)
	}
	if hostHeader != "" {
		req.Host = hostHeader
	}
	req.Header.Set("Accept", "application/json")
	if serviceToken != "" {
		req.Header.Set("Authorization", "Bearer "+serviceToken)
	}

	resp, err := client.Do(req)
	if err != nil {
		return uuid.Nil, "", "", fmt.Errorf("fetch session: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return uuid.Nil, "", "", fmt.Errorf("session not found: status %d", resp.StatusCode)
	}

	var result struct {
		Session struct {
			Factors struct {
				User struct {
					ID          string `json:"id"`
					LoginName   string `json:"loginName"`
					DisplayName string `json:"displayName"`
				} `json:"user"`
			} `json:"factors"`
		} `json:"session"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return uuid.Nil, "", "", fmt.Errorf("decode session response: %w", err)
	}

	userIDStr := result.Session.Factors.User.ID
	if userIDStr == "" {
		return uuid.Nil, "", "", fmt.Errorf("no user in session")
	}

	email := result.Session.Factors.User.LoginName
	displayName := result.Session.Factors.User.DisplayName
	userID, err := resolveUserID(ctx, pool, userIDStr, email)
	if err != nil {
		return uuid.Nil, "", "", fmt.Errorf("resolve user id: %w", err)
	}

	return userID, email, displayName, nil
}

// OrgIDFromCtx extracts the org ID from the context.
func OrgIDFromCtx(ctx context.Context) uuid.UUID {
	return tenant.OrgID(ctx)
}

// UserIDFromCtx extracts the user ID from the context.
func UserIDFromCtx(ctx context.Context) uuid.UUID {
	return tenant.UserID(ctx)
}

// RequireOrgInPath extracts org_id from the URL path and sets it in context for RLS.
func RequireOrgInPath(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		orgIDStr := r.PathValue("orgID")
		if orgIDStr == "" {
			http.Error(w, `{"message":"org_id required"}`, http.StatusBadRequest)
			return
		}
		orgID, err := uuid.Parse(orgIDStr)
		if err != nil {
			http.Error(w, `{"message":"invalid org_id"}`, http.StatusBadRequest)
			return
		}
		ctx := tenant.SetOrgID(r.Context(), orgID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// SetOrgFromHeader sets org from X-Org-ID header or org_id query parameter.
func SetOrgFromHeader(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		orgIDStr := r.Header.Get("X-Org-ID")
		if orgIDStr == "" {
			orgIDStr = r.URL.Query().Get("org_id")
		}
		if orgIDStr == "" {
			next.ServeHTTP(w, r)
			return
		}
		orgID, err := uuid.Parse(orgIDStr)
		if err != nil {
			log.Warn().Str("org_id", orgIDStr).Msg("invalid org_id")
			next.ServeHTTP(w, r)
			return
		}
		ctx := tenant.SetOrgID(r.Context(), orgID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
