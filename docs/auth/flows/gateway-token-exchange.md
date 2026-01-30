# Gateway Token Exchange Flow

## Overview

The Gateway Token Exchange allows users to connect to the Clawdbot Gateway WebSocket server securely. Instead of using a static shared token, users exchange their JWT access token for a short-lived Gateway token.

## Why Gateway Tokens?

### Problems with Static Tokens
- ❌ All users share the same token
- ❌ Cannot revoke access for specific users
- ❌ No user identity in Gateway logs
- ❌ No multi-tenant isolation

### Benefits of Gateway Tokens
- ✅ Each user has their own token
- ✅ Can revoke access without affecting other users
- ✅ Gateway knows which user is connected
- ✅ Multi-tenant isolation
- ✅ Audit trail of Gateway connections
- ✅ Short-lived tokens reduce security risk

## Flow Diagram

```
┌──────────┐                ┌──────────┐                ┌──────────┐
│ Auth UI  │                │ Auth API │                │ Gateway  │
└──────────┘                └──────────┘                └──────────┘
     │                            │                            │
     │  1. User logs in           │                            │
     │ ──────────────────────────>│                            │
     │                            │                            │
     │  2. JWT Access Token       │                            │
     │    (15 min lifetime)       │                            │
     │ <──────────────────────────│                            │
     │                            │                            │
     │  3. Exchange JWT           │                            │
     │    for Gateway Token       │                            │
     │ ──────────────────────────>│                            │
     │                            │                            │
     │                            │  4. Validate JWT           │
     │                            │     (check signature,      │
     │                            │      expiration)           │
     │                            │                            │
     │                            │  5. Generate random        │
     │                            │     Gateway Token          │
     │                            │     (64 hex chars)         │
     │                            │                            │
     │                            │  6. Store in database      │
     │                            │     with expiration        │
     │                            │                            │
     │  7. Gateway Token          │                            │
     │    (1 hour lifetime)       │                            │
     │ <──────────────────────────│                            │
     │                            │                            │
     │  8. Redirect to Control UI │                            │
     │     with token in URL      │                            │
     │     (http://localhost:18789/chat?token=ABC...)         │
     │                                                          │
     │  9. WebSocket Connect                                   │
     │     with Gateway Token                                  │
     │ ────────────────────────────────────────────────────────>│
     │                            │                            │
     │                            │  10. Validate token        │
     │                            │ <──────────────────────────│
     │                            │      (check database,      │
     │                            │       expiration,          │
     │                            │       revocation)          │
     │                            │                            │
     │                            │  11. Return user info      │
     │                            │ ──────────────────────────>│
     │                            │                            │
     │  12. WebSocket Connected ✅                             │
     │ <────────────────────────────────────────────────────────│
```

## Implementation Details

### Step 1-2: User Login (JWT Generation)

**Frontend (Auth UI):**
```typescript
// ui/auth/pages/AuthPage.tsx
const result = await authApi.login(email, password);
// result.tokens = { accessToken: "eyJhbG...", refreshToken: "eyJhbG..." }

// Save tokens to localStorage
localStorage.setItem("cb.auth.tokens", JSON.stringify(result.tokens));
localStorage.setItem("cb.auth.user", JSON.stringify(result.user));
localStorage.setItem("cb.auth.tenant", JSON.stringify(result.tenant));

localStorage.setItem("accessToken", result.tokens.accessToken);
localStorage.setItem("refreshToken", result.tokens.refreshToken);
```

**Backend (Auth API):**
```typescript
// src/auth/auth-service.ts
async loginWithEmail({ email, password }) {
  // 1. Verify password
  const user = await db.query("SELECT * FROM users WHERE email = $1", [email]);
  const valid = await bcrypt.compare(password, user.password_hash);

  // 2. Create session
  const tokens = await this.createSession({ user });

  return { user, tenant, tokens };
}

private async createSession({ user }) {
  // Generate JWT tokens
  const accessToken = this.tokenService.generateAccessToken(user);
  const refreshToken = this.tokenService.generateRefreshToken(user);

  // Store session in database
  await db.query(
    "INSERT INTO user_sessions (user_id, refresh_token_hash) VALUES ($1, $2)",
    [user.id, hashToken(refreshToken)]
  );

  return { accessToken, refreshToken };
}
```

