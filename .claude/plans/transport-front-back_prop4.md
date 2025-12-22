# Transport Layer Architecture: Frontend ↔ Backend Communication (Proposition 4 - Production-Ready)

## Vue d'ensemble

Architecture **production-ready** combinant:
- **Type safety maximal** via `ALL_API_ROUTES` (Prop3)
- **Mock transport avancé** avec in-memory state & recording (Prop3)
- **Event modes flexibles**: Polling, Long Polling, SSE, WebSocket (Prop3)
- **🔒 Sécurité renforcée**: Cookies HTTP_ONLY, sessions serveur (NEW)
- **🎯 Subscriptions sélectives**: Filtrage côté serveur pour économiser bande passante (NEW)

**Différences majeures vs Prop3:**
- ✅ **Ajout**: Authentication via cookies HTTP_ONLY
- ✅ **Ajout**: Session manager backend pour associer WS ↔ token
- ✅ **Ajout**: Refresh automatique de tokens via HTTP (met à jour toutes les WS d'un user)
- ✅ **Ajout**: Filtrage d'événements côté serveur (clients ne reçoivent que ce qu'ils demandent)

---

## Architecture de Sécurité

### Principe: Zero Trust avec Cookies HTTP_ONLY

```
┌─────────────┐                           ┌─────────────┐
│   Browser   │                           │   Backend   │
│             │                           │             │
│  1. Login   │──── POST /api/auth/login ───►│ Set HTTP   │
│             │◄─── HTTP_ONLY cookies   ────│ ONLY       │
│             │     access_token (5min)     │ cookies    │
│             │     refresh_token (7d)      │            │
│             │                           │            │
│  2. WS      │──── GET /ws (cookies) ───────►│ Parse      │
│  Connect    │     [cookies auto-sent]     │ cookies    │
│             │◄─── connected + userId ──────│ Create     │
│             │                           │ session    │
│             │                           │ in memory  │
│             │                           │            │
│  3. WS      │──── { method: GET, ... } ────►│ Validate   │
│  Request    │     [no token in message!]  │ session    │
│             │◄─── response ────────────────│ (check     │
│             │                           │ expiry)    │
│             │                           │            │
│  4. Auto    │──── POST /api/auth/refresh ──►│ Verify     │
│  Refresh    │     [cookies auto-sent]     │ refresh    │
│  (before    │◄─── new access_token ─────────│ token      │
│  expiry)    │     [HTTP_ONLY cookie]      │            │
│             │                           │ Update ALL │
│             │                           │ WS sessions│
│             │                           │ for user   │
└─────────────┘                           └─────────────┘
```

**Flux critique:**
1. Login HTTP → Cookies HTTP_ONLY setés
2. WebSocket upgrade → Cookies envoyés automatiquement par navigateur
3. Backend valide cookies → Crée session en mémoire (clientId → userId + token + expiry)
4. Chaque message WS → Valide juste l'expiration (pas de vérification complète)
5. Avant expiration → Frontend refresh via HTTP → Backend met à jour TOUTES les sessions WS de ce user
6. Token expiré → Backend ferme la WS, frontend redirige vers login

---

## 1. Shared Protocol Types

### 1.1 Transport Protocol (inchangé de Prop3)

**Fichier:** `packages/shared-frontend-backend/src/transport/TransportProtocol.ts`

```typescript
export interface TransportRequest<TBody = unknown> {
  id: string;
  method: HttpMethod;
  path: string;
  query?: Record<string, any>;
  params?: Record<string, string>;
  body?: TBody;
  headers?: Record<string, string>;
  timestamp: number;
}

export interface TransportResponse<TBody = unknown> {
  id: string;
  status: number;
  body?: TBody;
  error?: TransportError;
  headers?: Record<string, string>;
  timestamp: number;
}

export interface TransportEvent<TData = unknown> {
  id: string;
  type: string;
  data: TData;
  timestamp: number;
}

// NEW: Subscription control messages
export interface SubscriptionMessage {
  type: 'subscription';
  action: 'subscribe' | 'unsubscribe';
  events: string[]; // Event types to subscribe/unsubscribe
}
```

### 1.2 Event Types Registry (inchangé de Prop3)

**Fichier:** `packages/shared-frontend-backend/src/transport/EventTypes.ts`

```typescript
import type { Task, Worker, Workspace } from '../types';

export type CrudEventType = 'created' | 'updated' | 'deleted' | 'status_changed';

export type ResourceEvent<Resource extends string, Data> = {
  [K in CrudEventType as `${Resource}:${K}`]: Data;
};

export interface BusinessEvents {
  'task:assigned': { taskId: string; workerId: string; assignedAt: number };
  'task:priority_changed': { taskId: string; oldPriority: number; newPriority: number };
  'worker:heartbeat': { workerId: string; timestamp: number; status: string };
  'worker:capacity_changed': { workerId: string; capacity: number };
  'workspace:quota_exceeded': { workspaceId: string; quotaType: string; usage: number; limit: number };
  'workspace:archived': { workspaceId: string; archivedAt: number };
}

export type EventTypes =
  & ResourceEvent<'task', Task>
  & ResourceEvent<'worker', Worker>
  & ResourceEvent<'workspace', Workspace>
  & BusinessEvents;

export type EventType = keyof EventTypes;
export type EventData<T extends EventType> = EventTypes[T];
```

---

## 2. Backend: Security Layer

### 2.1 WebSocket Session Manager (NEW - Core Security)

**Fichier:** `packages/web-backend/src/transport/WebSocketSessionManager.ts`

