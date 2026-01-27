# Clawdbot SaaS Platform - План Разработки

## Обзор Проекта

Трансформация Clawdbot из self-hosted решения в multi-tenant SaaS платформу с централизованными ботами и изолированными пользовательскими инстансами.

### Целевая Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                    SaaS Platform Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Web UI     │  │  Auth/Users  │  │   Billing    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│              Centralized Bot Hub (Shared Bots)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Telegram    │  │  WhatsApp    │  │   Discord    │         │
│  │  (Single Bot)│  │ (Single Bot) │  │ (Single Bot) │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ (routing by user_id)
┌──────────────────────────▼──────────────────────────────────────┐
│              Multi-Tenant Gateway Orchestrator                  │
│                    (User Context Router)                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐       ┌────▼────┐      ┌────▼────┐
    │ User 1  │       │ User 2  │      │ User N  │
    │ Instance│       │ Instance│      │ Instance│
    ├─────────┤       ├─────────┤      ├─────────┤
    │ Memory  │       │ Memory  │      │ Memory  │
    │ Skills  │       │ Skills  │      │ Skills  │
    │ Sessions│       │ Sessions│      │ Sessions│
    │ API Keys│       │ API Keys│      │ API Keys│
    │ Config  │       │ Config  │      │ Config  │
    └─────────┘       └─────────┘      └─────────┘
         │                 │                 │
    ┌────▼─────────────────▼─────────────────▼────┐
    │     Shared Infrastructure Layer             │
    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
    │  │ Postgres │  │  Redis   │  │ S3/Blob  │  │
    │  │  (Meta)  │  │ (Cache)  │  │ (Media)  │  │
    │  └──────────┘  └──────────┘  └──────────┘  │
    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
    │  │ Ollama/  │  │ Embedding│  │ Vector   │  │
    │  │ vLLM     │  │ Service  │  │ DB       │  │
    │  └──────────┘  └──────────┘  └──────────┘  │
    └──────────────────────────────────────────────┘
```

---

## Фазы Разработки

### **Фаза 0: Подготовка и Анализ** (1-2 недели)

#### Задачи:
1. **Анализ текущей архитектуры**
   - Изучить систему роутинга (`src/routing/`)
   - Изучить систему сессий (`src/config/sessions.ts`)
   - Изучить хранилище конфигов (`src/config/loader.ts`)
   - Понять механизм изоляции агентов (`src/agents/agent-scope.ts`)

2. **Определение границ изоляции**
   - Что должно быть shared: боты, модели, инфраструктура
   - Что должно быть per-user: память, skills, сессии, API ключи, конфиги
   - Как разделить файловую систему vs база данных

3. **Выбор технологического стека**
   - **Backend:** Node.js + Express/Fastify (уже есть в gateway)
   - **Database:** PostgreSQL (метаданные юзеров, биллинг) + SQLite per-user (sessions)
   - **Cache:** Redis (session cache, rate limiting)
   - **Storage:** S3-compatible (media files)
   - **Vector DB:** Qdrant/Weaviate (memory search)
   - **LLM Hosting:** Ollama/vLLM/Text Generation Inference
   - **Auth:** JWT + OAuth2 (Google, Apple, GitHub)
   - **Frontend:** React/Next.js + shadcn/ui

4. **Определение MVP scope**
   - Минимальный набор фич для первого релиза
   - Приоритизация каналов (Telegram first, потом WhatsApp)

#### Результат:
- Технический дизайн документ
- ER-диаграмма базы данных
- API спецификация (OpenAPI)
- Архитектурные решения (ADR - Architecture Decision Records)

---

### **Фаза 1: Multi-Tenant Foundation** (3-4 недели)

#### 1.1 User Management & Authentication

**Компоненты:**
```
src/saas/
├── auth/
│   ├── jwt.ts                    # JWT token generation/validation
│   ├── oauth-providers.ts        # Google, GitHub login
│   ├── middleware.ts             # Auth middleware для Express
│   └── session-manager.ts        # User session management
├── users/
│   ├── user-model.ts             # User data model
│   ├── user-service.ts           # User CRUD operations
│   ├── user-repository.ts        # Database layer
│   └── workspace-manager.ts      # User workspace isolation
└── database/
    ├── migrations/               # Database schema migrations
    ├── connection.ts             # Database connection pool
    └── schema.sql                # Initial schema
```

**База данных (PostgreSQL):**
```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  username VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(255),
  avatar_url TEXT,
  locale VARCHAR(10) DEFAULT 'en',
  location VARCHAR(100),          -- Для оптимизации роутинга
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_seen_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'active', -- active, suspended, deleted
  metadata JSONB DEFAULT '{}'     -- Дополнительные данные
);

-- User auth providers (OAuth)
CREATE TABLE user_auth_providers (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,  -- google, github
  provider_user_id VARCHAR(255) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  UNIQUE(provider, provider_user_id)
);

