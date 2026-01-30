# Authentication System

Clawdbot's authentication system provides secure multi-tenant user authentication with JWT-based tokens and Gateway token exchange for WebSocket connections.

## Overview

The authentication system consists of three main components:

1. **Auth API** - REST API for user authentication, registration, and token management
2. **Auth UI** - Web-based authentication interface (login, register, password reset)
3. **Gateway Auth** - WebSocket authentication using Gateway tokens

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Authentication Flow                           │
└─────────────────────────────────────────────────────────────────────┘

┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│ Auth UI  │ ───> │ Auth API │ ───> │ Database │ <─── │ Gateway  │
│(Frontend)│      │(Backend) │      │(Postgres)│      │(WebSocket)│
└──────────┘      └──────────┘      └──────────┘      └──────────┘
     │                 │                  │                  │
     │  1. Login       │                  │                  │
     │ ───────────────>│                  │                  │
     │                 │ 2. Verify        │                  │
     │                 │ ──────────────> │                  │
     │                 │ <────────────── │                  │
     │  3. JWT Tokens  │                  │                  │
     │ <───────────────│                  │                  │
     │                 │                  │                  │
     │  4. Exchange    │                  │                  │
     │    JWT for      │                  │                  │
     │    Gateway Token│                  │                  │
     │ ───────────────>│                  │                  │
     │                 │ 5. Create Token  │                  │
     │                 │ ──────────────> │                  │
     │                 │ <────────────── │                  │
     │  6. Gateway     │                  │                  │
     │     Token       │                  │                  │
     │ <───────────────│                  │                  │
     │                 │                  │                  │
     │  7. Connect with Gateway Token     │                  │
     │ ───────────────────────────────────────────────────> │
     │                 │                  │ 8. Validate     │
     │                 │                  │ <────────────── │
     │                 │                  │ 9. User info    │
     │                 │                  │ ──────────────> │
     │                 │                  │ 10. Connected ✅│
     │ <──────────────────────────────────────────────────── │
```

## Components

### Auth API (`src/auth/`)

REST API server that handles:
- User registration and login
- JWT token generation and validation
- Gateway token exchange
- Password reset
- Email verification
- OAuth (Google, Apple)

**Key Files:**
- `auth-service.ts` - Core authentication logic
- `token-service.ts` - JWT token generation/validation
- `routes.ts` - API endpoints
- `middleware.ts` - Auth middleware for protected routes
- `email-service.ts` - Email verification and password reset emails
- `audit-logger.ts` - Security audit logging

### Auth UI (`ui/auth/`)

Web-based authentication interface built with React + Vite.

**Key Files:**
- `pages/AuthPage.tsx` - Unified authentication flow (email check, login, signup)
- `pages/LoginPage.tsx` - Standalone login page
- `pages/SignupPage.tsx` - Standalone registration page
- `pages/EnterPasswordPage.tsx` - Password entry for existing users
- `pages/CreatePasswordPage.tsx` - Password creation for new users
- `pages/OAuthCallbackPage.tsx` - OAuth callback handler
- `pages/ForgotPasswordPage.tsx` - Password reset request
- `pages/ResetPasswordPage.tsx` - Password reset confirmation
- `lib/api/auth.ts` - API client with automatic token refresh

### Gateway Auth (`src/gateway/auth.ts`)

WebSocket authentication that validates Gateway tokens and static tokens.

**Features:**
- Gateway token validation via Auth Service (64-char hex tokens)
- Backward compatibility with static tokens (configured tokens)
- Tailscale authentication support
- Multi-tenant support
- User identity resolution from database

## Token Types

### 1. JWT Access Token
- **Lifetime:** 15 minutes
- **Purpose:** Authenticate API requests
- **Storage:** `localStorage.accessToken` (frontend)
- **Format:** JWT (JSON Web Token)
- **Claims:**
  ```json
  {
    "sub": "user-id",
    "tenant_id": "tenant-id",
    "email": "user@example.com",
    "role": "user",
    "type": "access",
    "iat": 1706660000,
    "exp": 1706660900
  }
  ```

### 2. JWT Refresh Token
- **Lifetime:** 30 days
- **Purpose:** Obtain new access tokens
- **Storage:** `localStorage.refreshToken` (frontend)
- **Format:** JWT (JSON Web Token)
- **Claims:**
  ```json
  {
    "sub": "user-id",
    "type": "refresh",
    "iat": 1706660000,
    "exp": 1709252000
  }
  ```

### 3. Gateway Token
- **Lifetime:** 1 hour
- **Purpose:** Authenticate WebSocket connections to Gateway
- **Storage:** Database (`gateway_tokens` table)
- **Format:** 64-character hex string (32 random bytes)
- **Example:** `e981b257fe5f8bd1dca9e9310970f66a7927fb11dca48e0865d3029a12383958`

## Database Schema

### `users` table
Stores user accounts with credentials and profile information.

### `tenants` table
Multi-tenant support - each user belongs to a tenant.

### `user_sessions` table
Tracks active JWT sessions for logout and session management.

### `gateway_tokens` table
Stores Gateway tokens for WebSocket authentication.

```sql
CREATE TABLE gateway_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(255) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gateway_tokens_token ON gateway_tokens(token);
CREATE INDEX idx_gateway_tokens_user_id ON gateway_tokens(user_id);
CREATE INDEX idx_gateway_tokens_expires_at ON gateway_tokens(expires_at);
```

## Authentication Flows

- [Gateway Token Exchange](/auth/flows/gateway-token-exchange)

## Security Features

### Password Security
- **Hashing:** bcrypt with salt rounds (12)
- **Minimum requirements:** Enforced by frontend (8+ characters)
- **Storage:** Only hashed passwords stored in database

### Token Security
- **JWT Secrets:** Separate secrets for access and refresh tokens
- **Token Rotation:** New refresh token issued on each refresh
- **Secure Storage:** HTTP-only cookies recommended (currently localStorage)
- **CSRF Protection:** Required for production deployments

### Session Management
- **Active Sessions:** Tracked in `user_sessions` table
- **Logout:** Revokes specific session
- **Logout All:** Revokes all user sessions
- **Session Expiry:** Automatic cleanup of expired sessions

### Audit Logging
All authentication events are logged:
- Login attempts (success/failure)
- Registration
- Password changes
- Token exchanges
- Failed authentication attempts

### Multi-Tenant Isolation
- Each user belongs to one tenant
- Data isolated by `tenant_id`
- Gateway tokens linked to both user and tenant

## Configuration

### Environment Variables

#### Auth API (`.env.dashboard`)
```bash
# Server
PORT=3000
DASHBOARD_URL=http://localhost:5173