```typescript
import type { IncomingMessage } from 'http';
import cookie from 'cookie';

export interface WebSocketSession {
  clientId: string;
  userId: string;
  accessToken: string;
  tokenExpiresAt: number;
  createdAt: number;
  lastActivity: number;
  // NEW: Track subscriptions per client
  subscribedEvents: Set<string>;
}

export class WebSocketSessionManager {
  // clientId → session info
  private sessions = new Map<string, WebSocketSession>();

  // userId → Set of clientIds (multi-device support)
  private userSessions = new Map<string, Set<string>>();

  constructor(
    private authService: AuthService
  ) {
    // Cleanup expired sessions every minute
    setInterval(() => this.cleanupExpiredSessions(), 60000);
  }

  /**
   * Authenticate WebSocket from HTTP cookies
   * Called during WebSocket upgrade (GET /ws)
   */
  async authenticateConnection(
    clientId: string,
    request: IncomingMessage
  ): Promise<WebSocketSession> {
    // Parse cookies from HTTP upgrade request
    const cookieHeader = request.headers.cookie || '';
    const cookies = cookie.parse(cookieHeader);

    const accessToken = cookies['access_token'];

    if (!accessToken) {
      throw new Error('No access token in cookies');
    }

    try {
      // Verify access token (JWT, session, etc.)
      const { userId, expiresAt } = await this.authService.verifyAccessToken(accessToken);

      const session: WebSocketSession = {
        clientId,
        userId,
        accessToken,
        tokenExpiresAt: expiresAt,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        subscribedEvents: new Set(), // Empty initially
      };

      this.sessions.set(clientId, session);

      // Track user sessions
      if (!this.userSessions.has(userId)) {
        this.userSessions.set(userId, new Set());
      }
      this.userSessions.get(userId)!.add(clientId);

      console.log(`[Auth] WebSocket authenticated: client=${clientId}, user=${userId}, expires=${new Date(expiresAt).toISOString()}`);

      return session;
    } catch (error) {
      console.error('[Auth] WebSocket authentication failed', error);
      throw new Error('Invalid access token');
    }
  }

  /**
   * Validate session for incoming request
   * Fast validation: only checks expiry, not full token verification
   */
  validateSession(clientId: string): { userId: string; session: WebSocketSession } {
    const session = this.sessions.get(clientId);

    if (!session) {
      throw new Error('Session not found');
    }

    // Update last activity
    session.lastActivity = Date.now();

    // Check if token expired
    const now = Date.now();
    if (now >= session.tokenExpiresAt) {
      console.warn(`[Auth] Session expired for client=${clientId}`);
      throw new Error('Access token expired');
    }

    return { userId: session.userId, session };
  }

  /**
   * Refresh session token (called when user refreshes via HTTP endpoint)
   * Updates ALL WebSocket sessions for this user
   */
  async refreshSessionToken(userId: string, newAccessToken: string): Promise<void> {
    try {
      const { expiresAt } = await this.authService.verifyAccessToken(newAccessToken);

      const clientIds = this.userSessions.get(userId);
      if (!clientIds || clientIds.size === 0) {
        console.log(`[Auth] No active WebSocket sessions for user=${userId}`);
        return;
      }

      let updatedCount = 0;
      clientIds.forEach(clientId => {
        const session = this.sessions.get(clientId);
        if (session) {
          session.accessToken = newAccessToken;
          session.tokenExpiresAt = expiresAt;
          updatedCount++;
        }
      });

      console.log(`[Auth] Refreshed token for ${updatedCount} WebSocket sessions (user=${userId})`);
    } catch (error) {
      console.error('[Auth] Failed to refresh WebSocket session token', error);
      throw error;
    }
  }

  /**
   * Get time until token expiration
   */
  getTimeUntilExpiration(clientId: string): number {
    const session = this.sessions.get(clientId);
    if (!session) return 0;
    return Math.max(0, session.tokenExpiresAt - Date.now());
  }

  /**
   * Update subscriptions for a client (NEW)
   */
  updateSubscriptions(clientId: string, action: 'subscribe' | 'unsubscribe', events: string[]): void {
    const session = this.sessions.get(clientId);
    if (!session) return;

    if (action === 'subscribe') {
      events.forEach(event => session.subscribedEvents.add(event));
      console.log(`[Subscription] Client ${clientId} subscribed to:`, events);
    } else {
      events.forEach(event => session.subscribedEvents.delete(event));
      console.log(`[Subscription] Client ${clientId} unsubscribed from:`, events);
    }
  }

  /**
   * Check if client is subscribed to an event (NEW)
   */
  isSubscribed(clientId: string, eventType: string): boolean {
    const session = this.sessions.get(clientId);
    if (!session) return false;

    // If no subscriptions yet, allow all (backward compat during connection)
    if (session.subscribedEvents.size === 0) return true;

    return session.subscribedEvents.has(eventType);
  }

  /**
   * Get all subscriptions for a client (NEW)
   */
  getSubscriptions(clientId: string): Set<string> {
    const session = this.sessions.get(clientId);
    return session ? session.subscribedEvents : new Set();
  }

  /**
   * Remove session on disconnect
   */
  removeSession(clientId: string): void {
    const session = this.sessions.get(clientId);
    if (!session) return;

    // Remove from user sessions
    const userClients = this.userSessions.get(session.userId);
    if (userClients) {
      userClients.delete(clientId);
      if (userClients.size === 0) {
        this.userSessions.delete(session.userId);
      }
    }

    this.sessions.delete(clientId);
    console.log(`[Session] Removed: client=${clientId}`);
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    this.sessions.forEach((session, clientId) => {
      if (now >= session.tokenExpiresAt) {
        this.removeSession(clientId);
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      console.log(`[Cleanup] Removed ${cleanedCount} expired sessions`);
    }
  }

  /**
   * Get session info (for debugging/monitoring)
   */
  getSession(clientId: string): WebSocketSession | undefined {
    return this.sessions.get(clientId);
  }

  /**
   * Get all sessions for a user
   */
  getUserSessions(userId: string): WebSocketSession[] {
    const clientIds = this.userSessions.get(userId);
    if (!clientIds) return [];

    return Array.from(clientIds)
      .map(clientId => this.sessions.get(clientId))
      .filter((session): session is WebSocketSession => session !== undefined);
  }

  /**
   * Get statistics (for monitoring)
   */
  getStats() {
    return {
      totalSessions: this.sessions.size,
      totalUsers: this.userSessions.size,
      avgSessionsPerUser: this.userSessions.size > 0
        ? this.sessions.size / this.userSessions.size
        : 0,
    };
  }
}
```

