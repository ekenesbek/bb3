# Clawdbot Multi-Tenant SaaS Platform - План разработки

## Цель проекта

Превратить Clawdbot из single-user CLI инструмента в полноценную multi-tenant SaaS платформу, где каждый пользователь получает:
- Изолированный workspace/инстанс Claude с собственной памятью
- Персональные skills и конфигурацию
- Возможность использовать собственные API ключи моделей или предоставленные платформой
- Централизованное подключение к Telegram/WhatsApp/Discord через одну кнопку
- Доступ к hosted open-source моделям

---

## Текущая архитектура: анализ

### Основные проблемы single-user дизайна

1. **Отсутствие концепции tenant/workspace**
   - Все данные хранятся в `~/.clawdbot/` без изоляции по пользователям
   - Session keys не содержат tenant ID: `agent:{agentId}:{mainKey}`
   - Device identity единый для всей установки

2. **Монолитный gateway**
   - Один gateway процесс на машину
   - Все RPC методы работают с глобальным конфигом
   - Нет tenant контекста в запросах

3. **Shared credentials storage**
   - Все токены в `~/.clawdbot/credentials/`
   - Environment variables глобальные
   - macOS keychain без tenant разделения

4. **File-based session storage**
   - JSON файлы: `~/.clawdbot/agents/{agentId}/sessions.json`
   - Не масштабируется на множество concurrent tenants
   - In-memory cache с 45s TTL

5. **Channel handlers без tenant isolation**
   - Telegram/Discord/WhatsApp поддерживают multiple accounts, но не multiple tenants
   - accountId это channel-specific metadata, не tenant scope

---

## Архитектурная трансформация

### Фаза 0: Подготовка инфраструктуры (2-3 недели)

#### 0.1 Database Layer

**Цель**: Заменить file-based storage на centralized database.

**Действия**:
- [ ] Выбрать primary database (рекомендация: PostgreSQL с row-level security)
- [ ] Создать schema миграции:
  ```sql
  -- Tenants
  CREATE TABLE tenants (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    plan_type TEXT DEFAULT 'free',
    settings JSONB
  );

  -- Users
  CREATE TABLE users (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    tenant_id UUID REFERENCES tenants(id),
    role TEXT DEFAULT 'member',
    created_at TIMESTAMP DEFAULT NOW()
  );

  -- Sessions (replacing sessions.json)
  CREATE TABLE sessions (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    session_key TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, session_key)
  );

  -- Credentials (replacing credentials/*.json)
  CREATE TABLE credentials (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    provider TEXT NOT NULL, -- 'openai', 'anthropic', etc.
    account_id TEXT, -- for multi-account channels
    encrypted_data BYTEA NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, provider, account_id)
  );

  -- Channel Connections
  CREATE TABLE channel_connections (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    channel_type TEXT NOT NULL, -- 'telegram', 'whatsapp', etc.
    account_id TEXT NOT NULL,
    config JSONB NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, channel_type, account_id)
  );

  -- Agent Bindings
  CREATE TABLE agent_bindings (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    agent_id TEXT NOT NULL,
    match_rules JSONB NOT NULL, -- {channel, accountId, peer, etc.}
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  );

  -- Memory Index (для vector embeddings)
  CREATE TABLE memory_entries (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    agent_id TEXT NOT NULL,
    embedding vector(1536), -- using pgvector extension
    content TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX ON memory_entries USING ivfflat (embedding vector_cosine_ops);
  ```

- [ ] Implement database abstraction layer:
  ```typescript
  // src/storage/database.ts
  export interface TenantDatabase {
    // Sessions
    getSession(tenantId: string, sessionKey: string): Promise<SessionEntry | null>;
    saveSession(tenantId: string, sessionKey: string, data: SessionEntry): Promise<void>;
    listSessions(tenantId: string, agentId: string): Promise<SessionEntry[]>;

    // Credentials
    getCredentials(tenantId: string, provider: string, accountId?: string): Promise<EncryptedCredentials | null>;
    saveCredentials(tenantId: string, provider: string, data: EncryptedCredentials, accountId?: string): Promise<void>;

    // Channel connections
    getChannelConnections(tenantId: string, channelType?: string): Promise<ChannelConnection[]>;
    saveChannelConnection(tenantId: string, connection: ChannelConnection): Promise<void>;

    // Memory
    queryMemory(tenantId: string, agentId: string, query: number[], limit: number): Promise<MemoryEntry[]>;
    saveMemoryEntry(tenantId: string, agentId: string, entry: MemoryEntry): Promise<void>;
  }
  ```

- [ ] Добавить encryption для credentials (использовать tenant-specific keys)
- [ ] Migrate existing file storage to database (optional migration tool для legacy users)

**Критические изменения**:
- `/src/config/sessions/store.ts` → database-backed store
- `/src/memory/manager.ts` → PostgreSQL + pgvector вместо SQLite
- `/src/agents/cli-credentials.ts` → database credential provider

#### 0.2 Authentication & Authorization Layer