**JWT Access Token Payload:**
```json
{
  "sub": "64967e12-25c8-47ae-8cda-c1f75082d5ff",
  "tenant_id": "d43c2d4f-165a-4bca-8e3c-65351b09e4ab",
  "email": "user@example.com",
  "role": "user",
  "type": "access",
  "iat": 1738267843,
  "exp": 1738268743
}
```

### Step 3-7: Gateway Token Exchange

**Frontend (Auth UI):**
```typescript
// ui/auth/pages/AuthPage.tsx
const gatewayTokenResponse = await authApi.exchangeForGatewayToken(
  result.tokens.accessToken
);
// gatewayTokenResponse = {
//   gatewayToken: "e981b257fe5f8bd1dca9e9310970f66a7927fb11dca48e0865d3029a12383958",
//   expiresAt: "2026-01-30T21:30:43.643Z"
// }
```

**API Client:**
```typescript
// ui/auth/lib/api/auth.ts
exchangeForGatewayToken: async (accessToken: string) => {
  const response = await api.post("/auth/gateway-token", {}, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return response.data;
}
```

**Backend (Auth API):**
```typescript
// src/auth/routes.ts
router.post("/gateway-token", async (req, res) => {
  const authHeader = req.headers.authorization;
  const accessToken = authHeader.substring(7); // Remove "Bearer "

  const result = await authService.exchangeForGatewayToken(accessToken);

  res.json({
    gatewayToken: result.gatewayToken,
    expiresAt: result.expiresAt.toISOString(),
  });
});
```

**Auth Service:**
```typescript
// src/auth/auth-service.ts
async exchangeForGatewayToken(accessToken: string) {
  // 1. Validate JWT access token
  const payload = this.tokenService.verifyAccessToken(accessToken);
  if (!payload) {
    throw new Error("Invalid access token");
  }

  // 2. Generate random Gateway token (32 bytes = 64 hex chars)
  const gatewayToken = crypto.randomBytes(32).toString("hex");

  // 3. Set expiration (1 hour from now)
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  // 4. Store in database
  await db.query(
    `INSERT INTO gateway_tokens (token, user_id, tenant_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [gatewayToken, payload.sub, payload.tenant_id, expiresAt]
  );

  // 5. Audit log
  await this.auditLogger.log({
    tenantId: payload.tenant_id,
    userId: payload.sub,
    action: "gateway_token.created",
    status: "success",
    metadata: { expiresAt },
  });

  return { gatewayToken, expiresAt };
}
```

### Step 8: Redirect to Control UI

**Frontend (Auth UI):**
```typescript
// ui/auth/pages/AuthPage.tsx
const controlUiBase = import.meta.env.VITE_CONTROL_UI_BASE || "/";
const trimmedBase = controlUiBase.endsWith("/")
  ? controlUiBase.slice(0, -1)
  : controlUiBase;

window.location.assign(
  `${trimmedBase}/chat?token=${gatewayTokenResponse.gatewayToken}`
);
```

**URL Example:**
```
http://localhost:18789/chat?token=e981b257fe5f8bd1dca9e9310970f66a7927fb11dca48e0865d3029a12383958
```

### Step 9-12: WebSocket Connection with Gateway Token

**Frontend (Control UI):**
```typescript
// ui/control/connect.ts (pseudocode)
const urlParams = new URLSearchParams(window.location.search);
const gatewayToken = urlParams.get('token');

const ws = new WebSocket('ws://localhost:18789');

