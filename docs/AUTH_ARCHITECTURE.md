# OrbisPM Authentication Architecture

## Overview

OrbisPM uses **Zitadel v2.71.6** as the identity provider, with a Go backend mediating all auth operations via **gRPC (zitadel-go SDK v3.26.1)**. The frontend communicates only with the backend API — never directly with Zitadel.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Next.js     │────▶│  Go Backend   │────▶│  Zitadel    │
│  Frontend    │◀────│  (Chi v5)     │◀────│  (gRPC)     │
│  Port 3000   │     │  Port 8080    │     │  Port 8081  │
└─────────────┘     └──────────────┘     └─────────────┘
       │                    │
       │              Kong Gateway
       └──────────── Port 8000 ──────────────┘
```

## Authentication Flow

### Session-Based Auth (Email/Password)

1. **Login**: Frontend sends `POST /api/v1/auth/login` with `{email, password}`
2. **Backend**: Creates a Zitadel session via gRPC (`CreateSession` + `CheckPassword`)
3. **Token**: Returns `base64(sessionID:sessionToken)` as `access_token`
4. **Storage**: Frontend stores tokens in `localStorage` (access_token, refresh_token, auth_user, token_expires_at)
5. **Validation**: Backend validates by decoding the base64 token and calling Zitadel `GetSession` gRPC

### Token Format

| Field | Description |
|-------|-------------|
| `access_token` | Base64-encoded `sessionID:sessionToken` |
| `refresh_token` | Same format (session-based, stateful) |
| `token_type` | `"Bearer"` |
| `expires_in` | `3600` (1 hour) |
| `expires_at` | Unix timestamp |
| `user` | User object with `mfa_enabled` |

### Auto Token Refresh

The frontend API client (`lib/api.ts`) implements automatic token refresh:

- **Pre-request check**: If token expires within 60 seconds, refreshes before sending
- **401 Retry**: If a request gets 401, tries refresh and retries once
- **Dedup**: Concurrent refresh requests are deduplicated (single promise)
- **Failure**: Clears auth and redirects to `/login`

## API Endpoints

### Session Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/auth/signup` | No | Register new user |
| POST | `/api/v1/auth/login` | No | Sign in |
| POST | `/api/v1/auth/refresh` | No | Refresh token |
| POST | `/api/v1/auth/logout` | Bearer | End session |
| GET | `/api/v1/auth/user` | Bearer | Get current user |
| PUT | `/api/v1/auth/user` | Bearer | Update user profile |

### OIDC PKCE Flow

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/auth/oidc/authorize` | No | Generate OIDC authorize URL with PKCE |
| POST | `/api/v1/auth/oidc/callback` | No | Exchange auth code for tokens |
| POST | `/api/v1/auth/oidc/refresh` | No | Refresh OIDC token |

### MFA (Multi-Factor Authentication)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/auth/mfa/totp/register` | Bearer | Start TOTP setup (returns URI + secret) |
| POST | `/api/v1/auth/mfa/totp/verify` | Bearer | Verify TOTP code |
| DELETE | `/api/v1/auth/mfa/totp` | Bearer | Remove TOTP |
| POST | `/api/v1/auth/mfa/otp-email/enable` | Bearer | Enable email OTP |
| DELETE | `/api/v1/auth/mfa/otp-email` | Bearer | Disable email OTP |
| POST | `/api/v1/auth/mfa/otp-sms/enable` | Bearer | Enable SMS OTP |
| DELETE | `/api/v1/auth/mfa/otp-sms` | Bearer | Disable SMS OTP |

