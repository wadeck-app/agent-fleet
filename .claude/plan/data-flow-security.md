# Data Flow & Security

## Message Flow Architecture

### State Updates (Orchestrator → UI)

```
┌─────────────┐                                    ┌─────────────┐
│ Orchestrator│                                    │   Web UI    │
│    Core     │                                    │   Server    │
└──────┬──────┘                                    └──────┬──────┘
       │                                                  │
       │ Event: Worker connected                         │
       ├───────────────────────────────────────────────► │
       │ { type: "worker.connected",                     │
       │   data: { workerId, status, ... } }             │
       │                                                  │
       │                                         Broadcast to browsers
       │                                                  ├─────► Browser 1
       │                                                  ├─────► Browser 2
       │                                                  └─────► Browser N
       │                                                  │
       │ Event: Flow execution progress                  │
       ├───────────────────────────────────────────────► │
       │ { type: "flow.progress",                        │
       │   data: { flowId, step, status, ... } }         │
       │                                                  │
       │ Event: Log entry                                │
       ├───────────────────────────────────────────────► │
       │ { type: "log",                                  │
       │   data: { level, message, timestamp } }         │
       │                                                  │
```

### Commands (UI → Orchestrator)

```
┌──────────┐         ┌─────────────┐              ┌─────────────┐
│ Browser  │         │   Web UI    │              │ Orchestrator│
│          │         │   Server    │              │    Core     │
└────┬─────┘         └──────┬──────┘              └──────┬──────┘
     │                      │                            │
     │ User clicks "Start"  │                            │
     ├─────────────────────►│                            │
     │                      │                            │
     │                      │ Validate session           │
     │                      ├─ ─ ─ ─ ─ ─ ─ ─ ┐          │
     │                      │                            │
     │                      │ Build command    │         │
     │                      ├─ ─ ─ ─ ─ ─ ─ ─ ┘          │
     │                      │                            │
     │                      │ Sign command               │
     │                      ├─ ─ ─ ─ ─ ─ ─ ─ ┐          │
     │                      │                            │
     │                      │ Send via WebSocket         │
     │                      ├───────────────────────────►│
     │                      │ { type: "command",         │
     │                      │   command: "start_flow",   │
     │                      │   params: {...},           │
     │                      │   signature: "..." }       │
     │                      │                            │
     │                      │                   Validate signature
     │                      │                            ├─ ─ ─ ─ ┐
     │                      │                            │
     │                      │                   Check whitelist
     │                      │                            ├─ ─ ─ ─ ┘
     │                      │                            │
     │                      │                   Execute command
     │                      │                            ├─ ─ ─ ─ ┐
     │                      │                            │
     │                      │ Command result             │
     │                      │◄───────────────────────────┤
     │                      │ { success: true,           │
     │                      │   data: {...} }            │
     │                      │                            │
     │ Update UI            │                            │
     │◄─────────────────────┤                            │
     │                      │                            │
```

## Security Layers

### Layer 1: Connection Authentication

**Orchestrator → UI WebSocket Handshake**

```typescript
// Orchestrator side
const ws = new WebSocket(uiEndpoint, {
  headers: {
    'Authorization': `Bearer ${config.authToken}`,
    'X-Orchestrator-Id': orchestratorId,
    'X-Orchestrator-Version': version
  }
});

// UI server side
wss.on('connection', (ws, request) => {
  const token = request.headers['authorization']?.replace('Bearer ', '');

  if (!validateToken(token)) {
    ws.close(1008, 'Unauthorized');
    auditLog.log('AUTH_FAILED', { ip: request.socket.remoteAddress });
    return;
  }

  // Connection accepted
  const orchestratorId = request.headers['x-orchestrator-id'];
  connectionManager.register(orchestratorId, ws);
  auditLog.log('AUTH_SUCCESS', { orchestratorId });
});
```

### Layer 2: Command Signing

**HMAC-SHA256 Signature**

```typescript
// UI server: Sign command
function signCommand(command: Command, secret: string): string {
  const payload = JSON.stringify({
    command: command.command,
    params: command.params,
    timestamp: Date.now()
  });

  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

// Orchestrator: Verify signature
function verifyCommand(message: SignedCommand, secret: string): boolean {
  const { command, params, timestamp, signature } = message;

  // Check timestamp (prevent replay attacks)
  if (Date.now() - timestamp > 60000) { // 1 minute window
    return false;
  }

  const payload = JSON.stringify({ command, params, timestamp });
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}
```