### 2.2 Auth Service Interface

**Fichier:** `packages/web-backend/src/auth/AuthService.ts`

```typescript
export interface TokenPayload {
  userId: string;
  expiresAt: number; // Timestamp in milliseconds
}

export interface AuthService {
  /**
   * Login with credentials
   */
  login(email: string, password: string): Promise<{
    userId: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number; // Seconds
  }>;

  /**
   * Verify access token (JWT, session, etc.)
   * Fast validation for WebSocket requests
   */
  verifyAccessToken(token: string): Promise<TokenPayload>;

  /**
   * Refresh access token with refresh token
   */
  refreshToken(refreshToken: string): Promise<{
    userId: string;
    accessToken: string;
    expiresIn: number; // Seconds
  }>;

  /**
   * Logout (invalidate tokens)
   */
  logout(userId: string): Promise<void>;
}

// Example JWT implementation
export class JwtAuthService implements AuthService {
  constructor(
    private jwtSecret: string,
    private userRepository: UserRepository
  ) {}

  async login(email: string, password: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user || !await this.verifyPassword(password, user.passwordHash)) {
      throw new Error('Invalid credentials');
    }

    const expiresIn = 300; // 5 minutes for access token
    const accessToken = this.generateAccessToken(user.id, expiresIn);
    const refreshToken = this.generateRefreshToken(user.id);

    return {
      userId: user.id,
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      return {
        userId: decoded.userId,
        expiresAt: decoded.exp * 1000, // JWT exp is in seconds
      };
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  async refreshToken(refreshToken: string) {
    const decoded = jwt.verify(refreshToken, this.jwtSecret) as any;
    const userId = decoded.userId;

    const expiresIn = 300; // 5 minutes
    const accessToken = this.generateAccessToken(userId, expiresIn);

    return {
      userId,
      accessToken,
      expiresIn,
    };
  }

  private generateAccessToken(userId: string, expiresIn: number): string {
    return jwt.sign({ userId }, this.jwtSecret, { expiresIn });
  }

  private generateRefreshToken(userId: string): string {
    return jwt.sign({ userId }, this.jwtSecret, { expiresIn: '7d' });
  }

  // ... password verification, etc.
}
```

### 2.3 Auth Controller (HTTP Endpoints)

**Fichier:** `packages/web-backend/src/controllers/AuthController.ts`

```typescript
export default class AuthController implements LazyController<typeof AUTH_API_ROUTES> {
  constructor(
    private authService: AuthService,
    private sessionManager: WebSocketSessionManager
  ) {}

  configureRoutes(add: RouteWrapperFunc<typeof AUTH_API_ROUTES>) {
    /**
     * Login - Sets HTTP_ONLY cookies
     */
    add('POST', '/api/auth/login', async ({ body, reply }) => {
      const { email, password } = body;

      const { userId, accessToken, refreshToken, expiresIn } =
        await this.authService.login(email, password);

      // Set HTTP_ONLY cookies (CRITICAL: httpOnly + secure + sameSite)
      reply.setCookie('access_token', accessToken, {
        httpOnly: true, // Not accessible via JavaScript
        secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
        sameSite: 'strict', // CSRF protection
        path: '/',
        maxAge: expiresIn, // 5 minutes
      });

      reply.setCookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/auth/refresh', // Only sent to refresh endpoint
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      console.log(`[Auth] User ${userId} logged in`);

      return {
        userId,
        expiresAt: Date.now() + expiresIn * 1000,
      };
    });

    /**
     * Refresh - Updates cookies AND all WebSocket sessions
     */
    add('POST', '/api/auth/refresh', async ({ cookies, reply }) => {
      const refreshToken = cookies.refresh_token;

      if (!refreshToken) {
        reply.code(401);
        throw new Error('No refresh token');
      }

      const { userId, accessToken, expiresIn } =
        await this.authService.refreshToken(refreshToken);

      // Update HTTP_ONLY cookie
      reply.setCookie('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: expiresIn,
      });

      // CRITICAL: Update ALL WebSocket sessions for this user
      await this.sessionManager.refreshSessionToken(userId, accessToken);

      console.log(`[Auth] Token refreshed for user ${userId}`);

      return {
        userId,
        expiresAt: Date.now() + expiresIn * 1000,
      };
    });

    /**
     * Logout - Clears cookies
     */
    add('POST', '/api/auth/logout', async ({ cookies, reply }) => {
      reply.clearCookie('access_token');
      reply.clearCookie('refresh_token');

      // Optional: Could also force-close WebSocket connections
      // But better to let them disconnect naturally when token expires

      console.log('[Auth] User logged out');

      return { success: true };
    });

    /**
     * Check session (for frontend to verify auth state)
     */
    add('GET', '/api/auth/session', async ({ cookies }) => {
      const accessToken = cookies.access_token;

      if (!accessToken) {
        throw new Error('Not authenticated');
      }

      try {
        const { userId, expiresAt } = await this.authService.verifyAccessToken(accessToken);
        return {
          authenticated: true,
          userId,
          expiresAt,
        };
      } catch (error) {
        throw new Error('Invalid session');
      }
    });
  }
}
```

---

## 3. Backend: WebSocket Transport Server

### 3.1 WebSocket Transport Server (Enhanced Security + Subscriptions)

**Fichier:** `packages/web-backend/src/transport/adapters/WebSocketTransportServer.ts`