### Social/IDP Login

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/auth/idps` | No | List configured identity providers |
| POST | `/api/v1/auth/idp/start` | No | Start social login (returns redirect URL) |

## Frontend Architecture

### Files Modified

| File | Purpose |
|------|---------|
| `frontend/src/types/domain.ts` | Added `mfa_enabled` to AuthUser, plus `TOTPRegistration`, `MFAStatus`, `IDPInfo`, `OIDCAuthorizeResponse` types |
| `frontend/src/lib/api.ts` | Added MFA, IDP, OIDC endpoints + auto token refresh interceptor |
| `frontend/src/lib/auth.ts` | localStorage helpers (unchanged) |
| `frontend/src/stores/auth-store.ts` | Added `mfaEnabled` state, `refreshToken()`, `updateUser()`, async `logout()` |
| `frontend/src/app/(auth)/login/page.tsx` | Added social login buttons (fetches IDPs from backend) |
| `frontend/src/app/(auth)/signup/page.tsx` | Added social signup buttons |
| `frontend/src/app/[orgSlug]/profile/security/page.tsx` | **NEW** — MFA management page |
| `frontend/src/app/[orgSlug]/layout.tsx` | Added "Security" sidebar link |

### State Management

```
useAuthStore (Zustand)
├── user: AuthUser | null
├── orgs: Org[]
├── currentOrg: Org | null
├── mfaEnabled: boolean
├── isAuthenticated: boolean
├── isLoading: boolean
│
├── initialize()     — hydrate from localStorage + refresh if expired
├── login()          — email/password → save tokens → load orgs
├── signup()         — create account → save tokens
├── logout()         — call backend logout → clear localStorage → redirect
├── refreshToken()   — exchange refresh_token → save new tokens
├── updateUser()     — update user in store (after MFA changes)
├── setCurrentOrg()  — switch org
└── refreshOrgs()    — reload org list
```

### Route Protection

- **Client-side only** — `useRequireAuth()` hook redirects unauthenticated users
- **No server-side middleware** — localStorage not accessible on server
- **AuthInitializer** in `providers.tsx` runs `initialize()` on mount

## Backend Architecture

### Key Files

| File | Purpose |
|------|---------|
| `backend/internal/auth/zitadel.go` | Zitadel gRPC client — session management, OIDC PKCE, MFA, IDP |
| `backend/internal/handler/auth_handler.go` | HTTP handlers for all auth endpoints |
| `backend/internal/middleware/auth.go` | JWT/session token validation middleware |
| `backend/internal/config/config.go` | Environment configuration |
| `backend/cmd/api/main.go` | Application bootstrap |

### Docker Networking

The backend uses a custom gRPC dialer to handle Docker networking:

- **External domain**: `localhost:8081` (what Zitadel recognizes as its instance)
- **Internal target**: `zitadel:8080` (Docker service name)
- The gRPC dialer routes `localhost:8081` → `zitadel:8080` transparently
- JWKS fetches use `http://zitadel:8080/oauth/v2/keys` with `Host: localhost:8081` header

## Configuration

### Environment Variables (Backend)

| Variable | Description | Example |
|----------|-------------|---------|
| `ZITADEL_ISSUER` | External Zitadel URL | `http://localhost:8081` |
| `ZITADEL_INTERNAL_URL` | Docker-internal Zitadel URL | `http://zitadel:8080` |
| `ZITADEL_SERVICE_TOKEN` | PAT for gRPC management API | `yLuIIVIzl05t1...` |
| `ZITADEL_CLIENT_ID` | OIDC application client ID | `362919913230237700` |

### Environment Variables (Frontend)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL (via Kong) | `http://localhost:8000` |

## Zitadel Resources

| Resource | ID |
|----------|----|
| OrbisPM Web Client | `362919913230237700` |
| Project | `362919889473634308` |
| Organization | `362916063832244228` |
| Admin User | `362916063832899588` (admin@orbispm.local) |
| Test User | `362923232451362820` (test@orbispm.local) |

## Adding Social Login Providers

To configure social IDPs (Google, GitHub, Microsoft), use the Zitadel admin console at `http://localhost:8081` or the Management API:

1. Log in as `admin@orbispm.local` / `Admin123!`
2. Navigate to **Settings > Identity Providers**
3. Add the desired provider with OAuth credentials
4. The IDP will automatically appear on the login/signup pages

## MFA Setup Flow

1. User navigates to **Profile > Security**
2. Clicks "Setup" on TOTP Authenticator
3. Backend calls Zitadel `AddOTPTOTP` → returns `otpauth://` URI + secret
4. User scans QR code with authenticator app
5. User enters 6-digit code
6. Backend verifies via `VerifyOTPTOTP` → TOTP is active
7. `mfa_enabled` becomes `true` on the user object

## Security Considerations

- **No secrets on frontend** — all auth operations go through the backend
- **PKCE S256** for OIDC flows — prevents auth code interception
- **Auto token refresh** — seamless UX without session drops
- **Server-side session validation** — tokens validated via Zitadel gRPC, not just JWT verification
- **CORS** configured on Kong gateway
- **Rate limiting** should be configured on Kong for auth endpoints in production