-- User workspaces (isolated agent instances)
CREATE TABLE user_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL DEFAULT 'default',
  agent_id VARCHAR(100) NOT NULL,  -- Внутренний agent ID
  storage_path TEXT NOT NULL,      -- Путь к файлам агента
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);
```

**Задачи:**
- [ ] Создать database schema и миграции
- [ ] Реализовать User model и repository
- [ ] Реализовать JWT auth middleware
- [ ] Реализовать OAuth flow для Google
- [ ] Создать workspace isolation механизм
- [ ] Тесты для auth и user management

**API Endpoints:**
```typescript
POST   /api/v1/auth/register         # Email registration (optional)
POST   /api/v1/auth/login            # Email login
POST   /api/v1/auth/oauth/google     # Google OAuth callback
POST   /api/v1/auth/refresh          # Refresh JWT token
POST   /api/v1/auth/logout           # Logout
GET    /api/v1/users/me              # Get current user
PATCH  /api/v1/users/me              # Update user profile
DELETE /api/v1/users/me              # Delete account
```

---

#### 1.2 User Context Routing Layer

**Компоненты:**
```
src/saas/routing/
├── user-context-resolver.ts      # Resolve user from message
├── tenant-router.ts              # Route to user workspace
├── channel-multiplexer.ts        # Shared bot -> user mapping
└── rate-limiter.ts               # Per-user rate limiting
```

**Задача:** Модифицировать систему роутинга для multi-tenancy

**Текущий роутинг (single-tenant):**
```typescript
// src/routing/resolve-route.ts
resolveAgentRoute({
  channel: "telegram",
  peer: { kind: "dm", id: "1234567890" }
}) -> { agentId: "default", sessionKey: "..." }
```

**Новый роутинг (multi-tenant):**
```typescript
// src/saas/routing/user-context-resolver.ts
resolveUserContext({
  channel: "telegram",
  peer: { kind: "dm", id: "1234567890" }
}) -> {
  userId: "uuid-...",
  workspaceId: "uuid-...",
  agentId: "user-uuid-default",
  sessionKey: "user-uuid.default.main.telegram.dm.1234567890"
}
```

**User-Channel Connection Table:**
```sql
-- User messaging channel connections
CREATE TABLE user_channel_connections (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  channel VARCHAR(50) NOT NULL,    -- telegram, whatsapp, discord
  channel_user_id VARCHAR(255) NOT NULL, -- Peer ID в канале
  channel_username VARCHAR(255),
  display_name VARCHAR(255),
  connected_at TIMESTAMP DEFAULT NOW(),
  last_message_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'active', -- active, disconnected
  metadata JSONB DEFAULT '{}',
  UNIQUE(channel, channel_user_id)
);

-- Index для быстрого поиска user по channel ID
CREATE INDEX idx_channel_connections_lookup
  ON user_channel_connections(channel, channel_user_id);
```

**Задачи:**
- [ ] Создать user_channel_connections таблицу
- [ ] Реализовать UserContextResolver
- [ ] Модифицировать gateway для user context injection
- [ ] Модифицировать channel handlers (Telegram, WhatsApp)
- [ ] Реализовать per-user rate limiting (Redis)
- [ ] Тесты для роутинга

---

#### 1.3 Workspace Isolation

**Текущая структура (single-tenant):**
```
~/.clawdbot/
├── agents/
│   └── default/
│       ├── workspace/
│       ├── skills/
│       └── sessions/
├── config.json
└── sessions/
```

**Новая структура (multi-tenant):**
```
/data/clawdbot/users/
├── <user-id-1>/
│   ├── agents/
│   │   └── default/
│   │       ├── workspace/
│   │       ├── skills/
│   │       └── sessions/
│   ├── config.json          # Per-user config
│   ├── media/               # User media storage
│   └── memory/              # Memory storage
├── <user-id-2>/
│   └── ...
└── <user-id-N>/
    └── ...
```

**Workspace Manager:**
```typescript
// src/saas/users/workspace-manager.ts
class WorkspaceManager {
  // Get user workspace path
  getUserWorkspacePath(userId: string): string {
    return `/data/clawdbot/users/${userId}`;
  }

  // Initialize user workspace
  async initializeWorkspace(userId: string): Promise<void> {
    const workspacePath = this.getUserWorkspacePath(userId);
    await fs.mkdir(`${workspacePath}/agents/default/workspace`, { recursive: true });
    await fs.mkdir(`${workspacePath}/agents/default/skills`, { recursive: true });
    await fs.mkdir(`${workspacePath}/agents/default/sessions`, { recursive: true });
    await fs.mkdir(`${workspacePath}/media`, { recursive: true });
    await fs.mkdir(`${workspacePath}/memory`, { recursive: true });

    // Create default config
    await this.createDefaultConfig(userId, workspacePath);
  }

  // Load user config
  async loadUserConfig(userId: string): Promise<ClawdbotConfig> {
    const configPath = `${this.getUserWorkspacePath(userId)}/config.json`;
    return await loadConfig(configPath);
  }

  // Save user config
  async saveUserConfig(userId: string, config: ClawdbotConfig): Promise<void> {
    const configPath = `${this.getUserWorkspacePath(userId)}/config.json`;
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }
}
```

**Задачи:**
- [ ] Реализовать WorkspaceManager
- [ ] Модифицировать config loader для multi-tenant
- [ ] Модифицировать session store для user isolation
- [ ] Модифицировать media store для user isolation
- [ ] Модифицировать agent-scope.ts для user workspaces
- [ ] Disk quota management (per-user limits)
- [ ] Тесты для workspace isolation

---

### **Фаза 2: Centralized Bot Hub** (2-3 недели)

#### 2.1 Shared Bot Infrastructure

**Концепция:**
Вместо того чтобы каждый пользователь создавал своего бота, платформа предоставляет централизованныхботов, которые маршрутизируют сообщения к нужному пользователю.

**Telegram Bot Hub:**
```typescript
// src/saas/bots/telegram-hub.ts
class TelegramBotHub {
  private bot: Bot;
  private userContextResolver: UserContextResolver;

  async handleMessage(ctx: Context) {
    const telegramUserId = ctx.from?.id.toString();

    // 1. Resolve user context
    const userContext = await this.userContextResolver.resolveByChannel({
      channel: "telegram",
      channelUserId: telegramUserId,
    });

    if (!userContext) {
      // User not connected yet - show onboarding
      await this.showOnboardingMessage(ctx);
      return;
    }

    // 2. Load user workspace config
    const userConfig = await this.workspaceManager.loadUserConfig(userContext.userId);

    // 3. Dispatch to user's agent
    await this.dispatchToUserAgent({
      userId: userContext.userId,
      workspaceId: userContext.workspaceId,
      message: ctx.message,
      config: userConfig,
    });
  }