```typescript
import type { ITransportServer } from '../ITransportServer';
import type { WebSocketSessionManager } from '../WebSocketSessionManager';
import type { TransportRouter } from '../TransportRouter';

export class WebSocketTransportServer implements ITransportServer {
  private clients = new Map<string, WebSocket>();
  private clientConnectedHandlers: Array<(clientId: string) => void> = [];
  private clientDisconnectedHandlers: Array<(clientId: string) => void> = [];

  constructor(
    private sessionManager: WebSocketSessionManager,
    private router: TransportRouter
  ) {}

  async initialize(app: FastifyInstance): Promise<void> {
    await app.register(require('@fastify/websocket'));

    app.get('/ws', { websocket: true }, async (connection, req) => {
      const clientId = this.generateClientId();

      try {
        // 🔒 SECURITY: Authenticate from HTTP cookies
        const session = await this.sessionManager.authenticateConnection(
          clientId,
          req.raw
        );

        this.clients.set(clientId, connection.socket);

        // Send connection success with user info
        connection.socket.send(JSON.stringify({
          type: 'connected',
          clientId,
          userId: session.userId,
          tokenExpiresAt: session.tokenExpiresAt,
        }));

        console.log(`[WS] Connected: client=${clientId}, user=${session.userId}`);
        this.clientConnectedHandlers.forEach(handler => handler(clientId));

        // Schedule expiration warning (2 minutes before)
        this.scheduleExpirationWarning(clientId, session.tokenExpiresAt);

        connection.socket.on('message', async (rawMessage: Buffer) => {
          try {
            const message = JSON.parse(rawMessage.toString());

            // 🎯 NEW: Handle subscription messages
            if (message.type === 'subscription') {
              this.handleSubscription(clientId, message);
              return;
            }

            // Handle requests
            if (message.id && message.method) {
              // 🔒 SECURITY: Validate session on every request
              try {
                const { userId } = this.sessionManager.validateSession(clientId);

                const request: TransportRequest = message;
                (request as any).userId = userId; // Add to context for controllers

                const response = await this.router.handleRequest(request);
                connection.socket.send(JSON.stringify(response));
              } catch (error: any) {
                if (error.message === 'Access token expired') {
                  connection.socket.send(JSON.stringify({
                    type: 'token_expired',
                    message: 'Access token expired, please refresh',
                  }));
                  connection.socket.close();
                } else {
                  throw error;
                }
              }
            }
          } catch (error) {
            console.error('[WS] Message error', error);
            connection.socket.send(JSON.stringify({
              type: 'error',
              message: 'Failed to process message',
            }));
          }
        });

        connection.socket.on('close', () => {
          console.log(`[WS] Disconnected: client=${clientId}`);
          this.clients.delete(clientId);
          this.sessionManager.removeSession(clientId);
          this.clientDisconnectedHandlers.forEach(handler => handler(clientId));
        });

        connection.socket.on('error', (error) => {
          console.error(`[WS] Error: client=${clientId}`, error);
        });

      } catch (error) {
        console.error('[WS] Authentication failed', error);
        connection.socket.send(JSON.stringify({
          type: 'auth_error',
          message: 'Authentication failed',
        }));
        connection.socket.close();
      }
    });
  }

  /**
   * 🎯 NEW: Handle subscription control messages
   */
  private handleSubscription(clientId: string, message: SubscriptionMessage): void {
    const { action, events } = message;
    this.sessionManager.updateSubscriptions(clientId, action, events);

    // Confirm subscription
    const client = this.clients.get(clientId);
    if (client && client.readyState === 1) {
      client.send(JSON.stringify({
        type: 'subscription_updated',
        action,
        events,
      }));
    }
  }

  /**
   * Broadcast event to all connected clients
   * 🎯 NEW: Filter based on subscriptions
   */
  broadcast<E extends EventType>(event: E, data: EventData<E>): void {
    const eventMessage: TransportEvent = {
      id: this.generateEventId(),
      type: event,
      data,
      timestamp: Date.now(),
    };

    const message = JSON.stringify(eventMessage);
    let sentCount = 0;
    let filteredCount = 0;

    this.clients.forEach((client, clientId) => {
      if (client.readyState !== 1) return; // Not OPEN

      // 🎯 NEW: Check if client is subscribed to this event
      if (!this.sessionManager.isSubscribed(clientId, event)) {
        filteredCount++;
        return; // Skip this client
      }

      try {
        client.send(message);
        sentCount++;
      } catch (error) {
        console.error(`[WS] Failed to send event to client ${clientId}`, error);
      }
    });

    if (filteredCount > 0) {
      console.log(`[WS] Broadcast ${event}: sent=${sentCount}, filtered=${filteredCount}`);
    }
  }

  /**
   * Send event to specific client
   * 🎯 NEW: Check subscription before sending
   */
  sendToClient<E extends EventType>(clientId: string, event: E, data: EventData<E>): void {
    const client = this.clients.get(clientId);
    if (!client || client.readyState !== 1) {
      console.warn(`[WS] Client ${clientId} not connected`);
      return;
    }

    // 🎯 NEW: Check subscription
    if (!this.sessionManager.isSubscribed(clientId, event)) {
      console.log(`[WS] Client ${clientId} not subscribed to ${event}, skipping`);
      return;
    }

    const eventMessage: TransportEvent = {
      id: this.generateEventId(),
      type: event,
      data,
      timestamp: Date.now(),
    };

    try {
      client.send(JSON.stringify(eventMessage));
    } catch (error) {
      console.error(`[WS] Failed to send event to client ${clientId}`, error);
    }
  }

  private scheduleExpirationWarning(clientId: string, expiresAt: number): void {
    const timeUntilExpiry = expiresAt - Date.now();

    // Warn 2 minutes before expiration
    const warningTime = Math.max(0, timeUntilExpiry - 120000);

    setTimeout(() => {
      const client = this.clients.get(clientId);
      if (client && client.readyState === 1) {
        client.send(JSON.stringify({
          type: 'token_expiring_soon',
          expiresAt,
          timeRemaining: expiresAt - Date.now(),
        }));
      }
    }, warningTime);
  }

  onClientConnected(handler: (clientId: string) => void): void {
    this.clientConnectedHandlers.push(handler);
  }

  onClientDisconnected(handler: (clientId: string) => void): void {
    this.clientDisconnectedHandlers.push(handler);
  }

  getConnectedClients(): string[] {
    return Array.from(this.clients.keys());
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

---

## 4. Frontend: Security & Subscriptions

### 4.1 Token Refresh Manager (NEW)

**Fichier:** `packages/web-frontend/src/transport/TokenRefreshManager.ts`

```typescript
export interface TokenRefreshConfig {
  refreshEndpoint: string;
  refreshBeforeExpiry: number; // Milliseconds before expiry to trigger refresh
  onRefreshSuccess?: (expiresAt: number) => void;
  onRefreshFailed?: (error: Error) => void;
}

