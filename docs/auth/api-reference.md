# Auth API Reference

Base URL: `http://localhost:3000` (development)

All endpoints return JSON responses. Authentication required endpoints expect `Authorization: Bearer <token>` header.

## Table of Contents

- [Authentication](#authentication)
- [User Management](#user-management)
- [Email Verification](#email-verification)
- [Password Reset](#password-reset)
- [Gateway Token](#gateway-token)
- [OAuth](#oauth)
- [Error Responses](#error-responses)

## Authentication

### Register

Create a new user account.

**Endpoint:** `POST /auth/register`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "displayName": "John Doe",
  "locale": "en-US",
  "country": "US"
}
```

**Response:** `201 Created`
```json
{
  "user": {
    "id": "64967e12-25c8-47ae-8cda-c1f75082d5ff",
    "email": "user@example.com",
    "displayName": "John Doe",
    "emailVerified": false
  },
  "tenant": {
    "id": "d43c2d4f-165a-4bca-8e3c-65351b09e4ab",
    "name": "John Doe's Workspace",
    "planType": "free"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Errors:**
- `400 Bad Request` - Invalid email or password
- `400 Bad Request` - Email already exists

---

### Login

Authenticate with email and password.

**Endpoint:** `POST /auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": "64967e12-25c8-47ae-8cda-c1f75082d5ff",
    "email": "user@example.com",
    "displayName": "John Doe",
    "emailVerified": true
  },
  "tenant": {
    "id": "d43c2d4f-165a-4bca-8e3c-65351b09e4ab",
    "name": "John Doe's Workspace",
    "planType": "free"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Errors:**
- `401 Unauthorized` - Invalid email or password
- `401 Unauthorized` - Account suspended

---

### Logout

Logout current session (revokes refresh token).

**Endpoint:** `POST /auth/logout`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:** `200 OK`
```json
{
  "message": "Logged out successfully"
}
```

---

### Logout All

Logout all sessions for current user.

**Endpoint:** `POST /auth/logout-all`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:** `200 OK`
```json
{
  "message": "All sessions logged out"
}
```

---

### Refresh Token

Exchange refresh token for new access token.

**Endpoint:** `POST /auth/refresh`

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:** `200 OK`
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors:**
- `401 Unauthorized` - Invalid or expired refresh token

---

## User Management

### Get Current User

Get authenticated user information.

**Endpoint:** `GET /auth/me`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": "64967e12-25c8-47ae-8cda-c1f75082d5ff",
    "email": "user@example.com",
    "displayName": "John Doe",
    "username": "johndoe",
    "avatarUrl": "https://example.com/avatar.jpg",
    "emailVerified": true,
    "role": "user",
    "locale": "en-US",
    "timezone": "America/New_York",
    "createdAt": "2026-01-30T20:00:00Z"
  }
}
```

---

### Check User Exists

Check if user exists by email (for login flow).

**Endpoint:** `POST /auth/check-user`

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:** `200 OK`
```json
{
  "exists": true
}
```

---

## Email Verification

### Verify Email

Verify email address with token (from email link).

**Endpoint:** `POST /auth/verify-email`

**Request Body:**
```json
{
  "token": "abc123def456..."
}
```

**Response:** `200 OK`
```json
{
  "message": "Email verified successfully",
  "emailVerified": true
}
```

**Errors:**
- `400 Bad Request` - Invalid or expired token

---

### Resend Verification Email

Resend verification email to current user.

**Endpoint:** `POST /auth/resend-verification`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:** `200 OK`
```json
{
  "message": "Verification email sent"
}
```

---

## Password Reset

### Request Password Reset

Request password reset email.

**Endpoint:** `POST /auth/reset-password/request`

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:** `200 OK`
```json
{
  "message": "If the email exists, a reset link has been sent"
}
```

**Note:** Always returns success to prevent email enumeration.

---

### Reset Password

Reset password with token (from email link).

**Endpoint:** `POST /auth/reset-password/confirm`

**Request Body:**
```json
{
  "token": "abc123def456...",
  "newPassword": "newsecurepassword123"
}
```

**Response:** `200 OK`
```json
{
  "message": "Password reset successfully"
}
```

**Errors:**
- `400 Bad Request` - Invalid or expired token
- `400 Bad Request` - Weak password

---

## Gateway Token

### Exchange JWT for Gateway Token

Exchange access token for Gateway token (for WebSocket connection).

**Endpoint:** `POST /auth/gateway-token`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:** `200 OK`
```json
{
  "gatewayToken": "e981b257fe5f8bd1dca9e9310970f66a7927fb11dca48e0865d3029a12383958",
  "expiresAt": "2026-01-30T21:30:43.643Z"
}
```

**Token Format:**
- 64 hexadecimal characters
- Cryptographically random (32 bytes)
- Stored in database with expiration

**Errors:**
- `401 Unauthorized` - Invalid or expired access token

**See Also:** [Gateway Token Exchange Flow](/auth/flows/gateway-token-exchange)

---

## OAuth

### Google OAuth

#### Get Google Auth URL

Get URL to redirect user to Google OAuth consent screen.

**Endpoint:** `GET /auth/oauth/google/url`

**Response:** `200 OK`
```json
{
  "url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=..."
}
```

---

#### Handle Google Callback

Process OAuth callback from Google.

**Endpoint:** `POST /auth/oauth/google/callback`

**Request Body:**
```json
{
  "code": "4/0AY0e-g7..."
}
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": "64967e12-25c8-47ae-8cda-c1f75082d5ff",
    "email": "user@gmail.com",
    "displayName": "John Doe"
  },
  "tenant": {
    "id": "d43c2d4f-165a-4bca-8e3c-65351b09e4ab",
    "name": "John Doe's Workspace"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### Apple OAuth

#### Get Apple Auth URL

Get URL to redirect user to Apple Sign In.

**Endpoint:** `GET /auth/oauth/apple/url`

**Query Parameters:**
- `state` (optional) - OAuth state parameter
- `scope` (optional) - Comma-separated scopes (e.g., "name,email")

**Response:** `200 OK`
```json
{
  "url": "https://appleid.apple.com/auth/authorize?client_id=..."
}
```

---

#### Handle Apple Server Callback

Process server-side Apple OAuth callback.

**Endpoint:** `POST /auth/oauth/apple/callback`

**Request Body:**
```json
{
  "code": "c1234...",
  "id_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "name": {
      "firstName": "John",
      "lastName": "Doe"
    },
    "email": "user@privaterelay.appleid.com"
  }
}
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": "64967e12-25c8-47ae-8cda-c1f75082d5ff",
    "email": "user@privaterelay.appleid.com",
    "displayName": "John Doe"
  },
  "tenant": {
    "id": "d43c2d4f-165a-4bca-8e3c-65351b09e4ab",
    "name": "John Doe's Workspace"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

#### Handle Apple Client Callback

Process client-side Apple Sign In (from iOS/Android/Web SDK).

**Endpoint:** `POST /auth/oauth/apple/client`

**Request Body:**
```json
{
  "identityToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "authorizationCode": "c1234...",
  "user": {
    "name": {
      "firstName": "John",
      "lastName": "Doe"
    },
    "email": "user@privaterelay.appleid.com"
  }
}
```

**Response:** Same as server callback

---

## Error Responses

### Standard Error Format

All error responses follow this format:

```json
{
  "error": "Human-readable error message"
}
```

### HTTP Status Codes

- `200 OK` - Request successful
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Authentication required or failed
- `403 Forbidden` - User doesn't have permission
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource already exists (e.g., duplicate email)
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

### Common Error Messages

**Authentication Errors:**
```json
{ "error": "Invalid email or password" }
{ "error": "Account suspended" }
{ "error": "Invalid token" }
{ "error": "Token expired" }
```

**Validation Errors:**
```json
{ "error": "Email is required" }
{ "error": "Invalid email format" }
{ "error": "Password must be at least 8 characters" }
```

**OAuth Errors:**
```json
{ "error": "Apple Sign In not configured" }
{ "error": "Google OAuth not configured" }
{ "error": "Invalid OAuth code" }
```

## Rate Limiting

**Not yet implemented.** Future versions will include:
- `/auth/login`: 5 requests per minute per IP
- `/auth/register`: 3 requests per hour per IP
- `/auth/reset-password/request`: 3 requests per hour per email

## Security Headers

All responses include security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`

CORS enabled for configured domains (see `DASHBOARD_URL` env var).

## Token Lifetimes

| Token Type | Lifetime | Renewable |
|------------|----------|-----------|
| Access Token | 15 minutes | ✅ Yes (via refresh token) |
| Refresh Token | 30 days | ✅ Yes (rotates on refresh) |
| Gateway Token | 1 hour | ❌ No (must re-exchange JWT) |
| Email Verification Token | 24 hours | ❌ No |
| Password Reset Token | 1 hour | ❌ No |

## JWT Token Format

### Access Token Claims
```json
{
  "sub": "user-id",
  "tenant_id": "tenant-id",
  "email": "user@example.com",
  "role": "user",
  "type": "access",
  "iat": 1738267843,
  "exp": 1738268743
}
```

### Refresh Token Claims
```json
{
  "sub": "user-id",
  "type": "refresh",
  "iat": 1738267843,
  "exp": 1740859843
}
```

## Examples

### Complete Login Flow (curl)

```bash
# 1. Check if user exists
curl -X POST http://localhost:3000/auth/check-user \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'

# 2. Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"securepassword123"}' \
  -o login_response.json

# 3. Extract access token
ACCESS_TOKEN=$(jq -r '.tokens.accessToken' login_response.json)

# 4. Get user info
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# 5. Exchange for Gateway token
curl -X POST http://localhost:3000/auth/gateway-token \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -o gateway_token.json

# 6. Extract Gateway token
GATEWAY_TOKEN=$(jq -r '.gatewayToken' gateway_token.json)
echo "Gateway token: $GATEWAY_TOKEN"
```

### Automatic Token Refresh (JavaScript)

```javascript
// Axios interceptor (from ui/auth/src/dashboard/lib/api/auth.ts)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem("refreshToken");
        const { data } = await axios.post("/auth/refresh", { refreshToken });

        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, redirect to login
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
```

## Related Documentation

- [Authentication Overview](/auth)
- [Gateway Token Exchange Flow](/auth/flows/gateway-token-exchange)