**Цель**: Добавить user management и tenant isolation.

**Действия**:
- [ ] Implement authentication service:
  ```typescript
  // src/auth/service.ts
  export interface AuthService {
    // Registration
    registerUser(email: string, password: string, locale?: string): Promise<User>;

    // Login/Logout
    login(email: string, password: string): Promise<{user: User, token: string}>;
    logout(token: string): Promise<void>;

    // Token validation
    validateToken(token: string): Promise<User | null>;

    // OAuth providers (для social login)
    initiateOAuth(provider: 'google' | 'github'): Promise<{url: string}>;
    completeOAuth(provider: string, code: string): Promise<{user: User, token: string}>;
  }
  ```

- [ ] Implement JWT-based authentication:
  ```typescript
  // JWT payload
  interface TokenPayload {
    userId: string;
    tenantId: string;
    email: string;
    role: 'owner' | 'admin' | 'member';
    exp: number;
  }
  ```

- [ ] Add authorization middleware:
  ```typescript
  // src/auth/middleware.ts
  export function requireAuth(handler: RequestHandler): RequestHandler {
    return async (req, res) => {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({error: 'Unauthorized'});

      const user = await authService.validateToken(token);
      if (!user) return res.status(401).json({error: 'Invalid token'});

      req.user = user;
      req.tenantId = user.tenantId;
      return handler(req, res);
    };
  }
  ```

- [ ] Implement Row-Level Security (RLS) в PostgreSQL:
  ```sql
  -- Все таблицы автоматически фильтруются по tenant_id
  ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON sessions
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
  ```

**Критические изменения**:
- `/src/gateway/auth.ts` → расширить с tenant context
- `/src/infra/device-pairing.ts` → добавить tenant assignment при pairing
- Все gateway RPC методы → добавить tenant validation

---

### Фаза 1: Core Tenant Infrastructure (3-4 недели)

#### 1.1 Tenant Context Propagation

**Цель**: Пробросить tenant ID через всю систему.

**Действия**:
- [ ] Extend session key format:
  ```typescript
  // src/routing/session-key.ts

  // Old format: agent:main:telegram:dm:123
  // New format: tenant:abc123:agent:main:telegram:dm:123

  export function buildSessionKey(params: {
    tenantId: string;
    agentId: string;
    mainKey?: string;
    channel?: string;
    peerKind?: string;
    peerId?: string;
    threadId?: string;
  }): string {
    let key = `tenant:${params.tenantId}:agent:${params.agentId}`;
    // ... rest of key construction
    return key;
  }
  ```

- [ ] Add TenantContext to all gateway methods:
  ```typescript
  // src/gateway/context.ts
  export interface TenantContext {
    tenantId: string;
    userId: string;
    userRole: 'owner' | 'admin' | 'member';
  }

  // src/gateway/server-methods/send-message.ts
  export async function sendMessage(
    ctx: TenantContext,
    params: SendMessageParams
  ): Promise<SendMessageResult> {
    // Validate tenant has access to this channel/account
    await validateChannelAccess(ctx.tenantId, params.channel, params.accountId);

    // Build tenant-scoped session key
    const sessionKey = buildSessionKey({
      tenantId: ctx.tenantId,
      agentId: params.agentId,
      // ...
    });

    // Rest of implementation with tenant isolation
  }
  ```

- [ ] Update gateway server to inject tenant context:
  ```typescript
  // src/gateway/server.impl.ts
  export class GatewayServer {
    private async handleRPC(req: Request, res: Response) {
      // Extract tenant from JWT
      const ctx = await this.extractTenantContext(req);

      // Route to method with context
      const result = await this.methods[req.body.method](ctx, req.body.params);

      res.json(result);
    }
  }
  ```

**Затронутые файлы** (>50 файлов):
- `/src/routing/session-key.ts`
- `/src/routing/resolve-route.ts`
- `/src/gateway/server-methods/*.ts` (все методы)
- `/src/agents/agent-scope.ts`
- `/src/config/types.agents.ts`

#### 1.2 Multi-Tenant Gateway Architecture

**Цель**: Refactor gateway для работы с multiple tenants.

**Опции архитектуры**:

**Вариант A: Single Gateway + Tenant Isolation (рекомендуется для начала)**
- Один gateway процесс обслуживает всех tenants
- Tenant isolation через database RLS + application-level validation
- Проще в деплое, но требует тщательной изоляции

**Вариант B: Gateway per Tenant**
- Каждый tenant получает dedicated gateway instance
- Полная изоляция процессов
- Сложнее scaling, но максимальная безопасность

**Рекомендация**: Начать с варианта A, при росте мигрировать на B для premium планов.

**Действия для варианта A**:
- [ ] Add tenant routing layer:
  ```typescript
  // src/gateway/tenant-router.ts
  export class TenantRouter {
    async routeMessage(ctx: TenantContext, message: IncomingMessage): Promise<void> {
      // Load tenant's bindings
      const bindings = await db.getAgentBindings(ctx.tenantId);

      // Resolve route with tenant context
      const route = await resolveRoute({
        tenantId: ctx.tenantId,
        message,
        bindings,
      });

      // Execute with tenant-scoped agent
      await this.executeRoute(ctx, route);
    }
  }
  ```