### Layer 3: Command Whitelist

```typescript
// Orchestrator: Command validation
const ALLOWED_COMMANDS = new Set([
  'start_flow',
  'stop_flow',
  'retry_flow',
  'get_worker_status',
  'disconnect_worker',
  'update_config' // With additional permission check
]);

function handleCommand(message: SignedCommand): CommandResult {
  // 1. Verify signature
  if (!verifyCommand(message, config.secret)) {
    return { success: false, error: 'Invalid signature' };
  }

  // 2. Check whitelist
  if (!ALLOWED_COMMANDS.has(message.command)) {
    auditLog.log('COMMAND_REJECTED', { command: message.command });
    return { success: false, error: 'Command not allowed' };
  }

  // 3. Check rate limit
  if (!rateLimiter.check(message.command)) {
    return { success: false, error: 'Rate limit exceeded' };
  }

  // 4. Execute
  return executeCommand(message);
}
```

### Layer 4: Browser Authentication

**Separate from Orchestrator Auth**

```typescript
// UI server: Browser session
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true, // HTTPS only
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000 // 24h
  }
}));

// OAuth provider (Google, GitHub, etc.)
app.get('/auth/login', passport.authenticate('google'));

app.get('/auth/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // Check user whitelist
    if (!isUserAllowed(req.user.email)) {
      return res.status(403).send('Unauthorized');
    }
    res.redirect('/dashboard');
  }
);

// Protect API routes
app.use('/api/*', requireAuth, requireRole(['admin', 'operator']));
```

## Security Configurations by Scenario

### Scenario 1: Remote UI (Production)

```typescript
{
  // Orchestrator config
  uiClients: [{
    endpoint: "wss://my-ui.com/ws/orchestrator",
    authToken: process.env.ORCHESTRATOR_TOKEN, // 256-bit random
    tlsVerify: true,
    reconnect: {
      enabled: true,
      maxAttempts: 10
    }
  }],

  // UI config
  security: {
    orchestratorAuth: {
      method: "bearer-token",
      expectedToken: process.env.ORCHESTRATOR_TOKEN,
      rotationEnabled: true,
      rotationInterval: "30d"
    },
    browserAuth: {
      method: "oauth",
      providers: ["google", "github"],
      allowedUsers: ["admin@company.com"],
      mfa: true
    },
    commands: {
      signingSecret: process.env.SIGNING_SECRET,
      timestampWindow: 60000,
      rateLimits: {
        start_flow: { points: 10, duration: 60 },
        stop_flow: { points: 20, duration: 60 }
      }
    },
    tls: {
      enabled: true,
      cert: "/path/to/cert.pem",
      key: "/path/to/key.pem"
    }
  }
}
```

### Scenario 2: Local Dev (Relaxed)

```typescript
{
  // Orchestrator config
  uiClients: [{
    endpoint: "ws://localhost:3000/ws/orchestrator",
    authToken: "dev-token-insecure",
    tlsVerify: false
  }],

  // UI config
  security: {
    orchestratorAuth: {
      method: "bearer-token",
      expectedToken: "dev-token-insecure"
    },
    browserAuth: {
      method: "none", // Or simple password
    },
    commands: {
      signingSecret: "dev-secret",
      timestampWindow: 300000, // 5 min (for debugging)
      rateLimits: null // Disabled
    },
    tls: {
      enabled: false
    }
  }
}
```

### Scenario 3: Embedded (Generated)

```typescript
{
  // Orchestrator config
  uiClients: [{
    endpoint: "ws://localhost:RANDOM_PORT/ws/orchestrator",
    authToken: generateSecureToken(), // Generated at runtime
    tlsVerify: false // localhost
  }],

  // UI config
  security: {
    orchestratorAuth: {
      method: "bearer-token",
      expectedToken: "<same-as-orchestrator>", // Passed via CLI arg
      connectionLimit: 1 // Only parent orchestrator
    },
    browserAuth: {
      method: "none", // Trust localhost
      allowedOrigins: ["http://localhost"]
    },
    commands: {
      signingSecret: generateSecureToken(),
      timestampWindow: 60000,
      rateLimits: null
    },
    tls: {
      enabled: false
    }
  }
}
```

## Audit Logging