// Send connect message with Gateway token
ws.send(JSON.stringify({
  type: 'connect',
  auth: {
    token: gatewayToken
  }
}));
```

**Backend (Gateway):**
```typescript
// src/gateway/auth.ts
export async function authorizeGatewayConnect(params: {
  auth: ResolvedGatewayAuth;
  connectAuth?: ConnectAuth | null;
  req?: IncomingMessage;
  trustedProxies?: string[];
  tailscaleWhois?: TailscaleWhoisLookup;
}): Promise<GatewayAuthResult> {
  const { auth, connectAuth } = params;

  if (auth.mode === "token") {
    if (!auth.token) {
      return { ok: false, reason: "token_missing_config" };
    }
    if (!connectAuth?.token) {
      return { ok: false, reason: "token_missing" };
    }

    // Check if token is a gateway token (hex string, 64 chars)
    if (connectAuth.token.length === 64 && /^[0-9a-f]+$/i.test(connectAuth.token)) {
      try {
        const authService = new AuthService();
        const result = await authService.validateGatewayToken(connectAuth.token);
        if (result) {
          return { ok: true, method: "token", user: result.email };
        }
      } catch {
        // Invalid gateway token, continue to check static token
      }
    }

    // Check static gateway token (backward compatibility)
    if (!safeEqual(connectAuth.token, auth.token)) {
      return { ok: false, reason: "token_mismatch" };
    }
    return { ok: true, method: "token" };
  }

  return { ok: false, reason: "unauthorized" };
}
```

**Gateway Token Validation:**
```typescript
// src/auth/auth-service.ts
async validateGatewayToken(token: string) {
  const result = await db.query(
    `SELECT gt.user_id, gt.tenant_id, gt.expires_at, u.email
     FROM gateway_tokens gt
     JOIN users u ON u.id = gt.user_id
     WHERE gt.token = $1
       AND gt.expires_at > NOW()
       AND gt.revoked_at IS NULL`,
    [token]
  );

  if (result.rows.length === 0) {
    return null; // Token not found, expired, or revoked
  }

  return {
    userId: result.user_id,
    tenantId: result.tenant_id,
    email: result.email,
  };
}
```

## Database Schema

### `gateway_tokens` Table

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

-- Indexes for fast lookups
CREATE INDEX idx_gateway_tokens_token ON gateway_tokens(token);
CREATE INDEX idx_gateway_tokens_user_id ON gateway_tokens(user_id);
CREATE INDEX idx_gateway_tokens_expires_at ON gateway_tokens(expires_at);
```

**Example Row:**
```
id         | 550e8400-e29b-41d4-a716-446655440000
token      | e981b257fe5f8bd1dca9e9310970f66a7927fb11dca48e0865d3029a12383958
user_id    | 64967e12-25c8-47ae-8cda-c1f75082d5ff
tenant_id  | d43c2d4f-165a-4bca-8e3c-65351b09e4ab
expires_at | 2026-01-30 21:30:43.643
revoked_at | NULL
created_at | 2026-01-30 20:30:43.644
```

## Token Lifecycle

### Creation
1. User logs in → receives JWT access token
2. User requests Gateway token → Auth API validates JWT
3. Auth API generates random 64-char hex token
4. Token stored in database with 1-hour expiration
5. User receives Gateway token

### Validation
1. User connects to Gateway with token
2. Gateway checks token format (64 hex chars)
3. Gateway queries database:
   - Token exists?
   - Not expired? (`expires_at > NOW()`)
   - Not revoked? (`revoked_at IS NULL`)
4. If valid → connection accepted
5. If invalid → connection rejected

### Expiration
- **After 1 hour:** Token automatically expires
- **Database query:** `WHERE expires_at > NOW()` returns no rows
- **Result:** Validation fails, user must re-login

### Revocation
```typescript
// Revoke specific Gateway token
await db.query(
  "UPDATE gateway_tokens SET revoked_at = NOW() WHERE token = $1",
  [token]
);

// Revoke all Gateway tokens for a user
await db.query(
  "UPDATE gateway_tokens SET revoked_at = NOW() WHERE user_id = $1",
  [userId]
);
```

## Security Considerations

### Token Format
- **Random Generation:** `crypto.randomBytes(32)` provides cryptographically secure randomness
- **Hex Encoding:** 64 hexadecimal characters (0-9, a-f)
- **Entropy:** 256 bits of entropy (2^256 possible tokens)
- **Collision Probability:** Negligible (database UNIQUE constraint provides additional safety)

### Token Storage
- **Database:** Tokens stored in plaintext (necessary for validation)
- **Database Security:** Ensure database access is restricted
- **Transport:** Always use HTTPS/WSS in production
- **No Logging:** Never log full tokens (only first 8 chars for debugging)

### Expiration Strategy
- **Current:** 1 hour (short-lived for security)
- **Trade-off:** Security vs User Experience
- **Recommendation:** Match JWT access token lifetime (15 minutes) or implement auto-refresh

### Multi-Tenant Isolation
- Each Gateway token is linked to both `user_id` and `tenant_id`
- Ensures users can only access their tenant's data
- Foreign key constraints prevent orphaned tokens

## Current Limitations

### 1. Gateway Token Expires After 1 Hour
**Problem:** User is disconnected and must re-login.

**Impact:** Poor UX for long-running Gateway connections.