- [ ] Implement tenant-scoped agent pool:
  ```typescript
  // src/agents/tenant-agent-pool.ts
  export class TenantAgentPool {
    private agents = new Map<string, Map<string, AgentInstance>>();

    async getAgent(tenantId: string, agentId: string): Promise<AgentInstance> {
      if (!this.agents.has(tenantId)) {
        this.agents.set(tenantId, new Map());
      }

      const tenantAgents = this.agents.get(tenantId)!;
      if (!tenantAgents.has(agentId)) {
        const agent = await this.createTenantAgent(tenantId, agentId);
        tenantAgents.set(agentId, agent);
      }

      return tenantAgents.get(agentId)!;
    }
  }
  ```

- [ ] Add tenant resource limits:
  ```typescript
  // src/gateway/rate-limiter.ts
  export interface TenantLimits {
    maxMessagesPerHour: number;
    maxAgents: number;
    maxMemoryEntries: number;
    maxChannelConnections: number;
  }

  export async function checkRateLimit(
    tenantId: string,
    action: 'message' | 'agent_create'
  ): Promise<boolean> {
    const limits = await getTenantLimits(tenantId);
    const usage = await getCurrentUsage(tenantId);
    return usage[action] < limits[action];
  }
  ```

#### 1.3 Credential Management Refactor

**Цель**: Изолировать credentials по tenants.

**Действия**:
- [ ] Implement credential encryption:
  ```typescript
  // src/storage/credentials.ts
  export class CredentialVault {
    async saveCredential(
      tenantId: string,
      provider: string,
      data: ProviderCredentials,
      accountId?: string
    ): Promise<void> {
      // Encrypt with tenant-specific key
      const encrypted = await this.encrypt(tenantId, data);

      await db.saveCredentials(tenantId, provider, encrypted, accountId);
    }

    async getCredential(
      tenantId: string,
      provider: string,
      accountId?: string
    ): Promise<ProviderCredentials | null> {
      const encrypted = await db.getCredentials(tenantId, provider, accountId);
      if (!encrypted) return null;

      return this.decrypt(tenantId, encrypted);
    }
  }
  ```

- [ ] Update channel handlers to use tenant credentials:
  ```typescript
  // src/telegram/client.ts
  export async function getTelegramClient(
    tenantId: string,
    accountId: string = 'default'
  ): Promise<TelegramBot> {
    // Load tenant-specific token
    const creds = await vault.getCredential(tenantId, 'telegram', accountId);
    if (!creds) throw new Error('Telegram not configured');

    return new TelegramBot(creds.token);
  }
  ```

- [ ] Add credential validation:
  ```typescript
  // src/channels/validator.ts
  export async function validateChannelCredentials(
    tenantId: string,
    channel: string,
    accountId: string
  ): Promise<ValidationResult> {
    const creds = await vault.getCredential(tenantId, channel, accountId);
    if (!creds) return {valid: false, error: 'Not configured'};

    // Test connection
    try {
      await testChannelConnection(channel, creds);
      return {valid: true};
    } catch (err) {
      return {valid: false, error: err.message};
    }
  }
  ```

**Затронутые файлы**:
- `/src/telegram/accounts.ts`
- `/src/web/auth-store.ts`
- `/src/agents/cli-credentials.ts`
- Все channel handlers

---

### Фаза 2: Channel Integration Layer (2-3 недели)

#### 2.1 Centralized Bot Infrastructure

**Цель**: Один Telegram/WhatsApp/Discord бот для всех tenants с tenant routing.

**Telegram Architecture**:
```
┌─────────────────────────┐
│  Telegram Bot Token     │
│  (platform-owned)       │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  Gateway Webhook        │
│  /webhook/telegram      │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  Tenant Resolver        │
│  (via pairing code)     │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  Tenant Agent Pool      │
│  (isolated execution)   │
└─────────────────────────┘
```

**Действия**:
- [ ] Implement pairing flow:
  ```typescript
  // src/channels/pairing.ts
  export async function initiatePairing(
    tenantId: string,
    channel: 'telegram' | 'whatsapp' | 'discord'
  ): Promise<PairingCode> {
    const code = generatePairingCode(); // 6-digit code

    await db.savePairingCode({
      code,
      tenantId,
      channel,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 min
    });

    return {
      code,
      instructions: `Send /start ${code} to @YourClawdbotBot`,
    };
  }

  // В Telegram bot handler:
  bot.onText(/\/start (\d{6})/, async (msg, match) => {
    const code = match[1];
    const pairing = await db.getPairingCode(code);

    if (!pairing || pairing.expiresAt < Date.now()) {
      return bot.sendMessage(msg.chat.id, 'Invalid or expired code');
    }

    // Link chat to tenant
    await db.saveChannelConnection({
      tenantId: pairing.tenantId,
      channelType: 'telegram',
      accountId: 'default',
      config: {
        chatId: msg.chat.id,
        userId: msg.from.id,
      },
      enabled: true,
    });

    await db.deletePairingCode(code);

    bot.sendMessage(msg.chat.id, '✅ Connected! You can now chat with your Clawdbot agent.');
  });
  ```