# JWT Secrets (CHANGE IN PRODUCTION!)
ACCESS_TOKEN_SECRET=dev-access-secret-change-in-production
REFRESH_TOKEN_SECRET=dev-refresh-secret-change-in-production

# Database
DATABASE_URL=postgresql://localhost:5432/clawdbot_dev

# Email (optional)
EMAIL_FROM=noreply@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=

# OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/oauth/google/callback

APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
```

#### Auth UI (`.env`)
```bash
VITE_API_URL=http://localhost:3000
VITE_CONTROL_UI_BASE=http://localhost:18789
```

#### Gateway
Gateway auth requires `DATABASE_URL` to validate Gateway tokens:
```bash
DATABASE_URL=postgresql://localhost:5432/clawdbot_dev
```

## API Endpoints

See [API Reference](/auth/api-reference) for detailed documentation.

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login with email/password
- `POST /auth/logout` - Logout current session
- `POST /auth/logout-all` - Logout all sessions
- `POST /auth/refresh` - Refresh access token

### User Management
- `GET /auth/me` - Get current user info
- `POST /auth/check-user` - Check if user exists

### Email Verification
- `POST /auth/verify-email` - Verify email with token
- `POST /auth/resend-verification` - Resend verification email

### Password Reset
- `POST /auth/reset-password/request` - Request password reset
- `POST /auth/reset-password/confirm` - Confirm password reset

### Gateway Token
- `POST /auth/gateway-token` - Exchange JWT for Gateway token

### OAuth
- `GET /auth/oauth/google/url` - Get Google OAuth URL
- `POST /auth/oauth/google/callback` - Handle Google callback
- `GET /auth/oauth/apple/url` - Get Apple OAuth URL
- `POST /auth/oauth/apple/callback` - Handle Apple callback

## Development

### Running Auth API
```bash
cd /path/to/clawdbot
pnpm install
# Ensure DATABASE_URL is set in .env.dashboard
node --import tsx src/dashboard-server.ts
```

### Running Auth UI
```bash
cd ui/auth
pnpm install
pnpm dev -- --port 5173
```

### Database Migrations
```bash
pnpm db:migrate
```

### Testing
```bash
pnpm test src/auth
```

## Troubleshooting

### Database not initialized error in Gateway
**Symptom:** Gateway logs show token validation failures with "token_mismatch" error when using 64-char hex tokens.

**Cause:** Gateway process doesn't have a database connection initialized. The gateway initializes the database from `DATABASE_URL` environment variable in `server.impl.ts:93-120`.

**Solution:**
1. Ensure `DATABASE_URL` is set in the Gateway environment
2. Check gateway logs for "gateway: database initialized" or database initialization errors
3. Verify the database connection string format: `postgresql://user:password@host:port/database`
4. If using static tokens (not 64-char hex), database is not required

### JWT Token Expired
**Symptom:** Frontend shows "unauthorized" error.

**Solution:** Frontend automatically refreshes tokens via interceptor. Check that `refreshToken` exists in localStorage.

### Gateway Token Expired
**Symptom:** WebSocket disconnects after 1 hour with "unauthorized" error.

**Current Behavior:** User must re-login to get new Gateway token.

## Related Documentation

- [Gateway Configuration](/gateway)
- [Database Setup](/reference/database)
- [Security Best Practices](/security)
- [Multi-Tenant Architecture](/concepts/multi-tenant)
