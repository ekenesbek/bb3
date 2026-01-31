---
summary: "Gateway authentication: token, password, OAuth, and multi-tenant auth"
read_when:
  - Setting up Gateway authentication
  - Debugging Gateway connection issues
  - Understanding authentication flows
  - Configuring multi-tenant access
---
# Gateway Authentication

Clawdbot Gateway supports multiple authentication methods for WebSocket connections:

1. **Gateway Tokens** - Multi-tenant JWT-derived tokens (recommended for production)
2. **Static Tokens** - Shared secret tokens (simple, backward compatible)
3. **Password Authentication** - Password-based access
4. **Tailscale Authentication** - Identity from Tailscale network

For model provider authentication (Anthropic, OpenRouter, etc.), see [Model Authentication](#model-authentication).

## Gateway Authentication Methods

### 1. Gateway Tokens (Multi-Tenant)

**Best for:** Production deployments with multiple users

Gateway tokens are short-lived, user-specific tokens derived from JWT authentication. Each user gets their own token linked to their account.

**Setup:**
1. Deploy the Auth API (`src/dashboard-server.ts`) with database
2. Users authenticate via Auth UI (`ui/auth`)
3. Auth API exchanges JWT for Gateway token
4. Users connect to Gateway with their token

**Configuration:**
```bash
# Gateway needs DATABASE_URL to validate tokens
DATABASE_URL=postgresql://localhost:5432/clawdbot_dev

# Gateway auth mode (default: token)
# Set via config or env
export CLAWDBOT_GATEWAY_TOKEN="your-static-fallback-token"
```

**Benefits:**
- ✅ Multi-tenant isolation
- ✅ Per-user audit trails
- ✅ Revocable access
- ✅ User identity in logs

**Token Format:** 64 hexadecimal characters (e.g., `e981b257fe5f8bd1dca9e9310970f66a7927fb11dca48e0865d3029a12383958`)

**How it works:**
1. User logs in via Auth UI → receives JWT access token
2. Auth UI exchanges JWT for Gateway token via `POST /auth/gateway-token`
3. Gateway token stored in database with 1-hour expiration
4. User connects to Gateway WebSocket with Gateway token
5. Gateway validates token against database:
   - Token exists in `gateway_tokens` table
   - Not expired (`expires_at > NOW()`)
   - Not revoked (`revoked_at IS NULL`)
6. Gateway resolves user identity and tenant from database

**Database initialization:**
Gateway automatically initializes the database connection from `DATABASE_URL` environment variable during startup (`src/gateway/server.impl.ts:93-120`). If `DATABASE_URL` is not set, Gateway logs a warning and Gateway token validation will fail (static tokens still work).

**See also:** [/auth](/auth) and [/auth/flows/gateway-token-exchange](/auth/flows/gateway-token-exchange)

### 2. Static Tokens

**Best for:** Single-user setups, development, backward compatibility

A shared secret token configured on the Gateway. All clients use the same token.

**Setup:**
```bash
# Set via environment variable
export CLAWDBOT_GATEWAY_TOKEN="your-secret-token-here"

# Or via config file (~/.clawdbot/config.json)
clawdbot config set gateway.auth.token "your-secret-token-here"
clawdbot config set gateway.auth.mode token
```

**Benefits:**
- ✅ Simple setup
- ✅ No database required
- ✅ Works offline

**Trade-offs:**
- ❌ No user identity
- ❌ Cannot revoke per-user
- ❌ All users share same token

### 3. Password Authentication

**Best for:** Quick demos, single-user access

Simple password-based authentication.

**Setup:**
```bash
export CLAWDBOT_GATEWAY_PASSWORD="your-password"

# Or via config
clawdbot config set gateway.auth.password "your-password"
clawdbot config set gateway.auth.mode password
```

### 4. Tailscale Authentication

**Best for:** Private networks, team deployments

Authenticates users via Tailscale identity when Gateway is exposed via `tailscale serve`.

**Setup:**
```bash
# Enable Tailscale serve mode
clawdbot config set gateway.tailscale.mode serve

# Auth automatically allows Tailscale users
clawdbot config set gateway.auth.allowTailscale true
```

**Benefits:**
- ✅ No additional credentials
- ✅ Uses existing Tailscale identity
- ✅ Network-level security

---

## Model Authentication

Clawdbot supports OAuth and API keys for model providers. For Anthropic
accounts, we recommend using an **API key**. For Claude subscription access,
use the long‑lived token created by `claude setup-token`.

See [/concepts/oauth](/concepts/oauth) for the full OAuth flow and storage
layout.

### Recommended Anthropic setup (API key)

If you're using Anthropic API accounts, use an API key (this is for **model provider** authentication, not Gateway authentication).

1) Create an API key in the Anthropic Console.
2) Put it on the **gateway host** (the machine running `clawdbot gateway`).