- [ ] Implement tenant routing for incoming messages:
  ```typescript
  // src/channels/telegram/webhook.ts
  export async function handleTelegramUpdate(update: TelegramUpdate) {
    const chatId = update.message.chat.id;

    // Find tenant by chat ID
    const connection = await db.getChannelConnectionByChatId('telegram', chatId);
    if (!connection) {
      return sendMessage(chatId, 'Please pair your account first. Visit https://your-platform.com/connect');
    }

    // Route to tenant's agent
    const ctx: TenantContext = {
      tenantId: connection.tenantId,
      userId: connection.config.userId,
      userRole: 'member',
    };

    await tenantRouter.routeMessage(ctx, {
      channel: 'telegram',
      text: update.message.text,
      from: update.message.from,
      chatId,
    });
  }
  ```

- [ ] WhatsApp integration (через WhatsApp Business API или библиотеку):
  ```typescript
  // src/channels/whatsapp/webhook.ts
  // Similar pairing flow через QR code или phone number verification
  export async function handleWhatsAppMessage(payload: WhatsAppWebhook) {
    const phoneNumber = payload.from;

    const connection = await db.getChannelConnectionByPhone('whatsapp', phoneNumber);
    if (!connection) {
      return sendWhatsAppMessage(phoneNumber, 'Please connect at https://your-platform.com/connect');
    }

    const ctx: TenantContext = {tenantId: connection.tenantId, ...};
    await tenantRouter.routeMessage(ctx, {
      channel: 'whatsapp',
      text: payload.text.body,
      from: phoneNumber,
    });
  }
  ```

- [ ] Discord integration:
  ```typescript
  // src/channels/discord/webhook.ts
  // Similar: OAuth flow или invite link with tenant context
  ```

**Преимущества централизованного бота**:
- Пользователи не настраивают свои токены
- One-click подключение
- Platform контролирует rate limits
- Проще модерация и compliance

**Недостатки**:
- Нужны Bot tokens с высокими лимитами
- Сложнее debugging (много tenants на одном боте)

#### 2.2 Channel Configuration UI

**Действия**:
- [ ] Create connection management API:
  ```typescript
  // src/api/channels.ts
  router.post('/api/channels/initiate', requireAuth, async (req, res) => {
    const {channel} = req.body;
    const pairing = await initiatePairing(req.tenantId, channel);
    res.json(pairing);
  });

  router.get('/api/channels', requireAuth, async (req, res) => {
    const connections = await db.getChannelConnections(req.tenantId);
    res.json(connections);
  });

  router.delete('/api/channels/:id', requireAuth, async (req, res) => {
    await db.deleteChannelConnection(req.tenantId, req.params.id);
    res.json({success: true});
  });
  ```

---

### Фаза 3: Model Provider Layer (2 недели)

#### 3.1 Hosted Models Infrastructure

**Цель**: Предоставить бесплатные hosted open-source модели + возможность BYOK (Bring Your Own Key).

**Архитектура**:
```
┌──────────────────────────────────────────┐
│  Model Router                            │
│  - Checks tenant's credentials           │
│  - Falls back to platform models         │
└─────────────────┬────────────────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
┌───────────────┐   ┌──────────────────┐
│  User's API   │   │  Platform Models │
│  (OpenAI,     │   │  (vLLM, Ollama)  │
│   Anthropic)  │   │                  │
└───────────────┘   └──────────────────┘
```

**Действия**:
- [ ] Implement model provider abstraction:
  ```typescript
  // src/models/provider.ts
  export interface ModelProvider {
    name: string;
    models: string[];
    complete(params: CompletionParams): Promise<CompletionResult>;
  }

  // src/models/router.ts
  export class ModelRouter {
    async getProvider(
      tenantId: string,
      requestedModel: string
    ): Promise<ModelProvider> {
      // Check if tenant has custom API key
      const customCreds = await vault.getCredential(tenantId, 'openai');
      if (customCreds && requestedModel.startsWith('gpt-')) {
        return new OpenAIProvider(customCreds.apiKey);
      }

      // Fall back to platform models
      return this.getPlatformProvider(requestedModel);
    }

    private getPlatformProvider(model: string): ModelProvider {
      // Map to hosted models
      if (model.includes('llama')) return this.llamaProvider;
      if (model.includes('mistral')) return this.mistralProvider;
      throw new Error('Model not available');
    }
  }
  ```