```typescript
interface AuditEvent {
  timestamp: Date;
  level: 'INFO' | 'WARN' | 'ERROR';
  category: 'AUTH' | 'COMMAND' | 'CONNECTION';
  action: string;
  actor: {
    type: 'orchestrator' | 'browser';
    id: string;
    ip?: string;
  };
  details: Record<string, any>;
}

// Examples
auditLog.log({
  level: 'INFO',
  category: 'AUTH',
  action: 'ORCHESTRATOR_CONNECTED',
  actor: { type: 'orchestrator', id: 'orch-123' },
  details: { version: '1.0.0' }
});

auditLog.log({
  level: 'WARN',
  category: 'COMMAND',
  action: 'RATE_LIMIT_EXCEEDED',
  actor: { type: 'browser', id: 'user@example.com', ip: '1.2.3.4' },
  details: { command: 'start_flow', limit: 10 }
});

auditLog.log({
  level: 'ERROR',
  category: 'AUTH',
  action: 'INVALID_SIGNATURE',
  actor: { type: 'browser', id: 'unknown', ip: '5.6.7.8' },
  details: { command: 'delete_worker' }
});
```

## Network Security Considerations

### TLS/SSL
- **Remote UI**: TLS obligatoire (wss://, https://)
- **Local Dev**: TLS optionnel (ws://, http://)
- **Embedded**: Pas de TLS (localhost uniquement)

### Firewall Rules
```bash
# Orchestrator (inbound)
# Allow workers to connect
iptables -A INPUT -p tcp --dport 8080 -j ACCEPT

# Block UI port from external (scenario 3)
iptables -A INPUT -p tcp --dport 30000:40000 ! -i lo -j DROP

# UI Server (inbound) - scenario 1 only
# Allow HTTPS
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
# Allow WSS upgrade
iptables -A INPUT -p tcp --dport 443 -m state --state ESTABLISHED -j ACCEPT
```

### DDoS Protection (Scenario 1)
- CloudFlare ou AWS Shield devant UI
- Rate limiting par IP
- Connection limits
- WebSocket message size limits

```typescript
const wsOptions = {
  maxPayload: 100 * 1024, // 100KB max message
  perMessageDeflate: false, // Prevent decompression bombs
  clientTracking: true,
  maxClients: 100 // Limit concurrent connections
};

const wss = new WebSocketServer(wsOptions);
```

## Secrets Management

### Token Generation

```typescript
import crypto from 'crypto';

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex'); // 256 bits
}

function rotateToken(oldToken: string): string {
  const newToken = generateSecureToken();

  // Transition period: accept both
  validTokens.add(newToken);
  setTimeout(() => {
    validTokens.delete(oldToken);
  }, 5 * 60 * 1000); // 5 min grace period

  return newToken;
}
```

### Storage

```bash
# Development
.env (gitignored)
ORCHESTRATOR_TOKEN=dev-token-insecure
SIGNING_SECRET=dev-secret

# Production - Scenario 1
# Use secret management service
# AWS Secrets Manager, HashiCorp Vault, etc.

# Or encrypted config
openssl enc -aes-256-cbc -salt -in config.json -out config.json.enc
```

### Environment Variables

```typescript
// Orchestrator startup
const config = {
  uiClients: [{
    endpoint: process.env.UI_ENDPOINT,
    authToken: process.env.ORCHESTRATOR_TOKEN || generateSecureToken()
  }]
};

// Validation
if (config.mode === 'production') {
  if (!process.env.ORCHESTRATOR_TOKEN) {
    throw new Error('ORCHESTRATOR_TOKEN required in production');
  }
  if (process.env.ORCHESTRATOR_TOKEN.length < 32) {
    throw new Error('ORCHESTRATOR_TOKEN must be at least 32 characters');
  }
}
```

## Threat Model

### Threats Mitigated
- ✅ Unauthorized orchestrator connection (token auth)
- ✅ Command tampering (HMAC signature)
- ✅ Replay attacks (timestamp validation)
- ✅ Rate-based DoS (rate limiting)
- ✅ Unauthorized commands (whitelist)
- ✅ MITM attacks (TLS in production)
- ✅ Unauthorized browser access (OAuth)

### Threats Remaining
- ⚠️ Compromised auth token (rotation helps)
- ⚠️ Malicious insider with valid credentials
- ⚠️ Application-level vulnerabilities (XSS, etc.)
- ⚠️ Host compromise (game over anyway)

### Recommendations
1. Regular token rotation (30-90 days)
2. Monitoring & alerting on suspicious activity
3. Principle of least privilege (role-based commands)
4. Regular security audits
5. Keep dependencies updated
6. Use Content Security Policy in browser
7. Implement session timeouts
8. Log all sensitive operations