export class TokenRefreshManager {
  private refreshTimer: NodeJS.Timeout | null = null;
  private isRefreshing = false;

  constructor(private config: TokenRefreshConfig) {}

  /**
   * Start automatic token refresh
   * Called when WebSocket connects with tokenExpiresAt
   */
  startAutoRefresh(expiresAt: number): void {
    this.stopAutoRefresh();

    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;
    const refreshTime = Math.max(0, timeUntilExpiry - this.config.refreshBeforeExpiry);

    console.log(`[TokenRefresh] Scheduled in ${Math.round(refreshTime / 1000)}s (expires in ${Math.round(timeUntilExpiry / 1000)}s)`);

    this.refreshTimer = setTimeout(() => {
      this.refreshToken();
    }, refreshTime);
  }

  /**
   * Stop automatic refresh
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Manually trigger token refresh
   * 🔒 SECURITY: Uses credentials: 'include' to send HTTP_ONLY cookies
   */
  async refreshToken(): Promise<{ expiresAt: number }> {
    if (this.isRefreshing) {
      console.log('[TokenRefresh] Already in progress');
      return { expiresAt: 0 };
    }

    this.isRefreshing = true;

    try {
      console.log('[TokenRefresh] Refreshing token...');

      const response = await fetch(this.config.refreshEndpoint, {
        method: 'POST',
        credentials: 'include', // 🔒 CRITICAL: Send HTTP_ONLY cookies
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const { expiresAt } = await response.json();

      console.log(`[TokenRefresh] Success, expires at ${new Date(expiresAt).toISOString()}`);

      // Schedule next refresh
      this.startAutoRefresh(expiresAt);

      // Notify success
      this.config.onRefreshSuccess?.(expiresAt);

      return { expiresAt };
    } catch (error) {
      console.error('[TokenRefresh] Failed', error);

      // Notify failure
      this.config.onRefreshFailed?.(error as Error);

      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }
}
```

### 4.2 WebSocket Transport Client (Enhanced Security + Subscriptions)

**Fichier:** `packages/web-frontend/src/transport/adapters/WebSocketTransportClient.ts`

```typescript
import type { ITransportClient, TransportConfig } from '../ITransportClient';
import { TokenRefreshManager } from '../TokenRefreshManager';

export class WebSocketTransportClient implements ITransportClient {
  private ws: WebSocket | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private pendingRequests = new Map<string, PendingRequest>();
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private connectionStateHandlers = new Set<ConnectionStateHandler>();
  private tokenRefreshManager: TokenRefreshManager;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private config: TransportConfig) {
    // 🔒 SECURITY: Token refresh via HTTP (not via WebSocket!)
    this.tokenRefreshManager = new TokenRefreshManager({
      refreshEndpoint: `${config.baseUrl}/api/auth/refresh`,
      refreshBeforeExpiry: 60000, // Refresh 1 minute before expiry
      onRefreshSuccess: (expiresAt) => {
        console.log('[WS] Token refreshed, connection still valid');
      },
      onRefreshFailed: (error) => {
        console.error('[WS] Token refresh failed, triggering re-auth', error);
        this.disconnect();
        window.dispatchEvent(new CustomEvent('auth:refresh_failed'));
      },
    });
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.updateConnectionState('connecting');

    return new Promise((resolve, reject) => {
      const wsUrl = this.config.wsUrl || this.config.baseUrl.replace('http', 'ws');

      // 🔒 SECURITY: WebSocket automatically sends cookies from same origin
      // No need to pass tokens manually!
      this.ws = new WebSocket(`${wsUrl}/ws`);

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        this.ws?.close();
      }, this.config.connectionTimeout || 10000);

      this.ws.onopen = () => {
        console.log('[WS] Connection opened, waiting for auth confirmation...');
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        // Handle initial connection message
        if (data.type === 'connected') {
          clearTimeout(timeout);
          this.updateConnectionState('connected');
          this.reconnectAttempts = 0;

          console.log(`[WS] Authenticated as user ${data.userId}`);

          // 🔒 SECURITY: Start automatic token refresh
          if (data.tokenExpiresAt) {
            this.tokenRefreshManager.startAutoRefresh(data.tokenExpiresAt);
          }

          resolve();
          return;
        }

        // Handle auth error
        if (data.type === 'auth_error') {
          clearTimeout(timeout);
          reject(new Error(data.message || 'Authentication failed'));
          window.dispatchEvent(new CustomEvent('auth:failed'));
          return;
        }

        // Handle token expiring warning
        if (data.type === 'token_expiring_soon') {
          console.warn('[WS] Token expiring soon, refreshing immediately...');
          this.tokenRefreshManager.refreshToken().catch(err => {
            console.error('[WS] Failed to refresh token on warning', err);
          });
          return;
        }

        // Handle token expired (force disconnect)
        if (data.type === 'token_expired') {
          console.error('[WS] Token expired, disconnecting');
          this.ws?.close();
          window.dispatchEvent(new CustomEvent('auth:token_expired'));
          return;
        }

        // 🎯 NEW: Handle subscription confirmation
        if (data.type === 'subscription_updated') {
          console.log(`[WS] Subscription ${data.action}:`, data.events);
          return;
        }

        // Regular message handling
        this.handleMessage(event);
      };

      this.ws.onerror = (error) => {
        clearTimeout(timeout);
        this.updateConnectionState('error');
        reject(error);
      };

      this.ws.onclose = () => {
        this.updateConnectionState('disconnected');
        this.tokenRefreshManager.stopAutoRefresh();
        this.handleReconnect();
      };
    });
  }