- [ ] Setup hosted model infrastructure:
  ```yaml
  # docker-compose.yml для model serving
  version: '3.8'
  services:
    vllm-llama:
      image: vllm/vllm-openai:latest
      command: --model meta-llama/Llama-3.1-8B-Instruct --port 8000
      deploy:
        resources:
          reservations:
            devices:
              - driver: nvidia
                count: 1
                capabilities: [gpu]

    vllm-mistral:
      image: vllm/vllm-openai:latest
      command: --model mistralai/Mistral-7B-Instruct-v0.2 --port 8001
      deploy:
        resources:
          reservations:
            devices:
              - driver: nvidia
                count: 1
                capabilities: [gpu]
  ```

- [ ] Implement rate limiting per tenant:
  ```typescript
  // src/models/rate-limiter.ts
  export async function checkModelQuota(
    tenantId: string,
    model: string
  ): Promise<boolean> {
    const plan = await getTenantPlan(tenantId);
    const usage = await getModelUsage(tenantId, getCurrentMonth());

    const limits = {
      free: {tokens: 100_000},
      pro: {tokens: 1_000_000},
      enterprise: {tokens: Infinity},
    };

    return usage.tokens < limits[plan].tokens;
  }
  ```

#### 3.2 Credential Management UI

**Действия**:
- [ ] Create API keys management:
  ```typescript
  // src/api/credentials.ts
  router.post('/api/credentials', requireAuth, async (req, res) => {
    const {provider, apiKey} = req.body;

    // Validate API key
    const valid = await validateApiKey(provider, apiKey);
    if (!valid) return res.status(400).json({error: 'Invalid API key'});

    // Save encrypted
    await vault.saveCredential(req.tenantId, provider, {apiKey});

    res.json({success: true});
  });

  router.get('/api/credentials', requireAuth, async (req, res) => {
    const providers = ['openai', 'anthropic', 'groq'];
    const configured = await Promise.all(
      providers.map(async p => ({
        provider: p,
        configured: !!(await vault.getCredential(req.tenantId, p)),
      }))
    );
    res.json(configured);
  });
  ```

---

### Фаза 4: Frontend Application (3-4 недели)

#### 4.1 Web Dashboard

**Tech Stack** (рекомендация):
- React/Next.js для SSR
- Tailwind CSS для styling
- shadcn/ui для компонентов
- React Query для data fetching

**Структура**:
```
/app
  /auth
    /login - Логин страница
    /register - Регистрация с locale selection
  /dashboard
    /overview - Главная с usage stats
    /chat - Web chat interface
    /channels - Channel connections management
    /models - API keys и model selection
    /settings - Workspace settings
    /team - Team management (для pro планов)
```

**Ключевые страницы**:

**4.1.1 Registration Flow**:
```typescript
// app/auth/register/page.tsx
export default function RegisterPage() {
  const [step, setStep] = useState<'email' | 'location' | 'channels'>('email');

  return (
    <div>
      {step === 'email' && (
        <EmailStep onNext={setStep} />
      )}
      {step === 'location' && (
        <LocationStep onNext={setStep} />
      )}
      {step === 'channels' && (
        <ChannelSetupStep />
      )}
    </div>
  );
}

function LocationStep({onNext}) {
  // Определить location через IP или спросить у пользователя
  // Нужно для регионального compliance и data residency
  return (
    <form onSubmit={handleSubmit}>
      <select name="region">
        <option value="eu">Europe</option>
        <option value="us">United States</option>
        <option value="asia">Asia-Pacific</option>
      </select>
      <button>Continue</button>
    </form>
  );
}
```

**4.1.2 Channel Connection Flow**:
```typescript
// app/dashboard/channels/page.tsx
export default function ChannelsPage() {
  const {data: connections} = useQuery('channels', fetchChannels);

  return (
    <div>
      <h1>Connect Your Channels</h1>
      <div className="grid gap-4">
        <ChannelCard
          name="Telegram"
          icon={TelegramIcon}
          connected={connections?.telegram?.enabled}
          onConnect={() => connectChannel('telegram')}
        />
        <ChannelCard
          name="WhatsApp"
          icon={WhatsAppIcon}
          connected={connections?.whatsapp?.enabled}
          onConnect={() => connectChannel('whatsapp')}
        />
        <ChannelCard
          name="Discord"
          icon={DiscordIcon}
          connected={connections?.discord?.enabled}
          onConnect={() => connectChannel('discord')}
        />
      </div>
    </div>
  );
}

async function connectChannel(channel: string) {
  const {code, instructions} = await api.post('/api/channels/initiate', {channel});

  // Show modal with pairing instructions
  showModal({
    title: `Connect ${channel}`,
    content: (
      <div>
        <p>{instructions}</p>
        <code className="text-2xl">{code}</code>
        <p>Code expires in 10 minutes</p>
      </div>
    ),
  });

  // Poll for connection status
  const interval = setInterval(async () => {
    const status = await api.get(`/api/channels/status?code=${code}`);
    if (status.connected) {
      clearInterval(interval);
      closeModal();
      showSuccess('Channel connected!');
    }
  }, 2000);
}
```

