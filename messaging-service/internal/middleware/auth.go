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
	"github.com/rs/zerolog/log"

	"github.com/orbispm/messaging-service/internal/pkg/tenant"
)

// JWKSCache caches the JWKS keys from Zitadel.
type JWKSCache struct {
	url        string
	httpClient *http.Client
	hostHeader string
	mu         sync.RWMutex
	keys       map[string]*rsa.PublicKey
	exp        time.Time
}

// NewJWKSCache creates a new JWKS cache.
func NewJWKSCache(url string, httpClient *http.Client, hostHeader string) *JWKSCache {
	return &JWKSCache{
		url:        url,
		httpClient: httpClient,
		hostHeader: hostHeader,
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
	c.exp = time.Now().Add(5 * time.Minute)
	c.mu.Unlock()

	return nil
}

// Auth middleware validates Zitadel-issued JWTs and sets user context.
func Auth(jwksURL, issuer, hostHeader string) func(http.Handler) http.Handler {
	cache := NewJWKSCache(jwksURL, &http.Client{Timeout: 10 * time.Second}, hostHeader)

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

			token, err := jwtgo.Parse(tokenStr, func(token *jwtgo.Token) (any, error) {
				if _, ok := token.Method.(*jwtgo.SigningMethodRSA); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
				}
				kid, ok := token.Header["kid"].(string)
				if !ok {
					return nil, fmt.Errorf("missing kid in token header")
				}
				return cache.getKey(kid)
			}, jwtgo.WithIssuer(issuer))
			if err != nil || !token.Valid {
				http.Error(w, `{"message":"invalid token"}`, http.StatusUnauthorized)
				return
			}

			claims, ok := token.Claims.(jwtgo.MapClaims)
			if !ok {
				http.Error(w, `{"message":"invalid claims"}`, http.StatusUnauthorized)
				return
			}

			sub, _ := claims["sub"].(string)
			userID, err := uuid.Parse(sub)
			if err != nil {
				userID = uuid.NewSHA1(uuid.NameSpaceURL, []byte(sub))
			}
			email, _ := claims["email"].(string)

			ctx := tenant.SetUserID(r.Context(), userID)
			ctx = tenant.SetEmail(ctx, email)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
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

// SetOrgFromHeader sets org from X-Org-ID header.
func SetOrgFromHeader(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		orgIDStr := r.Header.Get("X-Org-ID")
		if orgIDStr == "" {
			next.ServeHTTP(w, r)
			return
		}
		orgID, err := uuid.Parse(orgIDStr)
		if err != nil {
			log.Warn().Str("org_id", orgIDStr).Msg("invalid X-Org-ID header")
			next.ServeHTTP(w, r)
			return
		}
		ctx := tenant.SetOrgID(r.Context(), orgID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