```bash
export ANTHROPIC_API_KEY="..."
clawdbot models status
```

3) If the Gateway runs under systemd/launchd, prefer putting the key in
`~/.clawdbot/.env` so the daemon can read it:

```bash
cat >> ~/.clawdbot/.env <<'EOF'
ANTHROPIC_API_KEY=...
EOF
```

Then restart the daemon (or restart your Gateway process) and re-check:

```bash
clawdbot models status
clawdbot doctor
```

If you’d rather not manage env vars yourself, the onboarding wizard can store
API keys for daemon use: `clawdbot onboard`.

See [Help](/help) for details on env inheritance (`env.shellEnv`,
`~/.clawdbot/.env`, systemd/launchd).

### Anthropic: setup-token (subscription auth)

For Anthropic model provider authentication, the recommended path is an **API key**. If you're using a Claude
subscription, the setup-token flow is also supported. Run it on the **gateway host**:

```bash
claude setup-token
```

Then paste it into Clawdbot:

```bash
clawdbot models auth setup-token --provider anthropic
```

If the token was created on another machine, paste it manually:

```bash
clawdbot models auth paste-token --provider anthropic
```

If you see an Anthropic error like:

```
This credential is only authorized for use with Claude Code and cannot be used for other API requests.
```

…use an Anthropic API key instead.

Manual token entry (any provider; writes `auth-profiles.json` + updates config):

```bash
clawdbot models auth paste-token --provider anthropic
clawdbot models auth paste-token --provider openrouter
```

Automation-friendly check (exit `1` when expired/missing, `2` when expiring):

```bash
clawdbot models status --check
```

Optional ops scripts (systemd/Termux) are documented here:
[/automation/auth-monitoring](/automation/auth-monitoring)

> `claude setup-token` requires an interactive TTY.

## Checking model auth status

```bash
clawdbot models status
clawdbot doctor
```

## Controlling which credential is used

### Per-session (chat command)

Use `/model <alias-or-id>@<profileId>` to pin a specific provider credential for the current session (example profile ids: `anthropic:default`, `anthropic:work`).

Use `/model` (or `/model list`) for a compact picker; use `/model status` for the full view (candidates + next auth profile, plus provider endpoint details when configured).

### Per-agent (CLI override)

Set an explicit auth profile order override for an agent (stored in that agent’s `auth-profiles.json`):

```bash
clawdbot models auth order get --provider anthropic
clawdbot models auth order set --provider anthropic anthropic:default
clawdbot models auth order clear --provider anthropic
```

Use `--agent <id>` to target a specific agent; omit it to use the configured default agent.

## Troubleshooting

### “No credentials found”

If the Anthropic token profile is missing, run `claude setup-token` on the
**gateway host**, then re-check:

```bash
clawdbot models status
```

### Token expiring/expired

Run `clawdbot models status` to confirm which profile is expiring. If the profile
is missing, rerun `claude setup-token` and paste the token again.

## Troubleshooting Gateway Authentication

### Gateway Token Validation Fails

**Symptom:** WebSocket connection fails with "token_mismatch" when using 64-character hex tokens.

**Cause:** Database not initialized or not reachable.

**Solution:**
1. Check Gateway logs for database initialization:
   ```bash
   # Look for "gateway: database initialized" or errors
   tail -f /tmp/clawdbot-gateway.log
   ```

2. Verify `DATABASE_URL` is set:
   ```bash
   echo $DATABASE_URL
   ```

3. Test database connection:
   ```bash
   psql "$DATABASE_URL" -c "SELECT 1"
   ```

4. Restart Gateway with DATABASE_URL:
   ```bash
   DATABASE_URL=postgresql://localhost:5432/clawdbot_dev clawdbot gateway run
   ```

### Static Token Not Working

**Symptom:** WebSocket connection fails with "token_mismatch" when using static token.

**Solution:**
1. Verify token is configured:
   ```bash
   clawdbot config get gateway.auth.token
   ```

2. Check auth mode:
   ```bash
   clawdbot config get gateway.auth.mode
   # Should be "token"
   ```

3. Ensure client uses the exact same token (case-sensitive)

### Mixed Token Types

Gateway supports both Gateway tokens (64-char hex) and static tokens simultaneously:
- If token is 64 hex chars → validates against database first
- If database validation fails or token format doesn't match → falls back to static token check
- This provides backward compatibility while enabling multi-user auth

## Requirements

### For Model Provider Authentication
- Claude Max or Pro subscription (for `claude setup-token`)
- Claude Code CLI installed (`claude` command available)
- Or Anthropic API key

### For Gateway Authentication
- **Gateway Tokens:** PostgreSQL database, Auth API running, `DATABASE_URL` set
- **Static Tokens:** No additional requirements
- **Password:** No additional requirements
- **Tailscale:** Tailscale installed and running in serve mode