**4.1.3 Model Configuration**:
```typescript
// app/dashboard/models/page.tsx
export default function ModelsPage() {
  const {data: credentials} = useQuery('credentials', fetchCredentials);

  return (
    <div>
      <h1>Model Configuration</h1>

      <section>
        <h2>Platform Models (Included)</h2>
        <ModelList models={[
          {name: 'Llama 3.1 8B', free: true},
          {name: 'Mistral 7B', free: true},
        ]} />
      </section>

      <section>
        <h2>Bring Your Own Key</h2>
        <p>Connect your API keys to use premium models</p>

        <ProviderCard
          name="OpenAI"
          configured={credentials.openai}
          onConfigure={() => showApiKeyModal('openai')}
        />
        <ProviderCard
          name="Anthropic"
          configured={credentials.anthropic}
          onConfigure={() => showApiKeyModal('anthropic')}
        />
      </section>
    </div>
  );
}

function showApiKeyModal(provider: string) {
  showModal({
    title: `Add ${provider} API Key`,
    content: (
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          name="apiKey"
          placeholder="sk-..."
          required
        />
        <button>Save</button>
      </form>
    ),
  });
}
```

**4.1.4 Web Chat Interface**:
```typescript
// app/dashboard/chat/page.tsx
export default function ChatPage() {
  const {data: sessions} = useQuery('sessions', fetchSessions);
  const [activeSession, setActiveSession] = useState<string | null>(null);

  return (
    <div className="flex h-screen">
      <Sidebar sessions={sessions} onSelect={setActiveSession} />
      <ChatWindow sessionKey={activeSession} />
    </div>
  );
}

function ChatWindow({sessionKey}) {
  const {data: messages} = useQuery(['messages', sessionKey], () =>
    fetchMessages(sessionKey)
  );
  const [input, setInput] = useState('');

  const sendMessage = useMutation(async (text: string) => {
    await api.post('/api/gateway/sendMessage', {
      sessionKey,
      text,
      channel: 'web',
    });
  });

  return (
    <div className="flex flex-col flex-1">
      <MessageList messages={messages} />
      <MessageInput
        value={input}
        onChange={setInput}
        onSend={() => sendMessage.mutate(input)}
      />
    </div>
  );
}
```

#### 4.2 API Layer

**Действия**:
- [ ] Create REST API для frontend:
  ```typescript
  // src/api/server.ts
  import express from 'express';
  import cors from 'cors';

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Auth routes
  app.use('/api/auth', authRouter);

  // Protected routes
  app.use('/api/channels', requireAuth, channelsRouter);
  app.use('/api/credentials', requireAuth, credentialsRouter);
  app.use('/api/sessions', requireAuth, sessionsRouter);
  app.use('/api/gateway', requireAuth, gatewayProxyRouter);

  app.listen(3000);
  ```

- [ ] Gateway proxy для web clients:
  ```typescript
  // src/api/gateway-proxy.ts
  router.post('/api/gateway/:method', requireAuth, async (req, res) => {
    const {method} = req.params;
    const ctx: TenantContext = {
      tenantId: req.tenantId,
      userId: req.userId,
      userRole: req.userRole,
    };

    // Forward to gateway with tenant context
    const result = await gateway.call(method, ctx, req.body);
    res.json(result);
  });
  ```

---

### Фаза 5: Deployment & Operations (2-3 недели)

#### 5.1 Infrastructure Setup

**Рекомендуемый stack**:
```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: clawdbot
      POSTGRES_USER: clawdbot
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    # Для session caching и rate limiting

  gateway:
    build: .
    command: node dist/gateway-server.js
    environment:
      DATABASE_URL: postgres://clawdbot:${DB_PASSWORD}@postgres/clawdbot
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis
    deploy:
      replicas: 3 # Horizontal scaling

  web-api:
    build: .
    command: node dist/api-server.js
    environment:
      DATABASE_URL: postgres://clawdbot:${DB_PASSWORD}@postgres/clawdbot
      GATEWAY_URL: http://gateway:8080
    ports:
      - "3000:3000"

  vllm-llama:
    image: vllm/vllm-openai:latest
    command: --model meta-llama/Llama-3.1-8B-Instruct
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - web-api

volumes:
  postgres_data:
```

**Kubernetes alternative** (для production scale):
```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: clawdbot-gateway
spec:
  replicas: 5
  selector:
    matchLabels:
      app: gateway
  template:
    metadata:
      labels:
        app: gateway
    spec:
      containers:
      - name: gateway
        image: clawdbot/gateway:latest
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secrets
              key: url
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
```

#### 5.2 Monitoring & Observability

**Действия**:
- [ ] Add logging:
  ```typescript
  // src/infra/logger.ts
  import pino from 'pino';

  export function createLogger(tenantId: string) {
    return pino({
      level: 'info',
      base: {tenantId},
      formatters: {
        level: (label) => ({level: label}),
      },
    });
  }

  // Usage in gateway methods:
  const logger = createLogger(ctx.tenantId);
  logger.info({method: 'sendMessage', params}, 'Sending message');
  ```