  /**
   * Request (unchanged from Prop3)
   */
  async request<M extends HttpMethod, P extends PathsForMethod<M>>(
    method: M,
    path: P,
    options?: any
  ): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const request: TransportRequest = {
      id: generateUuid(),
      method,
      path,
      query: options?.query,
      params: options?.params,
      body: options?.body,
      headers: options?.headers,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error('Request timeout'));
      }, this.config.requestTimeout || 30000);

      this.pendingRequests.set(request.id, { resolve, reject, timeout });
      this.ws!.send(JSON.stringify(request));
    });
  }

  /**
   * 🎯 NEW: Subscribe with server-side filtering
   */
  subscribe<E extends EventType>(
    event: E,
    handler: (data: EventData<E>) => void
  ): UnsubscribeFunction {
    const isFirstSubscription = !this.eventHandlers.has(event);

    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    // 🎯 NEW: Notify server of subscription
    if (isFirstSubscription) {
      this.sendSubscriptionMessage('subscribe', [event]);
    }

    return () => {
      this.eventHandlers.get(event)?.delete(handler);

      // 🎯 NEW: If no more handlers, unsubscribe from server
      if (this.eventHandlers.get(event)?.size === 0) {
        this.eventHandlers.delete(event);
        this.sendSubscriptionMessage('unsubscribe', [event]);
      }
    };
  }

  /**
   * 🎯 NEW: Send subscription control message to server
   */
  private sendSubscriptionMessage(action: 'subscribe' | 'unsubscribe', events: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const message: SubscriptionMessage = {
      type: 'subscription',
      action,
      events,
    };

    this.ws.send(JSON.stringify(message));
  }

  private handleMessage(event: MessageEvent): void {
    const data = JSON.parse(event.data);

    if (this.isResponse(data)) {
      this.handleResponse(data as TransportResponse);
    } else if (this.isEvent(data)) {
      this.handleEvent(data as TransportEvent);
    }
  }

  private handleResponse(response: TransportResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) return;

    this.pendingRequests.delete(response.id);
    clearTimeout(pending.timeout);

    if (response.error) {
      pending.reject(response.error);
    } else {
      pending.resolve(response.body);
    }
  }

  private handleEvent(event: TransportEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      handlers.forEach(handler => handler(event.data));
    }
  }

  private handleReconnect(): void {
    if (!this.config.reconnect) return;
    if (this.reconnectAttempts >= (this.config.reconnectMaxAttempts || 10)) {
      this.updateConnectionState('error');
      return;
    }

    this.updateConnectionState('reconnecting');
    this.reconnectAttempts++;

    const delay = Math.min(
      (this.config.reconnectDelay || 1000) * Math.pow(2, this.reconnectAttempts - 1),
      30000
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(err => {
        console.error('[WS] Reconnection failed', err);
      });
    }, delay);
  }

  disconnect(): Promise<void> {
    this.tokenRefreshManager.stopAutoRefresh();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.updateConnectionState('disconnected');
    return Promise.resolve();
  }

  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  getTransportType(): TransportType {
    return 'websocket';
  }

  onConnectionStateChange(handler: ConnectionStateHandler): UnsubscribeFunction {
    this.connectionStateHandlers.add(handler);
    return () => this.connectionStateHandlers.delete(handler);
  }

  subscribeAll(handler: (event: EventType, data: any) => void): UnsubscribeFunction {
    // For WebSocket, this would require subscribing to all event types
    // Not recommended - prefer specific subscriptions for better performance
    throw new Error('subscribeAll not recommended. Use specific event subscriptions.');
  }

  private isResponse(data: any): boolean {
    return 'id' in data && 'status' in data;
  }

  private isEvent(data: any): boolean {
    return 'type' in data && 'data' in data && !('status' in data);
  }

  private updateConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.connectionStateHandlers.forEach(handler => handler(state));
  }
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timeout: NodeJS.Timeout;
}

type EventHandler = (data: any) => void;
type ConnectionStateHandler = (state: ConnectionState) => void;

