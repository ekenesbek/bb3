# Authentication Implementation Status

This document tracks the current implementation status of the Clawdbot authentication system.

## ✅ Implemented Features

### Core Authentication (src/auth/)
- ✅ User registration with email/password
- ✅ Email/password login
- ✅ JWT access tokens (15-minute lifetime)
- ✅ JWT refresh tokens (30-day lifetime)
- ✅ Automatic token refresh (via axios interceptor)
- ✅ Logout (single session)
- ✅ Logout all sessions
- ✅ Password hashing with bcrypt (12 rounds)
- ✅ Multi-tenant support (tenant per user)
- ✅ Audit logging for auth events

### Gateway Token Exchange
- ✅ Exchange JWT for Gateway token (`POST /auth/gateway-token`)
- ✅ Gateway token generation (64-char hex, 32 random bytes)
- ✅ Gateway token storage in database
- ✅ Gateway token validation in WebSocket connections
- ✅ User identity resolution from Gateway token
- ✅ Gateway token expiration (1 hour)
- ✅ Database initialization in Gateway startup

### Gateway Authentication (src/gateway/auth.ts)
- ✅ Gateway token validation (64-char hex tokens)
- ✅ Static token fallback (backward compatibility)
- ✅ Password authentication
- ✅ Tailscale authentication
- ✅ Multi-tenant isolation
- ✅ User email in auth result

### Auth UI (ui/auth/)
- ✅ Unified authentication flow (AuthPage.tsx)
  - Email check
  - Dynamic login/signup routing
  - Automatic JWT → Gateway token exchange
  - Redirect to Control UI with token
- ✅ Standalone pages:
  - LoginPage.tsx
  - SignupPage.tsx
  - EnterPasswordPage.tsx
  - CreatePasswordPage.tsx
  - ForgotPasswordPage.tsx
  - ResetPasswordPage.tsx
  - OAuthCallbackPage.tsx
- ✅ API client with automatic token refresh
- ✅ Token storage in localStorage
- ✅ Session persistence across page reloads

### Database Schema
- ✅ `users` table
- ✅ `tenants` table
- ✅ `user_sessions` table
- ✅ `gateway_tokens` table with indexes

### OAuth
- ✅ Google OAuth (server-side flow)
- ✅ Apple OAuth (server-side flow)
- ✅ Apple OAuth (client-side flow for iOS/Android)

### Email Services
- ✅ Email verification
- ✅ Password reset
- ✅ SMTP integration

## ⚠️ Known Limitations

### Gateway Token Lifecycle
- ❌ No auto-refresh mechanism for Gateway tokens
- ❌ Users must re-login after 1-hour token expiry
- ❌ No WebSocket protocol for token refresh

**Impact:** Poor UX for long-running connections

**Workaround:** Increase token lifetime or implement manual refresh flow

### Database Dependency
- ⚠️ Gateway tokens require database connection
- ✅ Database initialization implemented in Gateway startup
- ✅ Logs warning if DATABASE_URL not set
- ✅ Static tokens work without database (fallback)

**Impact:** Multi-user auth requires database; single-user setups can use static tokens

### Token Storage
- ⚠️ Tokens stored in localStorage (client-side)
- ❌ Not using HTTP-only cookies
- ❌ CSRF protection not implemented

**Impact:** Vulnerable to XSS attacks

**Recommendation:** Move to HTTP-only cookies for production

## 📋 Future Enhancements

### Stateless Gateway Tokens
Replace database-backed Gateway tokens with signed JWTs:
- No database lookup needed
- Faster validation
- Better scalability

**Trade-off:** Harder to revoke (need blacklist)

### WebSocket Token Refresh
Add protocol message for seamless token refresh:
```typescript
{
  "type": "refresh_gateway_token",
  "jwt": "<new_jwt_access_token>"
}
```

**Benefits:**
- No disconnection during refresh
- Better UX
- Security maintained

### Token Rotation
Issue new Gateway token and invalidate old one on refresh

### Rate Limiting
- Login attempts: 5 per minute per IP
- Registration: 3 per hour per IP
- Password reset: 3 per hour per email

### Security Improvements
- HTTP-only cookies for token storage
- CSRF protection
- Rate limiting
- Session fingerprinting
- Suspicious activity detection

## 📝 Configuration Summary