- [ ] Add metrics:
  ```typescript
  // src/infra/metrics.ts
  import {Counter, Histogram} from 'prom-client';

  export const messageCounter = new Counter({
    name: 'clawdbot_messages_total',
    help: 'Total messages processed',
    labelNames: ['tenant_id', 'channel'],
  });

  export const responseTime = new Histogram({
    name: 'clawdbot_response_time_seconds',
    help: 'Response time in seconds',
    labelNames: ['tenant_id', 'method'],
  });
  ```

- [ ] Setup alerting:
  ```yaml
  # prometheus/alerts.yml
  groups:
  - name: clawdbot
    rules:
    - alert: HighErrorRate
      expr: rate(clawdbot_errors_total[5m]) > 0.05
      annotations:
        summary: High error rate detected

    - alert: SlowResponses
      expr: histogram_quantile(0.95, clawdbot_response_time_seconds) > 5
      annotations:
        summary: 95th percentile response time > 5s
  ```

#### 5.3 Backup & Disaster Recovery

**Действия**:
- [ ] Database backups:
  ```bash
  #!/bin/bash
  # scripts/backup-db.sh

  pg_dump -h $DB_HOST -U clawdbot clawdbot | \
    gzip | \
    aws s3 cp - s3://clawdbot-backups/$(date +%Y%m%d-%H%M%S).sql.gz
  ```

- [ ] Session data replication:
  ```typescript
  // src/storage/replication.ts
  export async function replicateSession(
    tenantId: string,
    sessionKey: string,
    data: SessionEntry
  ) {
    // Primary write to main DB
    await primaryDb.saveSession(tenantId, sessionKey, data);

    // Async replication to backup region
    await replicaDb.saveSession(tenantId, sessionKey, data).catch(err => {
      logger.error({err}, 'Replication failed');
    });
  }
  ```

---

### Фаза 6: Pricing & Billing (1-2 недели)

#### 6.1 Plan Tiers

**Рекомендуемые планы**:

| Feature | Free | Pro ($20/mo) | Enterprise |
|---------|------|--------------|------------|
| Messages/month | 1,000 | 50,000 | Unlimited |
| Hosted models | ✅ Llama, Mistral | ✅ + GPT-4o mini | Custom deployment |
| BYOK (custom APIs) | ❌ | ✅ | ✅ |
| Channels | 2 | Unlimited | Unlimited |
| Agents | 1 | 5 | Unlimited |
| Memory storage | 100 MB | 10 GB | Unlimited |
| Team members | 1 | 5 | Unlimited |
| Priority support | ❌ | ✅ | ✅ 24/7 |

**Действия**:
- [ ] Implement usage tracking:
  ```typescript
  // src/billing/usage-tracker.ts
  export async function trackUsage(
    tenantId: string,
    metric: 'message' | 'storage' | 'model_tokens',
    amount: number
  ) {
    await db.query(`
      INSERT INTO usage_events (tenant_id, metric, amount, timestamp)
      VALUES ($1, $2, $3, NOW())
    `, [tenantId, metric, amount]);
  }

  export async function getUsage(
    tenantId: string,
    period: 'current_month' | 'last_month'
  ): Promise<UsageStats> {
    // Aggregate from usage_events table
  }
  ```

- [ ] Integrate billing provider (Stripe):
  ```typescript
  // src/billing/stripe.ts
  import Stripe from 'stripe';

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  export async function createSubscription(
    tenantId: string,
    plan: 'pro' | 'enterprise'
  ) {
    const tenant = await db.getTenant(tenantId);

    const customer = await stripe.customers.create({
      email: tenant.email,
      metadata: {tenantId},
    });

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{price: PLAN_PRICES[plan]}],
    });

    await db.updateTenant(tenantId, {
      stripeCustomerId: customer.id,
      stripeSubscriptionId: subscription.id,
      planType: plan,
    });
  }
  ```

- [ ] Implement quota enforcement:
  ```typescript
  // src/gateway/quota-middleware.ts
  export async function enforceQuota(
    ctx: TenantContext,
    action: 'message' | 'agent_create'
  ) {
    const plan = await getTenantPlan(ctx.tenantId);
    const usage = await getUsage(ctx.tenantId, 'current_month');

    const limits = PLAN_LIMITS[plan];
    if (usage[action] >= limits[action]) {
      throw new QuotaExceededError(
        `${action} quota exceeded. Upgrade to continue.`
      );
    }

    await trackUsage(ctx.tenantId, action, 1);
  }
  ```

---

## Migration Strategy

### Для существующих single-user установок

**Опция 1: Cloud-first (рекомендуется)**
- Оставить CLI для разработчиков/self-hosted
- SaaS платформа для обычных пользователей
- CLI может работать как "pro tier" self-hosted версия

**Опция 2: Hybrid mode**
- CLI может синхронизироваться с cloud workspace
- Local execution + cloud backup