**Solutions:**
- **Short Term:** Increase lifetime to 24 hours (match JWT)
- **Long Term:** Implement auto-refresh via WebSocket protocol

### 2. No Auto-Refresh Mechanism
**Problem:** No way to refresh Gateway token without re-login.

**Impact:** Users must manually re-authenticate.

**Solutions:**
- Add `POST /auth/gateway-token/refresh` endpoint
- WebSocket protocol extension for token refresh
- Frontend automatically exchanges new JWT for new Gateway token

### 3. Database Dependency
**Problem:** Gateway requires database connection to validate Gateway tokens (64-char hex).

**Impact:** Gateway won't work for multi-user auth if database is unavailable. Static tokens still work without database.

**Current Status:** Database is initialized in Gateway startup (`src/gateway/server.impl.ts:93-120`) when `DATABASE_URL` is set.

**Solutions:**
- **Current:** Database initialization is working when `DATABASE_URL` is provided
- **Fallback:** Static tokens work without database for single-user/dev setups
- **Long Term:** Consider signed stateless tokens (JWT-based Gateway tokens) to eliminate database dependency

## Future Enhancements

### 1. Stateless Gateway Tokens (JWT-based)
Instead of random tokens stored in database, use signed JWTs:

```typescript
const gatewayToken = jwt.sign(
  {
    sub: userId,
    tenant_id: tenantId,
    type: 'gateway',
    exp: Math.floor(Date.now() / 1000) + 3600
  },
  GATEWAY_TOKEN_SECRET
);
```

**Benefits:**
- No database lookup needed (stateless validation)
- Faster validation
- Scales better (no database load)

**Trade-offs:**
- Harder to revoke (need blacklist or check with Auth API)
- Larger token size

### 2. WebSocket Token Refresh Protocol
Add new Gateway protocol message:

```typescript
// Client → Gateway
{
  "type": "refresh_gateway_token",
  "jwt": "<new_jwt_access_token>"
}

// Gateway → Client
{
  "type": "gateway_token_refreshed",
  "token": "<new_gateway_token>",
  "expiresAt": "2026-01-31T21:00:00Z"
}
```

**Benefits:**
- Seamless token refresh without disconnection
- Better UX (no manual re-login)
- Security maintained (short-lived tokens)

### 3. Token Rotation on Refresh
Issue new Gateway token and invalidate old one:

```typescript
async refreshGatewayToken(oldToken: string, jwt: string) {
  // 1. Validate old token
  const oldTokenData = await this.validateGatewayToken(oldToken);

  // 2. Revoke old token
  await db.query(
    "UPDATE gateway_tokens SET revoked_at = NOW() WHERE token = $1",
    [oldToken]
  );

  // 3. Issue new token
  return this.exchangeForGatewayToken(jwt);
}
```

## Troubleshooting

### Database not initialized error

**Symptoms:**
- Gateway logs: `reason=token_mismatch`
- Control UI: "disconnected (1008): unauthorized: gateway token mismatch"

**Root Cause:**
Gateway started without `DATABASE_URL` (or database initialization failed), so token validation fails.

**Diagnosis:**
```bash
# Check if Gateway token exists in database
psql -d clawdbot_dev -c "
  SELECT token, expires_at FROM gateway_tokens
  WHERE token = 'YOUR_TOKEN_HERE';
"

# If token exists and not expired, the issue is database connection
```

**Solution:**
Set `DATABASE_URL` in the Gateway environment and restart the Gateway.

### Gateway Token Expired

**Symptoms:**
- WebSocket disconnects after 1 hour
- Error: "unauthorized: gateway token mismatch"

**Root Cause:**
Gateway token has 1-hour lifetime and is now expired.

**Diagnosis:**
```sql
SELECT token, expires_at, NOW()
FROM gateway_tokens
WHERE token = 'YOUR_TOKEN_HERE';

-- If expires_at < NOW(), token is expired
```

**Solution:**
- Re-login to get a new token.

### Multiple Gateway Tokens for Same User

**This is normal!** Users can have multiple active Gateway tokens:
- Different devices (desktop, mobile)
- Different browser tabs
- Different WebSocket connections

**Query:**
```sql
SELECT COUNT(*) FROM gateway_tokens
WHERE user_id = 'USER_ID'
  AND expires_at > NOW()
  AND revoked_at IS NULL;
```

## Related Documentation

- [Authentication Overview](/auth)
- [API Reference](/auth/api-reference)