### Auth API (.env.dashboard)
```bash
PORT=3000
DASHBOARD_URL=http://localhost:5173

# JWT Secrets (CHANGE IN PRODUCTION!)
ACCESS_TOKEN_SECRET=dev-access-secret-change-in-production
REFRESH_TOKEN_SECRET=dev-refresh-secret-change-in-production

# Database (required)
DATABASE_URL=postgresql://localhost:5432/clawdbot_dev

# Email (optional)
EMAIL_FROM=noreply@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587

# OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
```

### Auth UI (.env)
```bash
VITE_API_URL=http://localhost:3000
VITE_CONTROL_UI_BASE=http://localhost:18789
```

### Gateway
```bash
# Required for Gateway token validation
DATABASE_URL=postgresql://localhost:5432/clawdbot_dev

# Optional: static token fallback
CLAWDBOT_GATEWAY_TOKEN=your-static-token

# Or use password mode
CLAWDBOT_GATEWAY_PASSWORD=your-password
```

## 🔄 Authentication Flow

### Complete Flow (Production)
1. User visits Auth UI (`http://localhost:5173`)
2. User enters email → UI checks if user exists
3. User enters password → Login/Register
4. Auth API validates credentials, returns JWT tokens
5. UI stores tokens in localStorage
6. UI exchanges JWT for Gateway token via `POST /auth/gateway-token`
7. Auth API generates 64-char hex token, stores in database
8. UI redirects to Control UI with Gateway token in URL
9. Control UI connects WebSocket with Gateway token
10. Gateway validates token against database
11. Gateway resolves user identity and tenant
12. WebSocket connection established ✅

### Simplified Flow (Development)
1. Configure static token: `CLAWDBOT_GATEWAY_TOKEN=dev-token`
2. Connect with static token (no database required)
3. Single-user access ✅

## 📊 Token Comparison

| Token Type | Lifetime | Storage | Renewable | Revocable | Database Required |
|------------|----------|---------|-----------|-----------|-------------------|
| JWT Access | 15 min | localStorage | ✅ Yes (via refresh) | ✅ Yes (revoke session) | ✅ Yes |
| JWT Refresh | 30 days | localStorage | ✅ Yes (rotates) | ✅ Yes (revoke session) | ✅ Yes |
| Gateway Token | 1 hour | Database | ❌ No (must re-login) | ✅ Yes (set revoked_at) | ✅ Yes |
| Static Token | Forever | Config/Env | ❌ No | ❌ No (must restart) | ❌ No |

## 🧪 Testing

### Manual Testing
```bash
# 1. Start Auth API
cd /path/to/clawdbot
node --import tsx src/dashboard-server.ts

# 2. Start Auth UI
cd ui/auth
pnpm dev -- --port 5173

# 3. Start Gateway with database
DATABASE_URL=postgresql://localhost:5432/clawdbot_dev clawdbot gateway run

# 4. Test flow
# - Visit http://localhost:5173
# - Register new account
# - Should redirect to http://localhost:18789/chat?token=...
# - WebSocket should connect successfully
```

### Database Validation
```sql
-- Check Gateway token
SELECT
  token,
  user_id,
  tenant_id,
  expires_at,
  revoked_at,
  created_at
FROM gateway_tokens
WHERE token = 'YOUR_TOKEN_HERE';

-- Check active sessions
SELECT
  us.id,
  u.email,
  us.created_at,
  us.last_used_at
FROM user_sessions us
JOIN users u ON u.id = us.user_id
WHERE us.revoked_at IS NULL;
```

## 📚 Documentation Links

- [Authentication Overview](/auth)
- [Gateway Token Exchange Flow](/auth/flows/gateway-token-exchange)
- [API Reference](/auth/api-reference)
- [Gateway Authentication](/gateway/authentication)

## 🐛 Known Issues

None currently tracked. Previous database initialization issue has been resolved.

## ✅ Verification Checklist

Before deployment, verify:
- [ ] DATABASE_URL is set in Gateway environment
- [ ] JWT secrets are changed from defaults
- [ ] DASHBOARD_URL points to correct frontend
- [ ] SMTP configured if email verification needed
- [ ] Gateway logs show "gateway: database initialized"
- [ ] Test user can register → login → connect to Gateway
- [ ] Gateway token validation works (check logs for method: "token", user: email)
- [ ] Static token fallback works without database

---

Last Updated: 2026-01-31
