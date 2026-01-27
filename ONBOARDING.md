# Clawdbot Developer Onboarding Guide

**Welcome to Clawdbot!** This guide will help you understand the system architecture and start contributing within a day.

## Table of Contents
1. [What is Clawdbot?](#what-is-clawdbot)
2. [Architecture Overview](#architecture-overview)
3. [Component Map](#component-map)
4. [Entry Points & Execution Flow](#entry-points--execution-flow)
5. [Agent Flow: Prompt to Execution](#agent-flow-prompt-to-execution)
6. [Task & Session Management](#task--session-management)
7. [State Management](#state-management)
8. [External Dependencies](#external-dependencies)
9. [Key Data Models](#key-data-models)
10. [Quick Start Guide](#quick-start-guide)
11. [Development Workflow](#development-workflow)
12. [Testing Strategy](#testing-strategy)
13. [Common Patterns](#common-patterns)
14. [Next Steps](#next-steps)

---

## What is Clawdbot?

Clawdbot is a **multi-channel agentic AI gateway** that:
- Routes messages from various platforms (Telegram, Discord, Slack, Signal, WhatsApp, etc.) to AI agents
- Executes agent responses with tool capabilities (bash, web browsing, file operations)
- Manages sessions, routing, and state across channels
- Supports plugins for extensibility
- Runs as a CLI, desktop app (macOS/iOS/Android), or gateway server

**Key Capabilities:**
- Multi-channel messaging integration
- Agentic AI with tool execution (powered by Claude, GPT, Gemini, etc.)
- Session-based conversation persistence
- Dynamic routing and agent assignment
- Plugin system for custom tools, channels, and hooks
- Real-time streaming via WebSocket
- Mobile and desktop client support

---

## Architecture Overview

Clawdbot follows a **modular, plugin-based architecture** with these core layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    Entry Layer (CLI/Gateway)                │
│   entry.ts → cli/run-main.ts → commands/ + gateway/        │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐      ┌─────▼──────┐    ┌────▼─────┐
    │  CLI    │      │  Commands  │    │ Gateway  │
    │ Program │      │   Module   │    │  Server  │
    └────┬────┘      └─────┬──────┘    └────┬─────┘
         │                 │                 │
         └─────────┬───────┴─────────┬───────┘
                   │                 │
            ┌──────▼─────┐    ┌──────▼────────┐
            │   Agents   │    │   Gateway     │
            │  Execution │    │   Methods     │
            └──────┬─────┘    └──────┬────────┘
                   │                 │
         ┌─────────┴─────────┬───────┴─────────┐
         │                   │                 │
    ┌────▼──────┐    ┌──────▼─────┐    ┌──────▼───────┐
    │  Routing  │    │  Channels  │    │  Messaging   │
    │& Sessions │    │ (Telegram, │    │  Outbound    │
    └────┬──────┘    │ Discord...)│    └──────┬───────┘
         │           └──────┬─────┘           │
         │                  │                 │
    ┌────▼──────────────────▼────────────────▼──────┐
    │      Config, Plugins, Hooks, Memory           │
    └────────────────────────────────────────────────┘
         │                   │                 │
    ┌────▼──────┐    ┌──────▼─────┐    ┌──────▼───────┐
    │   Infra   │    │  Providers │    │    Media     │
    │ Utilities │    │ (Auth/AI)  │    │   Pipeline   │
    └───────────┘    └────────────┘    └──────────────┘
```

**Architectural Patterns:**
1. **Command Pattern**: CLI commands are registered and dispatched via Commander.js
2. **Plugin Architecture**: Tools, channels, hooks, and providers are extensible via plugins
3. **Dependency Injection**: `createDefaultDeps()` provides config, sessions, gateway client
4. **Event-Driven**: Hooks and WebSocket events for real-time updates
5. **Session-Based Routing**: Messages route to agents via binding rules and session keys
6. **Stream Processing**: Chunked responses with debouncing for real-time UX

---

## Component Map

### Core Directories

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| **`src/cli/`** | CLI program setup and command wiring | `run-main.ts`, `program/build-program.ts`, `deps.ts` |
| **`src/commands/`** | Command implementations | `agent.ts`, `message.ts`, `config-cli.ts`, `status.command.ts` |
| **`src/agents/`** | Agent execution engines | `cli-runner.ts`, `pi-embedded.ts`, `model-selection.ts`, `tools/` |
| **`src/gateway/`** | Gateway server and WebSocket/HTTP handlers | `server.impl.ts`, `server-methods.ts`, `server-ws-runtime.ts` |
| **`src/channels/`** | Channel abstraction and plugin system | `dock.ts`, `plugins/types.plugin.ts` |
| **`src/telegram/`** | Telegram bot integration | `bot-handlers.ts`, `send.ts` |
| **`src/discord/`** | Discord bot integration | `monitor.ts`, `chunk.ts` |
| **`src/slack/`** | Slack bot integration | `monitor.ts`, `send.ts` |
| **`src/signal/`** | Signal client integration | `monitor.ts`, `client.ts` |
| **`src/imessage/`** | iMessage integration (macOS) | `monitor.ts`, `service.ts` |
| **`src/web/`** | WhatsApp Web (Baileys) | `client.ts`, `inbound.ts` |
| **`src/routing/`** | Session routing and binding logic | `resolve-route.ts`, `session-key.ts`, `bindings.ts` |
| **`src/config/`** | Configuration types and loaders | `types.ts`, `loader.ts`, `sessions.ts` |
| **`src/plugins/`** | Plugin system (discovery, loading, registry) | `registry.ts`, `discovery.ts`, `loader.ts`, `hooks.ts` |
| **`src/media/`** | Media fetching and processing | `fetch.ts`, `store.ts`, `image-ops.ts`, `mime.ts` |
| **`src/providers/`** | AI model providers (Anthropic, OpenAI, etc.) | Various provider implementations |
| **`src/memory/`** | Session memory and context | Memory management utilities |
| **`src/infra/`** | Infrastructure utilities | `agent-events.ts`, `heartbeat-runner.ts`, `device-auth-store.ts` |
| **`extensions/`** | Plugin extensions (channels, memory, tools) | `extensions/*/` (matrix, msteams, memory-*, etc.) |
| **`apps/`** | Native apps (macOS, iOS, Android) | `apps/macos/`, `apps/ios/`, `apps/android/` |
| **`docs/`** | Documentation (hosted on Mintlify) | `docs/**/*.md` |

---

## Entry Points & Execution Flow

### 1. CLI Entry Point

**File:** `src/entry.ts` → `src/cli/run-main.ts` → `src/cli/program/build-program.ts`

**Flow:**
```typescript
entry.ts
  └─> Node respawn if needed (Windows argv cleanup, env normalization)
  └─> cli/run-main.ts
      └─> build-program.ts (creates Commander program)
          └─> register.*.ts (modular command registration)
              └─> command-registry.ts (fast-path routing)
                  └─> Command execution (agent, message, config, etc.)
```

**Key Commands:**
- `clawdbot agent --to <peer> --message <text>` - Send message to agent
- `clawdbot gateway run` - Start gateway server
- `clawdbot message send --to <peer> --text <text>` - Send direct message
- `clawdbot config set <key> <value>` - Configure settings
- `clawdbot status` - Check channel/gateway status
- `clawdbot sessions list` - List active sessions

### 2. Gateway Entry Point

**File:** `src/gateway/server.impl.ts`

**Flow:**
```typescript
startGatewayServer(port, options)
  └─> Load config & plugins
  └─> Initialize subsystems:
      ├─> Node registry (mobile/desktop clients)
      ├─> Chat run registry (streaming state)
      ├─> Channel manager (all messaging channels)
      ├─> Cron service (scheduled tasks)
      └─> Exec approval manager (tool approvals)
  └─> Attach WebSocket handlers (server-ws-runtime.ts)
  └─> Attach HTTP handlers (server-http.ts)
  └─> Register gateway methods (server-methods.ts)
  └─> Start sidecars (browser, canvas, discovery)
```

**Gateway Methods** (exposed via WebSocket/HTTP):
- `agent` - Execute agent with streaming
- `chat.send` - Send chat message
- `channels.status` - Check channel health
- `sessions.list` - List sessions
- `send` - Send outbound message
- `models.list` - List available models
- `health` - System health check

### 3. Message Inbound Flow (Telegram Example)

**File:** `src/telegram/bot-handlers.ts` → `src/telegram/bot-message-dispatch.ts`

**Flow:**
```
1. Telegram webhook/polling → bot-handlers.ts
2. Debounce (coalesce rapid messages)
3. Extract media attachments
4. Normalize to channel message format
5. Resolve session via routing (resolve-route.ts)
6. Dispatch to agent via gateway method
7. Agent executes, returns response
8. Format response for Telegram
9. Send via Telegram API (send.ts)
10. Update session store
```

---

## Agent Flow: Prompt to Execution

### High-Level Flow

```
User Message → Channel → Routing → Agent Selection → Tool Execution → Response
```

### Detailed Agent Execution

**File:** `src/commands/agent.ts` (CLI) or `src/gateway/server-methods/agent.ts` (Gateway)

**Steps:**

1. **Route Resolution** (`src/routing/resolve-route.ts`)
   - Match message to agent binding rules
   - Generate session key: `<agent-id>.<main-key>.<channel>.<peer-kind>.<peer-id>`
   - Return resolved agent ID

2. **Agent Configuration** (`src/agents/agent-scope.ts`)
   - Load agent config from `~/.clawdbot/config.json`
   - Resolve workspace directory: `~/.clawdbot/agents/<agent-id>/`
   - Load skills, tools, and hooks

3. **Model Selection** (`src/agents/model-selection.ts`)
   - Check session model override
   - Check agent model configuration
   - Apply provider fallback chain
   - Validate model availability

4. **Auth Profile Resolution** (`src/agents/auth-profiles/`)
   - Select provider credentials
   - Support multiple auth profiles per agent
   - Fallback to last-good provider

5. **Agent Execution** (two modes):

   **A. CLI Agent** (`src/agents/cli-runner.ts`):
   - Spawns external CLI process
   - Builds system prompt with workspace context
   - Streams JSONL output
   - No tool execution (delegated to Pi backend)

   **B. Embedded Pi Agent** (`src/agents/pi-embedded.ts`):
   - Uses `@mariozechner/pi-agent-core` for agentic loop
   - Executes tools natively (bash, web, browser, channel-specific)
   - Supports streaming with chunking/debouncing
   - Handles model fallback and retry policies
   - Manages agent context and run state

6. **Tool Execution** (`src/agents/tools/`)
   - Tools: `bash`, `web`, `browser`, channel-specific (send, edit, delete, etc.)
   - Plugin tools loaded at runtime
   - Tool results fed back to agent for next iteration

7. **Response Delivery** (`src/commands/agent.ts` → `deliverAgentCommandResult()`)
   - Format response for channel capabilities
   - Split large messages if needed
   - Apply media limits/conversion
   - Send via channel API
   - Update session store

### Agent Agentic Loop (Embedded Pi)

```
┌─────────────────────────────────────────────────────────┐
│  1. User Input → Build System Prompt                   │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  2. Call AI Model (Claude, GPT, etc.)                  │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  3. Parse Response (text + tool calls)                 │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
         ┌─────────┴─────────┐
         │  Tool Calls?      │
         └─────┬───────┬─────┘
               │       │
            NO │       │ YES
               │       │
               ▼       ▼
         ┌─────────────────────────────────────────┐
         │  Execute Tools (bash, web, browser)    │
         │  → Collect Results                     │
         └──────────────┬──────────────────────────┘
                        │
                        ▼
         ┌─────────────────────────────────────────┐
         │  Append Tool Results to Context        │
         │  → Loop Back to Step 2                 │
         └──────────────┬──────────────────────────┘
                        │
                        │ (until no more tool calls)
                        │
                        ▼
         ┌─────────────────────────────────────────┐
         │  4. Return Final Response               │
         └─────────────────────────────────────────┘
```

---

## Task & Session Management

### Session Store

**File:** `src/config/sessions.ts`

**Data Model:**
```typescript
SessionEntry {
  key: string                    // Unique session key
  agentId: string               // Assigned agent
  channel: string               // Source channel (telegram, discord, etc.)
  peer?: { kind, id }           // Peer info (dm/group/channel)
  name?: string                 // Custom label
  metadata?: Record<string, any>
  lastMessageTime?: number
  settings?: {
    model?: string              // Session model override
    provider?: string           // Provider override
    verbose?: number            // Verbose level override
  }
}
```

**Persistence:**
- Stored as JSONL in `~/.clawdbot/sessions/`
- Append-only with deduplication
- Key-based lookups for fast access
- Automatic cleanup of stale entries

### Session Key Structure

**File:** `src/routing/session-key.ts`

**Format:**
```
<agent-id>.<main-key>.<channel>.<peer-kind>.<peer-id>
```

**Examples:**
- `default.main.telegram.dm.1234567890` - Telegram DM
- `default.main.discord.group.987654321` - Discord group
- `support.main.slack.channel.C1234567890` - Slack channel

**DM Scope Options:**
- `main` - Collapse all DMs to single session
- `per-peer` - Separate session per peer
- `per-channel-peer` - Separate session per channel + peer

### Routing Logic

**File:** `src/routing/resolve-route.ts`

**Binding Precedence:**
1. Peer-specific binding (DM with specific user, group with specific ID)
2. Guild/team binding (Discord guild, Slack workspace)
3. Account-specific binding
4. Wildcard account binding
5. Default agent

**Example Config:**
```json
{
  "routing": {
    "bindings": [
      {
        "channel": "telegram",
        "peer": { "kind": "dm", "id": "1234567890" },
        "agentId": "support"
      },
      {
        "channel": "discord",
        "guildId": "987654321",
        "agentId": "community"
      },
      {
        "channel": "*",
        "agentId": "default"
      }
    ]
  }
}
```

### Task Queuing

**Concurrency Control:**
- One active run per session key
- Queued messages processed sequentially
- Abortion support for canceling runs
- Chat run registry tracks active executions

---

## State Management

### 1. Configuration State

**File:** `src/config/loader.ts`

**Location:** `~/.clawdbot/config.json`

**Key Sections:**
- `agents` - Agent definitions and defaults
- `channels` - Channel-specific configs (Telegram, Discord, etc.)
- `gateway` - Gateway server settings
- `routing` - Routing bindings and allowlists
- `session` - Session scope and identity links
- `hooks` - Hook configurations
- `plugins` - Plugin list and settings

**Hot Reload:** Config changes detected via file watching (chokidar)

### 2. Session State

**Files:** `~/.clawdbot/sessions/` (JSONL)

**Managed by:** `src/config/sessions.ts`

**Operations:**
- `saveSession(entry)` - Persist session
- `loadSession(key)` - Load session by key
- `listSessions()` - List all sessions
- `deleteSession(key)` - Remove session

### 3. Agent State

**Files:** `~/.clawdbot/agents/<agent-id>/`

**Contents:**
- `workspace/` - Agent workspace files
- `skills/` - Agent-specific skills
- `sessions/` - Per-agent session logs (JSONL)
- `memory/` - Agent memory (if memory plugin enabled)

### 4. Media State

**Files:** `~/.clawdbot/credentials/media/`

**Managed by:** `src/media/store.ts`

**Operations:**
- `save(file, metadata)` - Store media with metadata
- `resolve(path)` - Retrieve media by path
- `redirect(oldPath, newPath)` - Path migration

### 5. Runtime State

**In-Memory (Gateway):**
- Node registry - Connected mobile/desktop clients
- Chat run registry - Active agent executions
- Channel manager - Channel connection state
- Exec approval manager - Pending tool approvals

---

## External Dependencies

### 1. AI Model Providers

| Provider | SDK | Auth Method |
|----------|-----|-------------|
| **Anthropic (Claude)** | `@anthropic-ai/sdk` | API Key |
| **OpenAI** | `openai` | API Key |
| **Google (Gemini)** | Cloud SDK | OAuth / API Key |
| **GitHub Copilot** | N/A | Token-based |
| **Minimax** | Custom | API Key |
| **Qwen** | Custom | Portal OAuth |
| **Ollama** | `ollama` | Local (no auth) |
| **Custom APIs** | N/A | Configurable |

**Configuration:** `src/agents/auth-profiles/`

### 2. Messaging Platforms

| Platform | Library | Protocol |
|----------|---------|----------|
| **Telegram** | `grammy` | Bot API (HTTPS) |
| **Discord** | `@buape/carbon` | Discord API (WebSocket + HTTPS) |
| **Slack** | `@slack/bolt` | Events API + Web API |
| **Signal** | N/A | Signal CLI (dbus) |
| **iMessage** | N/A | AppleScript (macOS only) |
| **WhatsApp** | `@whiskeysockets/baileys` | WhatsApp Web (WebSocket) |
| **Line** | `@line/bot-sdk` | Messaging API |

**Extensions:** Matrix, MS Teams, Google Chat, Mattermost, Zalo

### 3. Core Libraries

- **Commander.js** - CLI framework
- **Express / Hono** - HTTP server
- **ws** - WebSocket server
- **Sharp** - Image processing
- **Playwright** - Browser automation
- **jiti** - TypeScript loader (for plugins/hooks)
- **croner** - Cron scheduling
- **tslog** - Structured logging

---

## Key Data Models

### Agent Configuration

```typescript
type Agent = {
  id: string;
  name?: string;
  description?: string;
  provider?: string;              // "anthropic", "openai", etc.
  model?: string;                 // Model ID
  authProfile?: string;           // Auth profile name
  tools?: string[];               // Allowed tools
  skills?: string[];              // Skill paths
  hooks?: HookEntry[];            // Agent-specific hooks
  workspace?: string;             // Workspace directory
  systemPrompt?: string;          // Custom system prompt
  temperature?: number;
  maxTokens?: number;
  verbose?: number;               // 0 (none) to 3 (very verbose)
  xhighThinking?: boolean;        // Extended thinking mode
};
```

### Channel Message

```typescript
type ChannelMessage = {
  channel: string;                // "telegram", "discord", etc.
  accountId?: string;             // Bot account ID
  peer: {
    kind: "dm" | "group" | "channel";
    id: string;
  };
  from?: {
    id: string;
    name?: string;
    username?: string;
  };
  text?: string;
  media?: MediaAttachment[];
  replyTo?: string;               // Message ID to reply to
  threadId?: string;              // Thread ID (Slack, Discord)
  metadata?: Record<string, any>;
};
```

### Gateway Event

```typescript
type GatewayEvent =
  | { type: "chat.start"; sessionKey: string; agentId: string; }
  | { type: "chat.delta"; content: string; }
  | { type: "chat.thinking"; content?: string; }
  | { type: "chat.tool.start"; tool: string; args: any; }
  | { type: "chat.tool.end"; result: any; }
  | { type: "chat.end"; success: boolean; error?: string; }
  | { type: "chat.abort"; reason?: string; };
```

### Plugin Definition

```typescript
type PluginRecord = {
  id: string;
  name: string;
  version?: string;
  tools?: PluginToolRegistration[];
  hooks?: PluginHookRegistration[];
  commands?: PluginCliRegistration[];
  channels?: PluginChannelRegistration[];
  providers?: PluginProviderRegistration[];
  services?: PluginServiceRegistration[];
  httpRoutes?: PluginHttpRouteRegistration[];
};
```

---

## Quick Start Guide

### Prerequisites

- **Node.js 22+** (required)
- **pnpm** (package manager)
- **Bun** (optional, for faster TS execution)

### Installation

```bash
# Clone the repository
git clone https://github.com/clawdbot/clawdbot.git
cd clawdbot

# Install dependencies
pnpm install

# Install pre-commit hooks
pnpm dlx prek install

# Build the project
pnpm build
```

### Configuration

```bash
# Set default agent and model
pnpm clawdbot config set agents.defaults.provider anthropic
pnpm clawdbot config set agents.defaults.model claude-sonnet-4-5

# Add API key
pnpm clawdbot config set providers.anthropic.apiKey "sk-ant-..."

# Or use environment variable
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Running the Gateway

```bash
# Start gateway server
pnpm clawdbot gateway run --bind loopback --port 18789

# Or with auto channel discovery
pnpm clawdbot gateway run --bind auto
```

### Testing Agent

```bash
# Send a message to the default agent
pnpm clawdbot agent --message "What time is it?"

# Send to a specific channel peer
pnpm clawdbot agent --to telegram:1234567890 --message "Hello!"
```

### Configuring a Channel (Telegram Example)

```bash
# Set Telegram bot token
pnpm clawdbot config set channels.telegram.token "123456:ABC-DEF..."

# Enable Telegram channel
pnpm clawdbot config set channels.telegram.enabled true

# Restart gateway
pnpm mac:restart  # or manually restart
```

### Checking Status

```bash
# Check channel status
pnpm clawdbot status

# Deep probe (sends test messages)
pnpm clawdbot status --deep

# List sessions
pnpm clawdbot sessions list
```

---

## Development Workflow

### Running in Development Mode

```bash
# Run CLI in dev mode (using Bun)
pnpm dev

# Run gateway in dev mode (skip channels)
pnpm gateway:dev

# Run gateway with auto-reload
pnpm gateway:watch

# Run TUI (Terminal UI)
pnpm tui:dev
```

### Type-Checking and Building

```bash
# Type-check (via tsc)
pnpm build

# Just type-check (no emit)
npx tsc --noEmit
```

### Linting and Formatting

```bash
# Lint TypeScript
pnpm lint

# Lint and auto-fix
pnpm lint:fix

# Format code
pnpm format

# Format and fix
pnpm format:fix

# Lint Swift (macOS/iOS)
pnpm lint:swift
```

---

## Testing Strategy

### Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run in watch mode
pnpm test:watch

# Run E2E tests
pnpm test:e2e

# Run live tests (requires real API keys)
CLAWDBOT_LIVE_TEST=1 pnpm test:live
```

### Coverage Requirements

- **Lines:** 70%
- **Branches:** 70%
- **Functions:** 70%
- **Statements:** 70%

**Coverage Report:** `coverage/lcov-report/index.html`

### Test Organization

- **Unit tests:** `src/**/*.test.ts`
- **E2E tests:** `src/**/*.e2e.test.ts`
- **Live tests:** `CLAWDBOT_LIVE_TEST=1` required

### Docker E2E Tests

```bash
# Test onboarding flow
pnpm test:docker:onboard

# Test gateway networking
pnpm test:docker:gateway-network

# Test plugins
pnpm test:docker:plugins

# Run all Docker tests
pnpm test:docker:all
```

---

## Common Patterns

### 1. Dependency Injection

```typescript
import { createDefaultDeps } from "./cli/deps.js";

const deps = await createDefaultDeps();
const { config, sessionStore, gatewayClient } = deps;
```

### 2. Session Key Generation

```typescript
import { buildAgentSessionKey } from "./routing/resolve-route.js";

const sessionKey = buildAgentSessionKey({
  agentId: "default",
  channel: "telegram",
  peer: { kind: "dm", id: "1234567890" },
  dmScope: config.session?.dmScope ?? "main",
  identityLinks: config.session?.identityLinks,
});
```

### 3. Plugin Tool Registration

```typescript
// In your plugin entry file
export const tools = [
  {
    name: "my-tool",
    factory: (context) => ({
      name: "my-tool",
      description: "Does something useful",
      input: { type: "object", properties: { ... } },
      handler: async (input) => {
        // Tool implementation
        return { result: "..." };
      },
    }),
  },
];
```

### 4. Hook Registration

```typescript
// In config.json
{
  "hooks": [
    {
      "on": "session:start",
      "run": "bash",
      "script": "echo 'Session started: {{sessionKey}}'"
    }
  ]
}
```

### 5. Channel Plugin Implementation

```typescript
export const plugin: ChannelPlugin = {
  id: "my-channel",
  name: "My Channel",
  inbound: async (message) => {
    // Handle incoming messages
  },
  outbound: async (request) => {
    // Send outbound messages
  },
};
```

---

## Next Steps

### For New Contributors

1. **Read the Docs:** Browse `docs/` for detailed guides
   - `docs/channels/` - Channel-specific docs
   - `docs/gateway/` - Gateway architecture
   - `docs/configuration.md` - Config reference

2. **Pick a Good First Issue:** Look for `good-first-issue` label on GitHub

3. **Join the Community:** Discord, GitHub Discussions

4. **Explore Extensions:** Check `extensions/` for plugin examples

5. **Run Examples:** Try different channels and tools

### Advanced Topics

- **Creating a Channel Plugin:** `docs/channels/custom.md`
- **Creating a Tool Plugin:** `docs/plugins/tools.md`
- **Creating a Hook:** `docs/hooks.md`
- **macOS App Development:** `docs/platforms/mac/development.md`
- **Mobile App Development:** `apps/ios/README.md`, `apps/android/README.md`

### Resources

- **Docs:** https://docs.clawd.bot
- **GitHub:** https://github.com/clawdbot/clawdbot
- **Discord:** (link in README)
- **Changelog:** `CHANGELOG.md`

---

## Troubleshooting

### Common Issues

**1. Gateway won't start:**
- Check port availability: `lsof -i :18789`
- Check config: `pnpm clawdbot config show`
- Check logs: `tail -f /tmp/clawdbot-gateway.log`

**2. Channel not connecting:**
- Verify credentials: `pnpm clawdbot config show channels.<channel>`
- Check status: `pnpm clawdbot status --deep`
- Review channel docs: `docs/channels/<channel>.md`

**3. Agent not responding:**
- Check model config: `pnpm clawdbot models list`
- Verify API key: `pnpm clawdbot config show providers`
- Check session: `pnpm clawdbot sessions list`

**4. Build errors:**
- Clear dist: `rm -rf dist`
- Rebuild: `pnpm build`
- Check Node version: `node --version` (must be 22+)

**5. Test failures:**
- Clear coverage: `rm -rf coverage`
- Run single test: `pnpm test <file>.test.ts`
- Check live test env: `echo $CLAWDBOT_LIVE_TEST`

### Getting Help

1. Check `docs/troubleshooting.md`
2. Run `pnpm clawdbot doctor` for diagnostics
3. Search GitHub Issues
4. Ask in Discord
5. Open a new issue with logs

---

**Happy Contributing!** 🚀