**Действия**:
- [ ] Add tenant export tool:
  ```bash
  clawdbot export --format cloud --output tenant-data.json
  ```

- [ ] Add tenant import API:
  ```typescript
  router.post('/api/tenant/import', requireAuth, async (req, res) => {
    const {sessions, credentials, config} = req.body;

    // Import into tenant's isolated namespace
    await importTenantData(req.tenantId, {sessions, credentials, config});

    res.json({success: true});
  });
  ```

---

## Testing Strategy

### Unit Tests
```typescript
// src/storage/__tests__/tenant-database.test.ts
describe('TenantDatabase', () => {
  it('isolates sessions by tenant', async () => {
    const db = new TenantDatabase();

    await db.saveSession('tenant1', 'session1', {data: 'A'});
    await db.saveSession('tenant2', 'session1', {data: 'B'});

    const session1 = await db.getSession('tenant1', 'session1');
    expect(session1.data).toBe('A');

    const session2 = await db.getSession('tenant2', 'session1');
    expect(session2.data).toBe('B');
  });
});
```

### Integration Tests
```typescript
// src/gateway/__tests__/tenant-isolation.e2e.test.ts
describe('Tenant Isolation', () => {
  it('prevents cross-tenant data access', async () => {
    const tenant1 = await createTestTenant();
    const tenant2 = await createTestTenant();

    const session1 = await gateway.call('recordSession', {
      tenantId: tenant1.id,
      sessionKey: 'test',
      data: {secret: 'tenant1-secret'},
    });

    // Try to access tenant1's session from tenant2
    await expect(
      gateway.call('getSession', {
        tenantId: tenant2.id,
        sessionKey: 'test',
      })
    ).rejects.toThrow('Session not found');
  });
});
```

### Load Tests
```typescript
// load-tests/concurrent-tenants.ts
import {check} from 'k6';
import http from 'k6/http';

export const options = {
  vus: 100, // 100 concurrent tenants
  duration: '5m',
};

export default function() {
  const tenantId = `tenant-${__VU}`;
  const res = http.post('http://gateway/api/gateway/sendMessage', JSON.stringify({
    tenantId,
    sessionKey: 'test',
    text: 'Hello',
  }));

  check(res, {
    'status 200': r => r.status === 200,
    'response time < 500ms': r => r.timings.duration < 500,
  });
}
```

---

## Security Considerations

### 1. Tenant Isolation
- [ ] PostgreSQL Row-Level Security для всех таблиц
- [ ] Audit logging всех cross-tenant операций
- [ ] Regular penetration testing

### 2. Credential Security
- [ ] Encrypt credentials at rest (AES-256)
- [ ] Use tenant-specific encryption keys
- [ ] Rotate keys периодически
- [ ] Never log decrypted credentials

### 3. API Security
- [ ] Rate limiting per tenant и per IP
- [ ] JWT tokens с коротким TTL (15 min)
- [ ] Refresh token rotation
- [ ] CORS whitelist для production domains

### 4. Channel Security
- [ ] Validate webhook signatures (Telegram, Discord)
- [ ] Implement replay attack prevention
- [ ] Sanitize user inputs
- [ ] Content filtering для abuse prevention

### 5. Model Security
- [ ] Prevent prompt injection attacks
- [ ] Rate limit model requests
- [ ] Monitor for policy violations
- [ ] Implement content filtering

---

## Timeline Summary

| Фаза | Длительность | Ключевые deliverables |
|------|--------------|------------------------|
| 0. Инфраструктура | 2-3 недели | Database, Auth, Tenant context |
| 1. Core Tenant | 3-4 недели | Session isolation, Gateway refactor |
| 2. Channels | 2-3 недели | Centralized bots, Pairing flow |
| 3. Models | 2 недели | Hosted models, BYOK |
| 4. Frontend | 3-4 недели | Dashboard, Chat UI |
| 5. Deployment | 2-3 недели | Infrastructure, Monitoring |
| 6. Billing | 1-2 недели | Stripe integration, Quotas |
| **Total** | **15-21 недель** | **~4-5 месяцев** |

---

## Next Steps

1. **Review этого плана** с командой
2. **Выбрать tech stack** для frontend (Next.js vs другие)
3. **Провизионить инфраструктуру** (database, servers)
4. **Начать Фазу 0** с database layer
5. **Setup CI/CD** для автоматического деплоя
6. **Создать staging environment** для testing

---

## Open Questions

1. **Data residency**: Нужны ли отдельные database instances per region (EU, US, Asia)?
2. **Model hosting**: Self-hosted vLLM vs managed services (Replicate, Together.ai)?
3. **WhatsApp**: Business API (платный) vs unofficial библиотека (риск бана)?
4. **Pricing**: Как считать usage для BYOK users (только gateway usage)?
5. **Mobile apps**: Нужны ли native iOS/Android apps или PWA достаточно?

---

**Автор плана**: Claude (Sonnet 4.5)
**Дата**: 2026-01-27
**Версия**: 1.0