  async showOnboardingMessage(ctx: Context) {
    await ctx.reply(
      "👋 Welcome to Clawdbot!\n\n" +
      "To get started, please register at https://app.clawdbot.io\n" +
      "Then connect your Telegram account.",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Register Now 🚀", url: "https://app.clawdbot.io/register" }],
          ],
        },
      }
    );
  }
}
```

**User Onboarding Flow:**
```
1. User -> /start в Telegram боте
2. Bot -> "Please register at app.clawdbot.io"
3. User -> Регистрируется на сайте
4. User -> Нажимает "Connect Telegram"
5. Website -> Генерирует one-time code
6. User -> Отправляет code боту
7. Bot -> Связывает Telegram ID с User ID
8. User -> Может начать общаться
```

**Connection Flow Table:**
```sql
-- One-time connection codes
CREATE TABLE channel_connection_codes (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  channel VARCHAR(50) NOT NULL,
  code VARCHAR(20) UNIQUE NOT NULL,  -- Одноразовый код
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_connection_codes_lookup ON channel_connection_codes(code, channel);
```

**Задачи:**
- [ ] Реализовать TelegramBotHub
- [ ] Реализовать connection code generation
- [ ] Реализовать connection flow в боте
- [ ] Реализовать onboarding messages
- [ ] Создать WhatsAppBotHub (аналогично)
- [ ] Создать DiscordBotHub (аналогично)
- [ ] Тесты для bot hub

**API Endpoints:**
```typescript
POST   /api/v1/channels/generate-code     # Generate connection code
POST   /api/v1/channels/connect            # Connect channel (via code)
GET    /api/v1/channels/connections        # List user's connections
DELETE /api/v1/channels/connections/:id    # Disconnect channel
```

---

#### 2.2 Channel Connection UI

**Web UI для подключения каналов:**
```typescript
// Web interface (React component)
function ChannelConnectionPage() {
  return (
    <div>
      <h2>Connect Messaging Channels</h2>

      {/* Telegram */}
      <ChannelCard
        name="Telegram"
        icon={<TelegramIcon />}
        connected={user.channels.telegram}
        onConnect={() => connectTelegram()}
      />

      {/* WhatsApp */}
      <ChannelCard
        name="WhatsApp"
        icon={<WhatsAppIcon />}
        connected={user.channels.whatsapp}
        onConnect={() => connectWhatsApp()}
      />

      {/* Discord */}
      <ChannelCard
        name="Discord"
        icon={<DiscordIcon />}
        connected={user.channels.discord}
        onConnect={() => connectDiscord()}
      />
    </div>
  );
}

async function connectTelegram() {
  // 1. Generate code
  const { code } = await api.post("/api/v1/channels/generate-code", {
    channel: "telegram",
  });

  // 2. Show instructions
  showModal({
    title: "Connect Telegram",
    content: (
      <>
        <p>Send this code to our bot:</p>
        <Code>{code}</Code>
        <p>Bot: <a href="https://t.me/clawdbot">@clawdbot</a></p>
      </>
    ),
  });

  // 3. Poll for connection status
  pollConnectionStatus(code);
}
```

**Задачи:**
- [ ] Создать UI для channel connections
- [ ] Реализовать connection code flow
- [ ] Реализовать QR code для WhatsApp (если нужно)
- [ ] Реализовать OAuth для Discord
- [ ] Показывать статус подключения
- [ ] Тесты для UI

---

### **Фаза 3: User Configuration & API Keys** (2-3 недели)

#### 3.1 User Model Configuration

**Per-User Config Structure:**
```json
{
  "agents": {
    "defaults": {
      "provider": "platform",        // "platform" or custom provider
      "model": "llama-3.1-8b",       // Hosted model
      "temperature": 0.7,
      "maxTokens": 2048
    }
  },
  "providers": {
    "platform": {
      "enabled": true,               // Use platform models
      "models": ["llama-3.1-8b", "mistral-7b"]
    },
    "anthropic": {
      "enabled": false,
      "apiKey": "encrypted-key"      // User's own API key
    },
    "openai": {
      "enabled": false,
      "apiKey": "encrypted-key"
    }
  },
  "session": {
    "dmScope": "per-peer"
  },
  "features": {
    "webSearch": true,               // Enable web search
    "imageGeneration": false,        // Premium feature
    "voiceMode": false               // Premium feature
  }
}
```

**Database Schema:**
```sql
-- User API keys (encrypted)
CREATE TABLE user_api_keys (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,    -- anthropic, openai, etc.
  key_name VARCHAR(100),            -- User-friendly name
  encrypted_key TEXT NOT NULL,      -- Encrypted API key
  encryption_iv TEXT NOT NULL,      -- IV for AES encryption
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  UNIQUE(user_id, provider, key_name)
);

-- User model preferences
CREATE TABLE user_model_preferences (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  is_default BOOLEAN DEFAULT false,
  temperature DECIMAL(3,2),
  max_tokens INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**API Key Encryption Service:**
```typescript
// src/saas/security/key-encryption.ts
import crypto from "crypto";

class KeyEncryptionService {
  private masterKey: Buffer;

  constructor() {
    // Master key из environment variable (rotate periodically)
    this.masterKey = Buffer.from(process.env.MASTER_ENCRYPTION_KEY!, "hex");
  }

  encryptApiKey(apiKey: string): { encrypted: string; iv: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.masterKey, iv);

    let encrypted = cipher.update(apiKey, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return {
      encrypted: encrypted + authTag.toString("hex"),
      iv: iv.toString("hex"),
    };
  }

  decryptApiKey(encrypted: string, iv: string): string {
    const ivBuffer = Buffer.from(iv, "hex");
    const encryptedBuffer = Buffer.from(encrypted.slice(0, -32), "hex");
    const authTag = Buffer.from(encrypted.slice(-32), "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", this.masterKey, ivBuffer);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString("utf8");
  }
}
```

**Задачи:**
- [ ] Создать user_api_keys таблицу
- [ ] Реализовать KeyEncryptionService
- [ ] Реализовать API для управления ключами
- [ ] Реализовать per-user config storage
- [ ] Модифицировать model selection для user-specific providers
- [ ] UI для управления API ключами
- [ ] Тесты для encryption и key management

**API Endpoints:**
```typescript
GET    /api/v1/config                      # Get user config
PATCH  /api/v1/config                      # Update user config

POST   /api/v1/api-keys                    # Add API key
GET    /api/v1/api-keys                    # List API keys (masked)
PATCH  /api/v1/api-keys/:id                # Update API key
DELETE /api/v1/api-keys/:id                # Delete API key

GET    /api/v1/models/available            # List available models
PATCH  /api/v1/models/preferences          # Set model preferences
```

---

#### 3.2 Platform-Hosted Models

**Self-Hosted LLM Infrastructure:**

**Option 1: Ollama (проще для начала):**
```yaml
# docker-compose.yml
services:
  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama-models:/root/.ollama
    ports:
      - "11434:11434"
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

volumes:
  ollama-models:
```

**Option 2: vLLM (для production, более эффективный):**
```yaml
services:
  vllm:
    image: vllm/vllm-openai:latest
    command: >
      --model meta-llama/Llama-3.1-8B-Instruct
      --served-model-name llama-3.1-8b
      --max-model-len 4096
      --gpu-memory-utilization 0.9
    environment:
      - HF_TOKEN=${HF_TOKEN}
    ports:
      - "8000:8000"
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

**Model Proxy Service:**
```typescript
// src/saas/models/platform-model-proxy.ts
class PlatformModelProxy {
  private ollama: Ollama;
  private rateLimiter: RateLimiter;

  async chat(request: ChatRequest, userId: string): Promise<ChatResponse> {
    // 1. Check rate limits
    await this.rateLimiter.checkLimit(userId, "model-requests");

    // 2. Track usage
    await this.trackUsage(userId, request.model, {
      inputTokens: estimateTokens(request.messages),
    });

    // 3. Call model
    const response = await this.ollama.chat({
      model: request.model,
      messages: request.messages,
      stream: request.stream,
    });

    // 4. Track output
    await this.trackUsage(userId, request.model, {
      outputTokens: estimateTokens(response.message.content),
    });

    return response;
  }
}
```

**Usage Tracking:**
```sql
-- Model usage tracking
CREATE TABLE model_usage (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cached_tokens INTEGER DEFAULT 0,
  request_count INTEGER DEFAULT 1,
  cost_usd DECIMAL(10,6) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes для аналитики
CREATE INDEX idx_usage_user_time ON model_usage(user_id, created_at DESC);
CREATE INDEX idx_usage_model ON model_usage(model, created_at DESC);
```

**Задачи:**
- [ ] Setup Ollama/vLLM infrastructure
- [ ] Deploy baseline models (Llama 3.1 8B, Mistral 7B)
- [ ] Реализовать PlatformModelProxy
- [ ] Реализовать usage tracking
- [ ] Реализовать rate limiting per user
- [ ] Реализовать cost calculation
- [ ] Monitoring и alerting для моделей
- [ ] Тесты для model proxy

**Available Models (Phase 1):**
- `llama-3.1-8b-instruct` (general purpose)
- `mistral-7b-instruct` (fast, efficient)
- `phi-3-mini` (lightweight)

---

### **Фаза 4: Web Search & External Integrations** (2 недели)

#### 4.1 Web Search Integration

**Search Provider Options:**
- **SearXNG** (self-hosted, free)
- **Brave Search API** (paid, но generous free tier)
- **Google Programmable Search** (limited free tier)

**SearXNG Setup (рекомендуется):**
```yaml
# docker-compose.yml
services:
  searxng:
    image: searxng/searxng:latest
    volumes:
      - ./searxng:/etc/searxng
    ports:
      - "8080:8080"
    environment:
      - BASE_URL=https://search.clawdbot.io
      - INSTANCE_NAME=Clawdbot Search
```

**Search Tool Integration:**
```typescript
// src/saas/tools/web-search.ts
class WebSearchTool {
  private searxng: SearXNGClient;
  private rateLimiter: RateLimiter;

  async search(query: string, userId: string): Promise<SearchResults> {
    // Check rate limits (10 searches per hour for free tier)
    await this.rateLimiter.checkLimit(userId, "web-search", {
      max: 10,
      window: 3600,
    });

    const results = await this.searxng.search({
      q: query,
      engines: "google,duckduckgo,brave",
      format: "json",
      safesearch: 1,
    });

    return this.formatResults(results);
  }
}
```

**Usage Tracking:**
```sql
-- Web search usage
CREATE TABLE web_search_usage (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  results_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Rate limiting
CREATE INDEX idx_search_user_time ON web_search_usage(user_id, created_at DESC);
```

**Задачи:**
- [ ] Setup SearXNG instance
- [ ] Реализовать WebSearchTool
- [ ] Интегрировать в agent tools
- [ ] Реализовать rate limiting
- [ ] Реализовать usage tracking
- [ ] UI для включения/выключения web search
- [ ] Тесты для search tool

---

### **Фаза 5: Web Dashboard & User Interface** (3-4 недели)

#### 5.1 Frontend Architecture

**Tech Stack:**
- **Framework:** Next.js 14 (App Router)
- **UI Library:** shadcn/ui + Radix UI
- **Styling:** Tailwind CSS
- **State:** Zustand + React Query
- **Auth:** NextAuth.js
- **API Client:** tRPC or REST with Axios

**Directory Structure:**
```
apps/web/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   ├── register/
│   │   └── oauth-callback/
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Dashboard home
│   │   ├── channels/             # Channel connections
│   │   ├── models/               # Model config
│   │   ├── api-keys/             # API key management
│   │   ├── sessions/             # Chat sessions
│   │   ├── settings/             # User settings
│   │   └── billing/              # Billing (future)
│   └── api/
│       └── [...]/route.ts        # API routes
├── components/
│   ├── ui/                       # shadcn components
│   ├── dashboard/
│   │   ├── sidebar.tsx
│   │   ├── header.tsx
│   │   └── stats-card.tsx
│   ├── channels/
│   │   ├── channel-card.tsx
│   │   └── connection-modal.tsx
│   └── models/
│       ├── model-selector.tsx
│       └── model-config-form.tsx
├── lib/
│   ├── api-client.ts
│   ├── auth.ts
│   └── utils.ts
└── styles/
    └── globals.css
```

#### 5.2 Key UI Pages

**1. Dashboard Home:**
```
┌─────────────────────────────────────────────────────────┐
│  Clawdbot Dashboard                      [User Menu ▼]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Welcome back, John! 👋                                │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Messages     │  │ Tokens Used  │  │ Active Chats │ │
│  │   1,234      │  │   45.2K      │  │      3       │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                         │
│  Connected Channels:                                   │
│  ✅ Telegram (@john)        ❌ WhatsApp                │
│  ❌ Discord                  ❌ Slack                  │
│                                                         │
│  Recent Activity:                                      │
│  [Chat session list with timestamps]                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**2. Channel Connections Page:**
```
┌─────────────────────────────────────────────────────────┐
│  Connect Messaging Channels                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌────────────────────────────────────────────────┐    │
│  │  📱 Telegram                   [Connected ✅]  │    │
│  │  @john                                          │    │
│  │  Connected 2 days ago                          │    │
│  │  [Disconnect]                                  │    │
│  └────────────────────────────────────────────────┘    │
│                                                         │
│  ┌────────────────────────────────────────────────┐    │
│  │  💬 WhatsApp                [Connect]          │    │
│  │  Chat with AI via WhatsApp                     │    │
│  └────────────────────────────────────────────────┘    │
│                                                         │
│  ┌────────────────────────────────────────────────┐    │
│  │  🎮 Discord                 [Connect]          │    │
│  │  Add bot to your server                        │    │
│  └────────────────────────────────────────────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**3. Model Configuration Page:**
```
┌─────────────────────────────────────────────────────────┐
│  Model Configuration                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Default Model:                                        │
│  ┌───────────────────────────────────────────────┐     │
│  │ [⚡] Platform Models                          │     │
│  │   └─ Llama 3.1 8B Instruct (Recommended)     │     │
│  │   └─ Mistral 7B Instruct                     │     │
│  │   └─ Phi-3 Mini                              │     │
│  └───────────────────────────────────────────────┘     │
│                                                         │
│  Custom API Keys:                                      │
│  ┌───────────────────────────────────────────────┐     │
│  │ [+] Add Custom Provider                       │     │
│  │                                               │     │
│  │ 🧠 Anthropic Claude                          │     │
│  │ [Add API Key]                                │     │
│  │                                               │     │
│  │ 🤖 OpenAI GPT                                │     │
│  │ [Add API Key]                                │     │
│  └───────────────────────────────────────────────┘     │
│                                                         │
│  Advanced Settings:                                    │
│  Temperature: [slider 0-2]  0.7                       │
│  Max Tokens: [input]  2048                            │
│                                                         │
│  [Save Changes]                                        │
└─────────────────────────────────────────────────────────┘
```

**4. Sessions/Chat History Page:**
```
┌─────────────────────────────────────────────────────────┐
│  Chat Sessions                           [New Chat +]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Filters: [All Channels ▼] [Last 7 days ▼]            │
│                                                         │
│  ┌────────────────────────────────────────────────┐    │
│  │ 📱 Telegram - @john                            │    │
│  │ "Help me debug this Python code..."           │    │
│  │ 2 hours ago • 15 messages                      │    │
│  └────────────────────────────────────────────────┘    │
│                                                         │
│  ┌────────────────────────────────────────────────┐    │
│  │ 💬 WhatsApp - +1234567890                     │    │
│  │ "What's the weather like today?"              │    │
│  │ 1 day ago • 3 messages                        │    │
│  └────────────────────────────────────────────────┘    │
│                                                         │
│  [Load More]                                           │
└─────────────────────────────────────────────────────────┘
```

**Задачи:**
- [ ] Setup Next.js project
- [ ] Implement authentication UI
- [ ] Implement dashboard home
- [ ] Implement channel connections UI
- [ ] Implement model configuration UI
- [ ] Implement sessions/history UI
- [ ] Implement settings page
- [ ] Implement API key management UI
- [ ] Responsive design (mobile-friendly)
- [ ] Dark mode support
- [ ] i18n support (en, ru)
- [ ] E2E tests (Playwright)

---

### **Фаза 6: Billing & Subscription Management** (2-3 недели)

#### 6.1 Pricing Tiers

**Proposed Pricing:**
```
┌──────────────────────────────────────────────────────┐
│  FREE TIER                                           │
│  • Platform models (Llama 3.1 8B, Mistral 7B)       │
│  • 100 messages/day                                  │
│  • 1 connected channel                               │
│  • 10 web searches/day                               │
│  • 100 MB storage                                    │
│  Price: $0/month                                     │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  PRO TIER                                            │
│  • All platform models                               │
│  • 1,000 messages/day                                │
│  • Unlimited channels                                │
│  • 100 web searches/day                              │
│  • Custom API keys (Claude, GPT-4)                   │
│  • 10 GB storage                                     │
│  • Priority support                                  │
│  Price: $10/month                                    │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  TEAM TIER                                           │
│  • All Pro features                                  │
│  • 10,000 messages/day                               │
│  • Multi-user workspaces                             │
│  • Unlimited web searches                            │
│  • 100 GB storage                                    │
│  • Custom model deployments                          │
│  • Dedicated support                                 │
│  Price: $50/month                                    │
└──────────────────────────────────────────────────────┘
```

**Database Schema:**
```sql
-- Subscription plans
CREATE TABLE subscription_plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,  -- free, pro, team
  display_name VARCHAR(100) NOT NULL,
  price_monthly_usd DECIMAL(10,2) NOT NULL,
  price_yearly_usd DECIMAL(10,2),
  features JSONB NOT NULL,
  limits JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User subscriptions
CREATE TABLE user_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER REFERENCES subscription_plans(id),
  status VARCHAR(20) NOT NULL,       -- active, cancelled, past_due
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  stripe_subscription_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Usage tracking for billing
CREATE TABLE usage_records (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  metric VARCHAR(50) NOT NULL,       -- messages, searches, storage
  amount INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 6.2 Rate Limiting & Quota Management

**Rate Limiter (Redis-based):**
```typescript
// src/saas/billing/rate-limiter.ts
class RateLimiter {
  private redis: Redis;

  async checkLimit(
    userId: string,
    metric: string,
    options?: { max?: number; window?: number }
  ): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    // Get user plan
    const subscription = await this.getSubscription(userId);
    const plan = await this.getPlan(subscription.planId);

    // Get limit for metric
    const limit = options?.max ?? plan.limits[metric];
    const window = options?.window ?? 86400; // 24h default

    // Check Redis
    const key = `rate:${userId}:${metric}:${this.getCurrentWindow(window)}`;
    const current = await this.redis.incr(key);

    if (current === 1) {
      await this.redis.expire(key, window);
    }

    const allowed = current <= limit;
    const remaining = Math.max(0, limit - current);
    const resetAt = new Date(Date.now() + window * 1000);

    if (!allowed) {
      throw new RateLimitError(`Rate limit exceeded for ${metric}`);
    }

    return { allowed, remaining, resetAt };
  }
}
```

**Middleware для проверки квот:**
```typescript
// src/saas/middleware/quota-check.ts
export function requireQuota(metric: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user.id;

    try {
      const result = await rateLimiter.checkLimit(userId, metric);

      // Add headers
      res.set("X-RateLimit-Limit", result.limit.toString());
      res.set("X-RateLimit-Remaining", result.remaining.toString());
      res.set("X-RateLimit-Reset", result.resetAt.toISOString());

      next();
    } catch (error) {
      if (error instanceof RateLimitError) {
        return res.status(429).json({
          error: "Rate limit exceeded",
          message: error.message,
          upgradeUrl: "https://app.clawdbot.io/upgrade",
        });
      }
      next(error);
    }
  };
}
```

#### 6.3 Stripe Integration

**Payment Processing:**
```typescript
// src/saas/billing/stripe-service.ts
import Stripe from "stripe";

class StripeService {
  private stripe: Stripe;

  async createCustomer(user: User): Promise<string> {
    const customer = await this.stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });
    return customer.id;
  }

  async createSubscription(
    customerId: string,
    priceId: string
  ): Promise<Stripe.Subscription> {
    return await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.payment_intent"],
    });
  }

  async handleWebhook(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "customer.subscription.created":
        await this.handleSubscriptionCreated(event.data.object);
        break;
      case "customer.subscription.updated":
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case "customer.subscription.deleted":
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      case "invoice.payment_succeeded":
        await this.handlePaymentSucceeded(event.data.object);
        break;
      case "invoice.payment_failed":
        await this.handlePaymentFailed(event.data.object);
        break;
    }
  }
}
```

**Задачи:**
- [ ] Create subscription plans в БД
- [ ] Реализовать RateLimiter (Redis)
- [ ] Реализовать quota middleware
- [ ] Integrate Stripe SDK
- [ ] Implement subscription creation flow
- [ ] Implement webhook handlers
- [ ] Implement upgrade/downgrade flow
- [ ] Implement cancellation flow
- [ ] UI для billing (pricing page, checkout, manage subscription)
- [ ] Email notifications (payment success, failure, etc.)
- [ ] Тесты для billing

**API Endpoints:**
```typescript
GET    /api/v1/billing/plans              # List available plans
POST   /api/v1/billing/checkout           # Create checkout session
GET    /api/v1/billing/subscription       # Get current subscription
POST   /api/v1/billing/subscription       # Update subscription
DELETE /api/v1/billing/subscription       # Cancel subscription
GET    /api/v1/billing/usage              # Get usage stats
POST   /api/v1/billing/webhook            # Stripe webhooks
```

---

### **Фаза 7: Deployment & Infrastructure** (2-3 недели)

#### 7.1 Infrastructure Architecture

**Deployment Stack:**
```
┌─────────────────────────────────────────────────────────┐
│                    Load Balancer (Nginx)                │
│                  SSL Termination (Let's Encrypt)        │
└──────────────────────┬──────────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
    ┌────▼────┐   ┌────▼────┐  ┌────▼────┐
    │  Web    │   │  API    │  │ Gateway │
    │  (Next) │   │  Server │  │ Server  │
    │  x2     │   │  x3     │  │  x2     │
    └─────────┘   └────┬────┘  └────┬────┘
                       │            │
         ┌─────────────┼────────────┼─────────────┐
         │             │            │             │
    ┌────▼────┐   ┌────▼────┐  ┌───▼────┐   ┌───▼────┐
    │Postgres │   │  Redis  │  │ Ollama │   │ S3     │
    │(Primary)│   │ (Cache) │  │ (GPU)  │   │(Media) │
    └────┬────┘   └─────────┘  └────────┘   └────────┘
         │
    ┌────▼────┐
    │Postgres │
    │(Replica)│
    └─────────┘
```

**Containerization (Docker Compose для dev, Kubernetes для prod):**

**Development (docker-compose.yml):**
```yaml
version: "3.9"

services:
  # Web UI
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://clawdbot:password@postgres:5432/clawdbot
      - REDIS_URL=redis://redis:6379
      - NEXTAUTH_URL=http://localhost:3000
    depends_on:
      - postgres
      - redis

  # API Server
  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    ports:
      - "4000:4000"
    environment:
      - DATABASE_URL=postgresql://clawdbot:password@postgres:5432/clawdbot
      - REDIS_URL=redis://redis:6379
      - MASTER_ENCRYPTION_KEY=${MASTER_ENCRYPTION_KEY}
    depends_on:
      - postgres
      - redis
    volumes:
      - user-workspaces:/data/clawdbot/users

  # Gateway Server
  gateway:
    build:
      context: .
      dockerfile: Dockerfile.gateway
    ports:
      - "18789:18789"
    environment:
      - DATABASE_URL=postgresql://clawdbot:password@postgres:5432/clawdbot
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
      - ollama
    volumes:
      - user-workspaces:/data/clawdbot/users

  # Ollama (LLM inference)
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-models:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  # PostgreSQL
  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=clawdbot
      - POSTGRES_USER=clawdbot
      - POSTGRES_PASSWORD=password
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data

  # Redis
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

  # SearXNG (web search)
  searxng:
    image: searxng/searxng:latest
    ports:
      - "8080:8080"
    volumes:
      - ./searxng:/etc/searxng

  # MinIO (S3-compatible storage)
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    volumes:
      - minio-data:/data

volumes:
  postgres-data:
  redis-data:
  ollama-models:
  minio-data:
  user-workspaces:
```

**Production (Kubernetes примерный манифест):**
```yaml
# api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: clawdbot-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: clawdbot-api
  template:
    metadata:
      labels:
        app: clawdbot-api
    spec:
      containers:
        - name: api
          image: clawdbot/api:latest
          ports:
            - containerPort: 4000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: clawdbot-secrets
                  key: database-url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: clawdbot-secrets
                  key: redis-url
          volumeMounts:
            - name: user-workspaces
              mountPath: /data/clawdbot/users
      volumes:
        - name: user-workspaces
          persistentVolumeClaim:
            claimName: user-workspaces-pvc
```

#### 7.2 CI/CD Pipeline

**GitHub Actions Workflow:**
```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 22
          cache: "pnpm"
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm build
      - run: pnpm test

  build-and-push:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: docker/setup-buildx-action@v2
      - uses: docker/login-action@v2
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # Build and push API
      - uses: docker/build-push-action@v4
        with:
          context: .
          file: Dockerfile.api
          push: true
          tags: ghcr.io/${{ github.repository }}/api:latest

      # Build and push Gateway
      - uses: docker/build-push-action@v4
        with:
          context: .
          file: Dockerfile.gateway
          push: true
          tags: ghcr.io/${{ github.repository }}/gateway:latest

      # Build and push Web
      - uses: docker/build-push-action@v4
        with:
          context: .
          file: apps/web/Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}/web:latest

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to production
        run: |
          # SSH to server and pull latest images
          # Or use Kubernetes kubectl apply
          # Or use Terraform/Pulumi
```

#### 7.3 Monitoring & Observability

**Monitoring Stack:**
- **Metrics:** Prometheus + Grafana
- **Logs:** Loki или ELK stack
- **Tracing:** Jaeger (optional)
- **Uptime:** UptimeRobot или Checkly
- **Error Tracking:** Sentry

**Key Metrics:**
```typescript
// src/saas/monitoring/metrics.ts
import { Counter, Histogram, Gauge } from "prom-client";

// Request metrics
export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
});

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
});

// Agent metrics
export const agentExecutionDuration = new Histogram({
  name: "agent_execution_duration_seconds",
  help: "Duration of agent executions",
  labelNames: ["user_id", "model", "success"],
});

export const agentExecutionsTotal = new Counter({
  name: "agent_executions_total",
  help: "Total number of agent executions",
  labelNames: ["user_id", "model", "success"],
});

// Model metrics
export const modelTokensUsed = new Counter({
  name: "model_tokens_used_total",
  help: "Total tokens used",
  labelNames: ["user_id", "provider", "model", "type"], // type: input/output
});

// User metrics
export const activeUsers = new Gauge({
  name: "active_users",
  help: "Number of active users",
});

export const connectedChannels = new Gauge({
  name: "connected_channels_total",
  help: "Number of connected channels",
  labelNames: ["channel"],
});
```

**Задачи:**
- [ ] Setup Docker development environment
- [ ] Create production Kubernetes manifests
- [ ] Setup CI/CD pipeline (GitHub Actions)
- [ ] Setup monitoring (Prometheus + Grafana)
- [ ] Setup logging (Loki)
- [ ] Setup error tracking (Sentry)
- [ ] Setup uptime monitoring
- [ ] Create deployment runbooks
- [ ] Create disaster recovery plan
- [ ] Load testing

---

### **Фаза 8: Testing, Security & Launch** (2-3 недели)

#### 8.1 Security Checklist

**Authentication & Authorization:**
- [ ] Implement JWT with refresh tokens
- [ ] Implement OAuth2 flows (Google, GitHub)
- [ ] Implement RBAC (Role-Based Access Control)
- [ ] Session management (Redis)
- [ ] Rate limiting (per user, per IP)
- [ ] CSRF protection
- [ ] XSS protection (CSP headers)

**Data Security:**
- [ ] Encrypt API keys at rest (AES-256-GCM)
- [ ] Encrypt sensitive data in database
- [ ] Use parameterized queries (SQL injection prevention)
- [ ] Secure file uploads (type validation, size limits)
- [ ] Sanitize user inputs
- [ ] Implement data retention policies

**Infrastructure Security:**
- [ ] HTTPS everywhere (TLS 1.3)
- [ ] Secure headers (HSTS, CSP, etc.)
- [ ] Database connection encryption
- [ ] Redis password authentication
- [ ] Network segmentation (VPC)
- [ ] Firewall rules
- [ ] DDoS protection (Cloudflare)
- [ ] Regular security audits

**User Privacy:**
- [ ] GDPR compliance (data export, deletion)
- [ ] Privacy policy
- [ ] Terms of service
- [ ] Cookie consent
- [ ] Data anonymization for analytics

#### 8.2 Testing Strategy

**Unit Tests:**
- [ ] Service layer tests (>80% coverage)
- [ ] Repository layer tests
- [ ] Utility function tests

**Integration Tests:**
- [ ] API endpoint tests
- [ ] Database integration tests
- [ ] Redis integration tests
- [ ] Auth flow tests

**E2E Tests:**
- [ ] User registration flow
- [ ] Channel connection flow
- [ ] Agent execution flow
- [ ] Payment flow
- [ ] Settings update flow

**Load Tests:**
- [ ] API load tests (k6 или Artillery)
- [ ] Database performance tests
- [ ] Gateway concurrency tests
- [ ] Model inference load tests

#### 8.3 Launch Checklist

**Pre-Launch:**
- [ ] Complete all features (Phase 1-7)
- [ ] Security audit passed
- [ ] Load testing passed
- [ ] All tests passing
- [ ] Documentation complete
- [ ] Legal documents ready (TOS, Privacy Policy)
- [ ] Support system ready (email, chat)
- [ ] Pricing finalized
- [ ] Payment processing tested

**Launch Day:**
- [ ] Deploy to production
- [ ] DNS setup
- [ ] SSL certificates
- [ ] Monitoring dashboards live
- [ ] Alerting configured
- [ ] Backup system verified
- [ ] Launch announcement (Twitter, Reddit, HN)
- [ ] Press release (optional)

**Post-Launch:**
- [ ] Monitor error rates
- [ ] Monitor user signups
- [ ] Monitor system performance
- [ ] Collect user feedback
- [ ] Quick bug fixes
- [ ] Feature iteration based on feedback

---

## Timeline Summary

| Фаза | Длительность | Ключевые Результаты |
|------|--------------|---------------------|
| **Фаза 0: Подготовка** | 1-2 недели | Технический дизайн, архитектура, ADR |
| **Фаза 1: Multi-Tenant Foundation** | 3-4 недели | User management, auth, workspace isolation |
| **Фаза 2: Centralized Bot Hub** | 2-3 недели | Shared bots, connection flow |
| **Фаза 3: User Config & API Keys** | 2-3 недели | Per-user config, API key encryption, model proxy |
| **Фаза 4: Web Search & Integrations** | 2 недели | SearXNG integration, search tool |
| **Фаза 5: Web Dashboard** | 3-4 недели | Full-featured web UI |
| **Фаза 6: Billing & Subscriptions** | 2-3 недели | Stripe integration, plans, quotas |
| **Фаза 7: Deployment** | 2-3 недели | Infrastructure, CI/CD, monitoring |
| **Фаза 8: Testing & Launch** | 2-3 недели | Security audit, load tests, launch |
| **TOTAL** | **19-27 недель** | **Production-ready SaaS platform** |

---

## MVP Scope (First Release)

Для быстрого запуска рекомендуется MVP с минимальным набором фич:

### MVP Features:
1. ✅ User registration (email + Google OAuth)
2. ✅ One centralized Telegram bot
3. ✅ One-click Telegram connection
4. ✅ Platform-hosted models (Llama 3.1 8B только)
5. ✅ Basic web dashboard (dashboard, channels, settings)
6. ✅ Free tier only (no billing)
7. ✅ Basic web search (SearXNG)
8. ✅ Session management
9. ✅ Basic monitoring

### Post-MVP (Future Phases):
- WhatsApp, Discord support
- Custom API keys (Claude, GPT)
- Pro/Team tiers + billing
- Advanced analytics
- Team workspaces
- Custom model deployments
- Mobile apps

**MVP Timeline: 10-14 недель**

---

## Tech Stack Summary

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | Next.js 14, shadcn/ui, Tailwind | Modern React stack |
| **Backend** | Node.js, Express/Fastify | Existing gateway foundation |
| **Database** | PostgreSQL, Redis | User data + cache |
| **Storage** | S3-compatible (MinIO/AWS S3) | Media files |
| **Auth** | JWT, OAuth2 (Google) | NextAuth.js |
| **LLM Hosting** | Ollama / vLLM | Self-hosted models |
| **Search** | SearXNG | Self-hosted search |
| **Billing** | Stripe | Payment processing |
| **Monitoring** | Prometheus, Grafana, Sentry | Observability |
| **Deployment** | Docker, Kubernetes | Containerized |
| **CI/CD** | GitHub Actions | Automated testing + deploy |

---

## Team & Resources

**Recommended Team:**
- 1-2 Backend Engineers (Node.js, PostgreSQL)
- 1 Frontend Engineer (React, Next.js)
- 1 DevOps Engineer (Kubernetes, CI/CD)
- 0.5 Designer (UI/UX)

**Infrastructure Costs (estimated):**
- Compute (GPU for LLM): $500-1000/month
- Database (managed PostgreSQL): $100-200/month
- Redis (managed): $50-100/month
- Storage (S3): $50-100/month
- CDN + Load Balancer: $50-100/month
- Monitoring: $50-100/month
- **Total: ~$800-1600/month** (до масштабирования)

---

## Risk Mitigation

### Technical Risks:
1. **LLM Hosting Cost** - Solution: Start with smaller models, optimize inference
2. **User Workspace Disk Usage** - Solution: Implement quotas, cleanup policies
3. **Database Scaling** - Solution: Read replicas, caching, sharding plan
4. **Bot Rate Limits (Telegram)** - Solution: Queue messages, implement backoff

### Business Risks:
1. **User Acquisition** - Solution: Free tier, referral program, content marketing
2. **API Key Trust** - Solution: Strong encryption, security audit, transparency
3. **Competition** - Solution: Focus on ease-of-use, multi-channel, self-hosted option
4. **Abuse/Spam** - Solution: Rate limiting, content moderation, reporting system

---

## Next Steps

1. **Week 1-2:** Complete Фаза 0 (technical design, architecture decisions)
2. **Week 3:** Start Фаза 1 (user management, auth)
3. **Week 4-6:** Continue Фаза 1 + Фаза 2 (bot hub)
4. **Review & Iterate:** Weekly progress reviews, adjust timeline

**First Milestone: Working Telegram bot with user registration (Week 6)**

---

## Resources & Documentation

- **Clawdbot Docs:** https://docs.clawd.bot
- **Architecture Diagrams:** [Create in Excalidraw/Figma]
- **API Spec:** [Create OpenAPI spec]
- **Database Schema:** [Create ER diagram]
- **Deployment Guide:** [Write deployment runbook]
- **Security Audit:** [Schedule before launch]

---

**Удачи с запуском SaaS платформы! 🚀**