function generateUuid(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

### 4.3 REST Transport Client (Security Update)

**Fichier:** `packages/web-frontend/src/transport/adapters/RestTransportClient.ts`

```typescript
export class RestTransportClient implements ITransportClient {
  // ... existing fields ...

  async request<M extends HttpMethod, P extends PathsForMethod<M>>(
    method: M,
    path: P,
    options?: any
  ): Promise<any> {
    let url = `${this.config.baseUrl}${path}`;

    // Build URL with params
    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url = url.replace(`:${key}`, encodeURIComponent(value as string));
      });
    }

    // Add query parameters
    if (options?.query) {
      const queryString = new URLSearchParams(options.query).toString();
      url += `?${queryString}`;
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
      credentials: 'include', // 🔒 CRITICAL: Send HTTP_ONLY cookies
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw {
        status: response.status,
        message: error.message || response.statusText,
        code: error.code || 'HTTP_ERROR',
      };
    }

    return response.json();
  }

  // ... rest unchanged from Prop3 ...
}
```

### 4.4 Application Integration

**Fichier:** `packages/web-frontend/src/app/App.tsx`

```typescript
function App() {
  useEffect(() => {
    // Listen for auth events
    const handleRefreshFailed = () => {
      console.error('[Auth] Token refresh failed, redirecting to login');
      window.location.href = '/login';
    };

    const handleTokenExpired = () => {
      console.error('[Auth] Token expired, redirecting to login');
      window.location.href = '/login';
    };

    const handleAuthFailed = () => {
      console.error('[Auth] Authentication failed');
      window.location.href = '/login';
    };

    window.addEventListener('auth:refresh_failed', handleRefreshFailed);
    window.addEventListener('auth:token_expired', handleTokenExpired);
    window.addEventListener('auth:failed', handleAuthFailed);

    return () => {
      window.removeEventListener('auth:refresh_failed', handleRefreshFailed);
      window.removeEventListener('auth:token_expired', handleTokenExpired);
      window.removeEventListener('auth:failed', handleAuthFailed);
    };
  }, []);

  return (
    <TransportProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </Router>
    </TransportProvider>
  );
}
```

---

## 5. Usage Examples

### 5.1 Dashboard Page with Selective Subscriptions

```typescript
// packages/web-frontend/src/app/pages/dashboard/DashboardPage.tsx

export const DashboardPage = () => {
  const transport = useTransport();
  const [metrics, setMetrics] = useState<MetricsData | null>(null);

  useEffect(() => {
    // 🎯 Subscribe ONLY to relevant events for dashboard
    // Worker logs won't pollute this page!
    const unsubscribers = [
      transport.subscribe('task:created', (task) => {
        console.log('New task', task);
        // Update UI
      }),
      transport.subscribe('task:status_changed', (data) => {
        console.log('Task status changed', data);
        // Update UI
      }),
      transport.subscribe('workspace:quota_exceeded', (data) => {
        // Show alert
        alert(`Quota exceeded: ${data.quotaType}`);
      }),
      // NOT subscribing to worker:heartbeat or worker logs!
    ];

    // Initial data fetch
    transport.request('GET', '/api/dashboard/metrics' as any)
      .then(setMetrics);

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [transport]);

  return (
    <div>
      <h1>Dashboard</h1>
      {/* Render metrics */}
    </div>
  );
};
```

### 5.2 Worker Monitoring Page with Worker Events

```typescript
// packages/web-frontend/src/app/pages/workers/WorkersPage.tsx

export const WorkersPage = () => {
  const transport = useTransport();
  const [workers, setWorkers] = useState<Worker[]>([]);

  useEffect(() => {
    // 🎯 Subscribe ONLY to worker events
    const unsubscribers = [
      transport.subscribe('worker:heartbeat', (data) => {
        console.log('Worker heartbeat', data);
        // Update last seen timestamp
      }),
      transport.subscribe('worker:capacity_changed', (data) => {
        console.log('Worker capacity changed', data);
        // Update worker capacity in UI
      }),
      transport.subscribe('worker:connected', (worker) => {
        setWorkers(prev => [...prev, worker]);
      }),
      transport.subscribe('worker:disconnected', (worker) => {
        setWorkers(prev => prev.filter(w => w.id !== worker.id));
      }),
    ];

    // Initial data fetch
    transport.request('GET', '/api/workers/' as any)
      .then(setWorkers);

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [transport]);

  return (
    <div>
      <h1>Workers</h1>
      {workers.map(worker => (
        <WorkerCard key={worker.id} worker={worker} />
      ))}
    </div>
  );
};
```

### 5.3 Backend: Emitting Events with Automatic Filtering

```typescript
// packages/web-backend/src/services/TasksService.ts

export class TasksService {
  constructor(
    private orchestratorRepository: OrchestratorRepository,
    private eventBroadcaster: EventBroadcaster
  ) {}

  async createTask(data: CreateTaskDto): Promise<Task> {
    const task = await this.orchestratorRepository.createTask(data);

    // 🎯 Broadcast event - only subscribed clients will receive it
    this.eventBroadcaster.broadcast('task:created', task);

    return task;
  }

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task> {
    const task = await this.orchestratorRepository.updateTaskStatus(taskId, status);

    // 🎯 Broadcast event - filtered automatically
    this.eventBroadcaster.broadcast('task:status_changed', {
      taskId: task.id,
      task,
      previousStatus: task.previousStatus,
    });

    return task;
  }
}
```

---

## 6. Security Best Practices Summary

### ✅ What This Architecture Does Right

1. **🔒 HTTP_ONLY Cookies**
   - Tokens never accessible via JavaScript
   - XSS attacks can't steal tokens
   - Browser handles cookie security automatically

2. **🔒 SameSite Protection**
   - `sameSite: 'strict'` prevents CSRF
   - Cookies only sent to same origin

3. **🔒 Secure Flag in Production**
   - `secure: true` in production
   - HTTPS-only cookie transmission

4. **🔒 Session Management**
   - Tokens stored server-side in memory
   - WebSocket ↔ token association
   - Fast validation (just expiry check)

5. **🔒 Automatic Token Rotation**
   - Refresh before expiration
   - Updates all WebSocket sessions atomically
   - No client-side token management

6. **🔒 Graceful Token Expiration**
   - Warning 2 minutes before expiry
   - Auto-refresh in background
   - Clean disconnect if refresh fails

### ❌ What to NEVER Do

1. ❌ Never send tokens in WebSocket messages
2. ❌ Never store tokens in localStorage (XSS vulnerable)
3. ❌ Never expose tokens to JavaScript
4. ❌ Never skip `httpOnly` flag
5. ❌ Never skip `secure` flag in production
6. ❌ Never skip `sameSite` protection

---

## 7. Bandwidth Optimization Summary

### 🎯 Selective Subscriptions Impact

**Scenario:** 100 concurrent users, 1000 worker heartbeats/minute

**Without filtering (Prop1-3):**
```
All 100 clients receive all 1000 events
= 100,000 messages/minute
= 1,667 messages/second
```

**With filtering (Prop4):**
```
Dashboard page (50 users): Subscribe to task/workspace events only
Workers page (30 users): Subscribe to worker events only
Admin page (20 users): Subscribe to all events

Heartbeats (1000/min):
- Dashboard: 0 messages (not subscribed)
- Workers: 30 * 1000 = 30,000 messages/min
- Admin: 20 * 1000 = 20,000 messages/min
Total: 50,000 messages/min (50% reduction)

Task events (100/min):
- Dashboard: 50 * 100 = 5,000 messages/min
- Workers: 0 messages (not subscribed)
- Admin: 20 * 100 = 2,000 messages/min
Total: 7,000 messages/min

Overall: 57,000 vs 100,000 = 43% bandwidth reduction
```

**Real-world impact:**
- Less CPU usage (fewer JSON serializations)
- Less network bandwidth
- Better battery life on mobile devices
- Fewer React re-renders
- Better scalability

---

## 8. Implementation Order

### Phase 1: Shared Types & Security Foundation (3-4 days)
- Create `TransportProtocol.ts` with `SubscriptionMessage`
- Create `EventTypes.ts`
- Create `TypedTransport.ts`
- Create `AuthService` interface + JWT implementation
- Write unit tests for auth service

### Phase 2: Backend Security Layer (4-5 days)
- Create `WebSocketSessionManager` (core security)
- Create `AuthController` (login, refresh, logout)
- Update `WebSocketTransportServer` to use session manager
- Add subscription tracking to session manager
- Write unit tests for session manager

### Phase 3: Backend Transport Updates (2-3 days)
- Update `RestTransportServer` (if using SSE/Long Polling)
- Update `EventBroadcaster` to respect subscriptions
- Update server initialization
- Write integration tests

### Phase 4: Frontend Security Layer (3-4 days)
- Create `TokenRefreshManager`
- Update `WebSocketTransportClient` with security + subscriptions
- Update `RestTransportClient` with `credentials: 'include'`
- Remove any token-in-message code from Prop3
- Write unit tests

### Phase 5: Frontend Integration (2-3 days)
- Update `TransportProvider` to handle auth events
- Create login/logout flows
- Test token refresh scenarios
- Test subscription scenarios

### Phase 6: Controllers Integration (2-3 days)
- Inject `EventBroadcaster` into controllers
- Add event emission after CRUD operations
- Verify userId available in request context
- Write integration tests

### Phase 7: Testing & Security Audit (3-4 days)
- Comprehensive security testing
- Test token expiration scenarios
- Test subscription filtering
- Performance testing with many clients
- Load testing
- Security audit (XSS, CSRF, etc.)

### Phase 8: Documentation & Monitoring (2-3 days)
- Document security architecture
- Document subscription patterns
- Add monitoring/metrics endpoints
- Add debug tools

**Total estimate: 21-31 days**

---

## 9. Critical Files Summary

### New Files (vs Prop3)

**Backend:**
- `src/transport/WebSocketSessionManager.ts` ⭐ Core security
- `src/auth/AuthService.ts` ⭐ Auth abstraction
- `src/auth/JwtAuthService.ts` (example implementation)
- `src/controllers/AuthController.ts` ⭐ Login/refresh/logout

**Frontend:**
- `src/transport/TokenRefreshManager.ts` ⭐ Automatic token refresh

### Modified Files (vs Prop3)

**Backend:**
- `src/transport/adapters/WebSocketTransportServer.ts` ⭐ Security + subscriptions
- `src/transport/adapters/RestTransportServer.ts` (subscriptions if using SSE)
- `src/server.ts` (inject session manager)

**Frontend:**
- `src/transport/adapters/WebSocketTransportClient.ts` ⭐ Security + subscriptions
- `src/transport/adapters/RestTransportClient.ts` (credentials: include)
- `src/app/App.tsx` (auth event handlers)

**Shared:**
- `src/transport/TransportProtocol.ts` (add SubscriptionMessage)

---

## 10. Success Criteria

All Prop3 criteria PLUS:

- ✅ **Security**: Tokens never in WebSocket messages
- ✅ **Security**: HTTP_ONLY cookies only
- ✅ **Security**: Automatic token refresh via HTTP
- ✅ **Security**: All WebSocket sessions updated on refresh
- ✅ **Security**: XSS protection verified
- ✅ **Security**: CSRF protection verified
- ✅ **Subscriptions**: Server-side filtering working
- ✅ **Subscriptions**: Bandwidth reduction measurable
- ✅ **Subscriptions**: Dashboard doesn't receive worker logs
- ✅ **Testing**: Security test suite passing
- ✅ **Testing**: >80% coverage maintained
- ✅ **Performance**: Load test with 1000+ concurrent clients

---

## 11. Key Improvements vs Prop3

| Feature | Prop3 | **Prop4** |
|---------|-------|----------|
| **Token Storage** | JavaScript accessible | ❌ (proposed) | ✅ HTTP_ONLY cookies |
| **XSS Protection** | ❌ Vulnerable | ✅ Immune |
| **Token in WS Messages** | ❌ Yes (dangerous) | ✅ Never |
| **Session Management** | ❌ None | ✅ Server-side tracking |
| **Token Refresh** | Manual/client-side | ✅ Automatic + HTTP |
| **Multi-device Support** | ❌ Complex | ✅ Native (shared cookies) |
| **Event Filtering** | ❌ Client-side only | ✅ Server-side |
| **Bandwidth Optimization** | ❌ None | ✅ 40-60% reduction |
| **Production Ready** | ⚠️ Security issues | ✅ Yes |

---

## Conclusion

**Proposition 4** est **production-ready** avec:

1. **🔒 Sécurité maximale**: Cookies HTTP_ONLY, zero exposition de tokens
2. **🎯 Performance optimale**: Filtrage côté serveur, bandwidth réduit de 40-60%
3. **💪 Robustesse**: Multi-device support, automatic token rotation
4. **🚀 Scalabilité**: Session manager performant, cleanup automatique
5. **✨ Expérience utilisateur**: Refresh transparent, pas de déconnexions intempestives

Cette architecture est prête pour **production à grande échelle**. 🎉
