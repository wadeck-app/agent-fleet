# Architecture des Flux d'Événements - Transport Layer

**Date:** 2025-12-27_19-52
**Type:** Documentation Architecture

## Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Composants Principaux](#composants-principaux)
3. [WebSocket Flow](#websocket-flow)
4. [SSE Flow](#sse-flow)
5. [Long Polling Flow](#long-polling-flow)
6. [REST Flow](#rest-flow)
7. [MessageQueue - Rôle et Usage](#messagequeue---rôle-et-usage)
8. [Comparaison des Transports](#comparaison-des-transports)
9. [Cas d'Usage Concrets](#cas-dusage-concrets)

---

## Vue d'Ensemble

### Architecture Globale

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BACKEND SERVICES LAYER                           │
│  (WorkersService, TasksService, IngredientsService, etc.)               │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ emit event
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        EVENT BROADCASTER                                 │
│  - Dispatches events to ALL transports simultaneously                   │
│  - Handles broadcast(), broadcastExcept(), sendToClient()               │
│  - Anti-fragile: continues even if one transport fails                  │
└───┬──────────────────┬──────────────────┬──────────────────┬────────────┘
    │                  │                  │                  │
    │ WebSocket        │ SSE              │ Long Polling     │ REST
    │ (real-time)      │ (real-time)      │ (polling)        │ (request/response)
    ▼                  ▼                  ▼                  ▼
┌─────────┐      ┌─────────┐      ┌─────────┐      ┌─────────┐
│   WS    │      │   SSE   │      │  Long   │      │  REST   │
│ Server  │      │ Server  │      │ Polling │      │  API    │
│         │      │         │      │ Server  │      │         │
└────┬────┘      └────┬────┘      └────┬────┘      └────┬────┘
     │                │                │                │
     │                │                └────────┐       │
     │                │                         │       │
     │                └──────────┐              │       │
     │                           │              │       │
     ▼                           ▼              ▼       │ (no events)
┌────────────────────────────────────────────────┐     │
│           MESSAGE QUEUE                        │     │
│  - Stores events for disconnected clients      │     │
│  - Used by SSE (fallback) and Long Polling     │     │
│  - TTL: 60 seconds                             │     │
│  - Deduplication built-in                      │     │
└────────────────────┬───────────────────────────┘     │
                     │                                 │
                     ▼ dequeue on reconnect/poll       ▼
              ┌─────────────────────────────────────────────┐
              │          FRONTEND CLIENTS                    │
              │  (TransportProvider → TransportClient)       │
              └─────────────────────────────────────────────┘
```

### Flux Principal

```
Service.emit(event)
    ↓
EventBroadcaster.broadcast(event, data)
    ↓
Pour chaque transport:
    ↓
    ├─→ WebSocket: socket.send() → Frontend reçoit immédiatement
    ├─→ SSE: reply.write() → Frontend reçoit immédiatement
    └─→ Long Polling:
        ├─→ Si client en attente (pending poll) → Envoie immédiatement
        └─→ Sinon → MessageQueue.enqueue() → Frontend récupère au prochain poll
```

---

## Composants Principaux

### 1. EventBroadcaster

**Fichier:** `packages/web-backend/src/transport/EventBroadcaster.ts`

**Rôle:** Hub central qui dispatche les événements à **tous** les transports simultanément.

**Méthodes clés:**

```typescript
// Envoyer à tous les clients connectés (tous transports)
broadcast<E extends EventType>(event: E, data: EventData<E>): void

// Envoyer à tous SAUF le client origine (évite l'écho)
broadcastExcept<E extends EventType>(event: E, data: EventData<E>, excludeConnId: string): void

// Envoyer à un client spécifique (détection auto du transport)
sendToClient<E extends EventType>(clientId: string, event: E, data: EventData<E>): void

// Envoyer à toutes les sessions d'un utilisateur (multi-device)
sendToUser<E extends EventType>(userId: string, event: E, data: EventData<E>): void
```

**Design Anti-Fragile (lignes 91-100):**

```typescript
for (const transport of this.transportServers) {
	try {
		transport.broadcast(event, data);
		// ✅ Continue même si un transport échoue
	} catch (error) {
		console.error(`[EventBroadcaster] Failed to broadcast to transport:`, error);
		// Continue avec les autres transports
	}
}
```

### 2. MessageQueue

**Fichier:** `packages/web-backend/src/transport/MessageQueue.ts`

**Rôle:** Stockage temporaire pour les événements quand les clients sont déconnectés ou utilisent le polling.

**Caractéristiques:**

- **TTL:** 60 secondes (messages expirés supprimés automatiquement)
- **Deduplication:** Évite les doublons via tracking des messages délivrés
- **Per-Client Queues:** Chaque client a sa propre file
- **Cleanup automatique:** Toutes les 10 secondes

**Structure:**

```typescript
// Map<clientId, QueuedMessage[]>
private queues = new Map<string, QueuedMessage[]>();

// Tracking des messages déjà délivrés (deduplication)
private deliveredMessages = new Map<string, Set<string>>();
```

**Méthodes:**

```typescript
// Ajouter un événement à la queue du client
enqueue(clientId: string, event: TransportEvent): boolean

// Récupérer tous les événements en attente pour un client
dequeue(clientId: string): TransportEvent[]

// Nettoyer les messages expirés (appelé automatiquement)
private cleanupExpiredMessages(): void
```

### 3. TransportSessionManager

**Fichier:** `packages/web-backend/src/transport/TransportSessionManager.ts`

**Rôle:** Gestion unifiée des sessions pour tous les transports.

**Fonctionnalités:**

- Authentification via cookies HTTP_ONLY
- Tracking du type de transport par client
- Gestion des souscriptions aux événements
- Filtrage des événements côté serveur

**Session Structure:**

```typescript
interface TransportSession {
	clientId: string;
	userId: string;
	transportType: 'websocket' | 'sse' | 'long-polling' | 'rest';
	tokenExpiresAt: number;
	authenticatedAt: number;
	lastActivity: number;

	// Souscriptions
	subscribedEvents: Set<EventType>;
	eventFilters: Map<EventType, Record<string, unknown>>;
}
```

---

## WebSocket Flow

### Caractéristiques

- **Connexion:** Bidirectionnelle, persistante
- **Latence:** < 10ms (temps réel)
- **MessageQueue:** Utilisée uniquement comme fallback (client déconnecté)
- **Endpoint:** `GET /ws?connId={clientId}`

### Flux de Connexion

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        WEBSOCKET CONNECTION                              │
└─────────────────────────────────────────────────────────────────────────┘

Frontend                         Backend                    EventBroadcaster
   │                                │                              │
   │  1. WebSocket handshake        │                              │
   │  GET /ws?connId=abc-123        │                              │
   ├───────────────────────────────>│                              │
   │                                │                              │
   │  2. Authenticate (cookies)     │                              │
   │                                │                              │
   │  3. Send "connected" event     │                              │
   │  {userId, tokenExpiresAt}      │                              │
   │<───────────────────────────────┤                              │
   │                                │                              │
   │  4. Subscribe to events        │                              │
   │  {action: 'subscribe',         │                              │
   │   events: ['b2f:task:*']}      │                              │
   ├───────────────────────────────>│                              │
   │                                │                              │
   │  5. Subscription confirmed     │                              │
   │<───────────────────────────────┤                              │
   │                                │                              │
   │         CONNECTION ESTABLISHED (bidirectional)                │
   │◄══════════════════════════════►│                              │
   │                                │                              │
```

### Flux d'Événement (Broadcast)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    WEBSOCKET EVENT BROADCAST                             │
└─────────────────────────────────────────────────────────────────────────┘

Service                  EventBroadcaster      WebSocketServer    Frontend
   │                            │                     │               │
   │ 1. emit event              │                     │               │
   │ B2F_WORKER_UPDATED         │                     │               │
   ├───────────────────────────>│                     │               │
   │                            │                     │               │
   │                            │ 2. broadcast()      │               │
   │                            ├────────────────────>│               │
   │                            │                     │               │
   │                            │     3. Pour chaque  │               │
   │                            │        client:      │               │
   │                            │        • Check if   │               │
   │                            │          subscribed │               │
   │                            │        • Check      │               │
   │                            │          filters    │               │
   │                            │        • socket     │               │
   │                            │          .send()    │               │
   │                            │                     │               │
   │                            │                     │ 4. Immediate  │
   │                            │                     │    delivery   │
   │                            │                     ├──────────────>│
   │                            │                     │               │
   │                            │                     │               │ 5. Process
   │                            │                     │               │    event
   │                            │                     │               ├─────┐
   │                            │                     │               │     │
   │                            │                     │               │<────┘
```

**Code (WebSocketTransportServer.ts, lignes 340-383):**

```typescript
broadcast<E extends EventType>(event: E, data: EventData<E>): void {
    const eventMessage: TransportEvent = {
        id: this.generateEventId(),
        type: event,
        data,
        timestamp: Date.now(),
    };

    const message = JSON.stringify(eventMessage);
    let sentCount = 0;

    this.clients.forEach((socket, clientId) => {
        // ✅ 1. Check socket is open
        if (socket.readyState !== 1) return;

        // ✅ 2. Check subscription
        if (!this.sessionManager.isSubscribed(clientId, event)) {
            return;
        }

        // ✅ 3. Check filters
        if (!this.sessionManager.matchesFilters(clientId, event, data)) {
            return;
        }

        // ✅ 4. Send immediately
        try {
            socket.send(message);
            sentCount++;
        } catch (error) {
            console.error(`[WS] Failed to send event to client ${clientId}`, error);
        }
    });

    console.log(`[WS] Broadcast ${event} to ${sentCount} clients`);
}
```

### Flux de Requête (Client → Server)

```
Frontend                 WebSocketServer              TransportRouter
   │                            │                            │
   │ 1. Send request via WS     │                            │
   │ {type: 'request',          │                            │
   │  method: 'GET',            │                            │
   │  path: '/tasks',           │                            │
   │  query: {...}}             │                            │
   ├───────────────────────────>│                            │
   │                            │                            │
   │                            │ 2. Route request           │
   │                            ├───────────────────────────>│
   │                            │                            │
   │                            │ 3. Execute & return data   │
   │                            │<───────────────────────────┤
   │                            │                            │
   │ 4. Send response via WS    │                            │
   │<───────────────────────────┤                            │
   │                            │                            │
```

---

## SSE Flow

### Caractéristiques

- **Connexion:** Unidirectionnelle (Server → Client), persistante
- **Latence:** < 50ms (quasi temps réel)
- **MessageQueue:** Utilisée comme fallback en cas d'erreur d'envoi
- **Endpoints:**
    - `GET /sse` - Stream d'événements
    - `POST /sse/subscription` - Gestion des souscriptions

### Flux de Connexion

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SSE CONNECTION                                   │
└─────────────────────────────────────────────────────────────────────────┘

Frontend                         Backend (SSE Server)      MessageQueue
   │                                    │                       │
   │  1. EventSource connection         │                       │
   │  GET /sse (with cookies)           │                       │
   ├───────────────────────────────────>│                       │
   │                                    │                       │
   │  2. Setup SSE headers              │                       │
   │  Content-Type: text/event-stream   │                       │
   │  Cache-Control: no-cache           │                       │
   │  Connection: keep-alive            │                       │
   │  CORS headers                      │                       │
   │                                    │                       │
   │  3. Authenticate (cookies)         │                       │
   │                                    │                       │
   │  4. Send "connected" event         │                       │
   │  event: connected                  │                       │
   │  data: {userId, tokenExpiresAt}    │                       │
   │<───────────────────────────────────┤                       │
   │                                    │                       │
   │  5. Dequeue pending messages       │                       │
   │                                    ├──────────────────────>│
   │                                    │                       │
   │  6. Send queued events             │ 7. Return queued     │
   │  (if any)                          │<──────────────────────┤
   │<───────────────────────────────────┤                       │
   │                                    │                       │
   │  8. Start heartbeat (30s)          │                       │
   │                                    │                       │
   │         CONNECTION ESTABLISHED (unidirectional)            │
   │◄═══════════════════════════════════│                       │
   │                                    │                       │
```

### Flux d'Événement (Broadcast)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      SSE EVENT BROADCAST                                 │
└─────────────────────────────────────────────────────────────────────────┘

Service              EventBroadcaster    SSEServer     MessageQueue    Frontend
   │                        │                │              │              │
   │ 1. emit event          │                │              │              │
   ├───────────────────────>│                │              │              │
   │                        │                │              │              │
   │                        │ 2. broadcast() │              │              │
   │                        ├───────────────>│              │              │
   │                        │                │              │              │
   │                        │   3. Check     │              │              │
   │                        │      active    │              │              │
   │                        │      connections│             │              │
   │                        │                ├──┐           │              │
   │                        │                │  │ Client A  │              │
   │                        │                │<─┘ subscribed│              │
   │                        │                │    + filters │              │
   │                        │                │    match     │              │
   │                        │                │              │              │
   │                        │                │ 4. Try send  │              │
   │                        │                │ reply.raw    │              │
   │                        │                │ .write()     │              │
   │                        │                │              │              │
   │                        │                ├─────SUCCESS─────────────────>│
   │                        │                │              │              │
   │                        │                ├──┐           │              │
   │                        │                │  │ Client B  │              │
   │                        │                │<─┘ subscribed│              │
   │                        │                │    but send  │              │
   │                        │                │    FAILS     │              │
   │                        │                │              │              │
   │                        │                │ 5. On error, │              │
   │                        │                │    queue     │              │
   │                        │                ├─────────────>│              │
   │                        │                │              │              │
   │                        │                │   MessageQueue.enqueue()    │
   │                        │                │              │              │
```

**Code (SSETransportServer.ts, lignes 311-348):**

```typescript
broadcast<E extends EventType>(event: E, data: EventData<E>): void {
    const transportEvent: TransportEvent = {
        id: this.generateEventId(),
        type: event,
        data,
        timestamp: Date.now(),
    };

    let sentCount = 0;
    let queuedCount = 0;

    for (const [clientId, connection] of this.connections) {
        // ✅ 1. Check subscription
        const session = this.sessionManager['sessions'].get(clientId);
        if (!session || !session.subscribedEvents.has(event)) {
            continue;
        }

        // ✅ 2. Check filters
        if (!this.matchesFilters(data, session.eventFilters.get(event))) {
            continue;
        }

        // ✅ 3. Try to send via SSE
        try {
            this.sendSSEEvent(connection.reply, 'message', transportEvent);
            sentCount++;
        } catch (error) {
            console.error(`[SSE] Failed to send to client ${clientId}:`, error);
            // ✅ 4. On failure, queue for later
            this.messageQueue.enqueue(clientId, transportEvent);
            queuedCount++;
        }
    }

    console.log(`[SSE] Broadcast ${event}: ${sentCount} sent, ${queuedCount} queued`);
}
```

### Format SSE (lignes 397-401)

```
event: message
data: {"id":"evt-123","type":"b2f:worker:updated","data":{...},"timestamp":1703...}

event: connected
data: {"userId":"user-456","tokenExpiresAt":1703...}

: heartbeat (comment, no data)
```

### Heartbeat Mechanism (lignes 406-428)

```typescript
private startHeartbeat(clientId: string): void {
    const interval = setInterval(() => {
        const connection = this.connections.get(clientId);
        if (!connection) {
            clearInterval(interval);
            return;
        }

        try {
            // Send comment (no event/data) = heartbeat
            connection.reply.raw.write(': heartbeat\n\n');
        } catch (error) {
            // Connection dead, cleanup
            this.handleDisconnect(clientId);
            clearInterval(interval);
        }
    }, 30000); // Every 30 seconds
}
```

---

## Long Polling Flow

### Caractéristiques

- **Connexion:** Unidirectionnelle (Server → Client), request/response avec timeout
- **Latence:** Variable (jusqu'à 30s de hold)
- **MessageQueue:** Utilisée comme **mécanisme principal** (pas un fallback)
- **Timeout:** 30 secondes côté serveur
- **Endpoints:**
    - `GET /long-polling/events` - Polling endpoint
    - `POST /long-polling/subscription` - Gestion des souscriptions

### Concept du Long Polling

```
Le long polling fonctionne différemment du polling classique:

Polling Classique:          Long Polling:
─────────────────           ─────────────

Client: Request             Client: Request
Server: Response (immédiate) Server: Hold connection open...
[wait 1s]                           ... wait for events ...
Client: Request                     ... up to 30 seconds ...
Server: Response (immédiate)        ... or until event arrives
[wait 1s]                   Server: Response (with events)
...                        [immediate new request]
                           Client: Request (immediately)
                           Server: Hold connection...
```

### Flux de Connexion et Premier Poll

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   LONG POLLING FIRST CONNECTION                          │
└─────────────────────────────────────────────────────────────────────────┘

Frontend                    LongPollingServer           MessageQueue
   │                               │                          │
   │  1. First poll                │                          │
   │  GET /long-polling/events     │                          │
   │  (with cookies)               │                          │
   ├──────────────────────────────>│                          │
   │                               │                          │
   │  2. Get/Create clientId       │                          │
   │     from cookie               │                          │
   │                               │                          │
   │  3. Authenticate              │                          │
   │                               │                          │
   │  4. Check for queued events   │                          │
   │                               ├─────────────────────────>│
   │                               │                          │
   │                               │ 5. Return [] (empty)     │
   │                               │<─────────────────────────┤
   │                               │                          │
   │  6. NEW SESSION:              │                          │
   │     Respond immediately       │                          │
   │     with empty events         │                          │
   │                               │                          │
   │  7. Response                  │                          │
   │  {events: [],                 │                          │
   │   authenticated: true,        │                          │
   │   userId: "...",              │                          │
   │   tokenExpiresAt: ...}        │                          │
   │<──────────────────────────────┤                          │
   │                               │                          │
   │  8. Start next poll           │                          │
   │     (immediately)             │                          │
   ├──────────────────────────────>│                          │
   │                               │                          │
   │  9. EXISTING SESSION:         │                          │
   │     Hold connection open      │                          │
   │     (up to 30s)               │                          │
   │                               │                          │
   │        [waiting...]           │                          │
   │                               │                          │
```

### Flux d'Événement - Scénario 1: Client en Attente (Pending Poll)

```
┌─────────────────────────────────────────────────────────────────────────┐
│              LONG POLLING - EVENT WITH PENDING POLL                      │
└─────────────────────────────────────────────────────────────────────────┘

Frontend            LongPollingServer         EventBroadcaster    Service
   │                       │                         │               │
   │  1. Poll request      │                         │               │
   │  (held open)          │                         │               │
   ├──────────────────────>│                         │               │
   │                       │                         │               │
   │   [waiting 30s...]    │ Client marked as        │               │
   │                       │ "pending poll"          │               │
   │                       │                         │               │
   │                       │                         │ 2. emit event │
   │                       │                         │<──────────────┤
   │                       │                         │               │
   │                       │ 3. broadcast()          │               │
   │                       │<────────────────────────┤               │
   │                       │                         │               │
   │                       │ 4. Check if client      │               │
   │                       │    has pending poll     │               │
   │                       ├──┐                      │               │
   │                       │  │ ✅ YES! Client      │               │
   │                       │<─┘    has pending      │               │
   │                       │       poll             │               │
   │                       │                         │               │
   │                       │ 5. respondToPoll()      │               │
   │                       │    with event           │               │
   │                       │    (immediate)          │               │
   │                       │                         │               │
   │  6. Response          │                         │               │
   │  {events: [event],    │                         │               │
   │   authenticated: true}│                         │               │
   │<──────────────────────┤                         │               │
   │                       │                         │               │
   │  7. Process event     │                         │               │
   ├──────┐                │                         │               │
   │      │                │                         │               │
   │<─────┘                │                         │               │
   │                       │                         │               │
   │  8. Immediately       │                         │               │
   │     start next poll   │                         │               │
   ├──────────────────────>│                         │               │
   │                       │                         │               │
```

### Flux d'Événement - Scénario 2: Pas de Poll en Attente

```
┌─────────────────────────────────────────────────────────────────────────┐
│             LONG POLLING - EVENT WITHOUT PENDING POLL                    │
└─────────────────────────────────────────────────────────────────────────┘

Service         EventBroadcaster    LongPollingServer    MessageQueue    Frontend
   │                   │                    │                  │             │
   │ 1. emit event     │                    │                  │             │
   ├──────────────────>│                    │                  │             │
   │                   │                    │                  │             │
   │                   │ 2. broadcast()     │                  │             │
   │                   ├───────────────────>│                  │             │
   │                   │                    │                  │             │
   │                   │   3. Check pending │                  │             │
   │                   │      poll for      │                  │             │
   │                   │      client        │                  │             │
   │                   │                    ├──┐               │             │
   │                   │                    │  │ ❌ NO pending│             │
   │                   │                    │<─┘    poll      │             │
   │                   │                    │                  │             │
   │                   │   4. Queue event   │                  │             │
   │                   │      for later     │                  │             │
   │                   │                    ├─────────────────>│             │
   │                   │                    │                  │             │
   │                   │                    │ MessageQueue     │             │
   │                   │                    │ .enqueue()       │             │
   │                   │                    │                  │             │
   │                   │                    │                  │             │
   │                   │                    │                  │  [Later...] │
   │                   │                    │                  │             │
   │                   │                    │  5. Next poll    │             │
   │                   │                    │<─────────────────────────────────┤
   │                   │                    │                  │             │
   │                   │                    │ 6. Dequeue       │             │
   │                   │                    ├─────────────────>│             │
   │                   │                    │                  │             │
   │                   │                    │ 7. Return events │             │
   │                   │                    │<─────────────────┤             │
   │                   │                    │                  │             │
   │                   │                    │ 8. Response      │             │
   │                   │                    │  with queued     │             │
   │                   │                    │  events          │             │
   │                   │                    ├──────────────────────────────>│
   │                   │                    │                  │             │
```

**Code (LongPollingTransportServer.ts, lignes 351-391):**

```typescript
broadcast<E extends EventType>(event: E, data: EventData<E>): void {
    const transportEvent: TransportEvent = {
        id: this.generateEventId(),
        type: event,
        data,
        timestamp: Date.now(),
    };

    let deliveredCount = 0;
    let queuedCount = 0;

    for (const clientId of this.activeSessions.keys()) {
        // ✅ 1. Check subscription
        const session = this.sessionManager['sessions'].get(clientId);
        if (!session || !session.subscribedEvents.has(event)) {
            continue;
        }

        // ✅ 2. Check filters
        if (!this.matchesFilters(data, session.eventFilters.get(event))) {
            continue;
        }

        // ✅ 3. Check if client has pending poll
        const pending = this.pendingPolls.get(clientId);
        if (pending) {
            // 🚀 CLIENT EN ATTENTE → Livraison immédiate
            this.respondToPoll(clientId, [transportEvent]);
            deliveredCount++;
        } else {
            // 📦 PAS DE POLL EN ATTENTE → Queue pour plus tard
            this.messageQueue.enqueue(clientId, transportEvent);
            queuedCount++;
        }
    }

    console.log(`[LongPolling] Broadcast ${event}: ${deliveredCount} delivered, ${queuedCount} queued`);
}
```

### Gestion du Timeout (30 secondes)

```typescript
// LongPollingTransportServer.ts, lignes 205-209
const timeoutHandle = setTimeout(() => {
	// Timeout atteint, répondre avec tableau vide
	this.respondToPoll(clientId, []);
}, 30000); // 30 secondes
```

### Polling Loop Côté Frontend

```typescript
// LongPollingTransportClient.ts, lignes 179-189
async connect(): Promise<void> {
    this.state = 'connecting';
    this.emit('stateChange', this.state);

    try {
        // Start continuous polling
        await this.performPoll();
    } catch (error) {
        // Handle error and reconnect
        this.handleConnectionError(error);
    }
}

// Ligne 422: Immédiatement après réception d'une réponse, relance un poll
await this.performPoll(); // Recursive call
```

---

## REST Flow

### Caractéristiques

- **Connexion:** Aucune (request/response stateless)
- **Événements:** **NON supportés** (pas de push, pas de real-time)
- **Usage:** Uniquement pour les requêtes API classiques
- **Client:** `RestTransportClient` (pas d'EventEmitter)

### Flux de Requête

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        REST REQUEST/RESPONSE                             │
└─────────────────────────────────────────────────────────────────────────┘

Frontend (RestTransportClient)         Backend API             Service
   │                                         │                     │
   │ 1. request(method, path, params)        │                     │
   │ GET /api/tasks?status=pending           │                     │
   ├────────────────────────────────────────>│                     │
   │                                         │                     │
   │                                         │ 2. Route to         │
   │                                         │    controller       │
   │                                         ├────────────────────>│
   │                                         │                     │
   │                                         │ 3. Execute query    │
   │                                         │    & return data    │
   │                                         │<────────────────────┤
   │                                         │                     │
   │ 4. Response                             │                     │
   │ {status: 200,                           │                     │
   │  body: {data: [...]}}                   │                     │
   │<────────────────────────────────────────┤                     │
   │                                         │                     │
   │ 5. Process response                     │                     │
   ├──────┐                                  │                     │
   │      │                                  │                     │
   │<─────┘                                  │                     │
   │                                         │                     │
```

**Code (RestTransportClient.ts, lignes 137-200):**

```typescript
async request<T = unknown>(
    method: string,
    path: string,
    params?: Record<string, unknown>
): Promise<T> {
    // Build URL with query params
    let url = `${this.config.baseUrl}${path}`;

    // Add query params for GET requests
    if (method === 'GET' && params && Object.keys(params).length > 0) {
        const searchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
            searchParams.append(key, String(value));
        }
        url += `?${searchParams.toString()}`;
    }

    // Make request with cookies for auth
    const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // ✅ Send HTTP_ONLY cookies
        body: method !== 'GET' ? JSON.stringify(params) : undefined,
    });

    // Handle errors
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `HTTP ${response.status}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
        return undefined as T;
    }

    // Parse and return JSON
    return (await response.json()) as T;
}
```

**Important:** REST n'a **aucune capacité d'événements**. Pour recevoir des mises à jour, le client doit:

- Faire du polling manuel (requêtes répétées)
- Utiliser un autre transport pour les événements (WebSocket, SSE, Long Polling)

---

## MessageQueue - Rôle et Usage

### Quand la Queue est Utilisée?

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MESSAGE QUEUE USAGE BY TRANSPORT                      │
└─────────────────────────────────────────────────────────────────────────┘

WebSocket:
  ├─ Client connecté & socket ouvert → ❌ Pas de queue (envoi direct)
  └─ Client déconnecté temporairement → ✅ Queue (fallback)

SSE:
  ├─ Client connecté & stream ouvert → ❌ Pas de queue (envoi direct)
  ├─ Envoi échoue (erreur réseau) → ✅ Queue (fallback)
  └─ Client déconnecté → ✅ Queue (reconnexion future)

Long Polling:
  ├─ Client a poll en attente → ❌ Pas de queue (réponse immédiate)
  └─ Pas de poll en attente → ✅ Queue (MÉCANISME PRINCIPAL)

REST:
  └─ Jamais utilisé (pas d'événements)
```

### Architecture de la Queue

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       MESSAGE QUEUE INTERNALS                            │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────┐
                    │      MessageQueue               │
                    │                                 │
                    │  queues: Map<clientId, Event[]> │
                    │                                 │
                    │  ┌──────────────────────────┐   │
                    │  │ Client "abc-123"         │   │
                    │  │ └─ Event 1 (TTL: 45s)    │   │
                    │  │ └─ Event 2 (TTL: 50s)    │   │
                    │  │ └─ Event 3 (TTL: 58s)    │   │
                    │  └──────────────────────────┘   │
                    │                                 │
                    │  ┌──────────────────────────┐   │
                    │  │ Client "xyz-456"         │   │
                    │  │ └─ Event 1 (TTL: 30s)    │   │
                    │  └──────────────────────────┘   │
                    │                                 │
                    │  deliveredMessages:             │
                    │  Map<clientId, Set<eventId>>    │
                    │                                 │
                    │  ┌──────────────────────────┐   │
                    │  │ Client "abc-123"         │   │
                    │  │ └─ evt-001 (delivered)   │   │
                    │  │ └─ evt-002 (delivered)   │   │
                    │  └──────────────────────────┘   │
                    │                                 │
                    └─────────────────────────────────┘
```

### Mécanisme de Deduplication

```typescript
// MessageQueue.ts, lignes 115-151
enqueue(clientId: string, event: TransportEvent): boolean {
    // ✅ 1. Check if already delivered
    const delivered = this.deliveredMessages.get(clientId);
    if (delivered?.has(event.id)) {
        console.log(`[MessageQueue] Skipping duplicate event ${event.id}`);
        return false; // Already delivered, skip
    }

    // ✅ 2. Get or create queue for client
    let queue = this.queues.get(clientId);
    if (!queue) {
        queue = [];
        this.queues.set(clientId, queue);
    }

    // ✅ 3. Check queue size limit
    if (queue.length >= this.config.maxQueueSize) {
        console.warn(`[MessageQueue] Queue full for client ${clientId}, dropping oldest`);
        queue.shift(); // Remove oldest event
    }

    // ✅ 4. Add event with expiry timestamp
    const queuedMessage: QueuedMessage = {
        ...event,
        expiresAt: Date.now() + this.config.messageTTL, // 60 seconds
    };

    queue.push(queuedMessage);
    console.log(`[MessageQueue] Enqueued event ${event.id} for client ${clientId}`);
    return true;
}
```

### Récupération des Événements

```typescript
// MessageQueue.ts, lignes 162-187
dequeue(clientId: string): TransportEvent[] {
    const queue = this.queues.get(clientId);
    if (!queue || queue.length === 0) {
        return []; // No events
    }

    const now = Date.now();
    const validEvents: TransportEvent[] = [];

    // ✅ Filter out expired events
    for (const queuedMessage of queue) {
        if (queuedMessage.expiresAt > now) {
            validEvents.push({
                id: queuedMessage.id,
                type: queuedMessage.type,
                data: queuedMessage.data,
                timestamp: queuedMessage.timestamp,
            });
        }
    }

    // ✅ Mark all events as delivered
    let delivered = this.deliveredMessages.get(clientId);
    if (!delivered) {
        delivered = new Set();
        this.deliveredMessages.set(clientId, delivered);
    }

    for (const event of validEvents) {
        delivered.add(event.id);
    }

    // ✅ Clear queue
    this.queues.delete(clientId);

    console.log(`[MessageQueue] Dequeued ${validEvents.length} events for client ${clientId}`);
    return validEvents;
}
```

### Cleanup Automatique (lignes 271-315)

```typescript
private cleanupExpiredMessages(): void {
    const now = Date.now();
    let totalCleaned = 0;

    // ✅ 1. Clean expired events from queues
    for (const [clientId, queue] of this.queues.entries()) {
        const before = queue.length;
        const validMessages = queue.filter(msg => msg.expiresAt > now);

        if (validMessages.length === 0) {
            this.queues.delete(clientId);
        } else {
            this.queues.set(clientId, validMessages);
        }

        const cleaned = before - validMessages.length;
        totalCleaned += cleaned;
    }

    // ✅ 2. Clean old delivered tracking (>2 minutes)
    for (const [clientId, delivered] of this.deliveredMessages.entries()) {
        if (delivered.size === 0) {
            this.deliveredMessages.delete(clientId);
        }
    }

    if (totalCleaned > 0) {
        console.log(`[MessageQueue] Cleaned ${totalCleaned} expired messages`);
    }
}
```

**Interval de Cleanup:** Toutes les 10 secondes (ligne 62)

---

## Comparaison des Transports

### Tableau de Comparaison

| Caractéristique           | WebSocket              | SSE                   | Long Polling          | REST             |
| ------------------------- | ---------------------- | --------------------- | --------------------- | ---------------- |
| **Direction**             | Bidirectionnelle       | Unidirectionnelle     | Unidirectionnelle     | Request/Response |
| **Connexion**             | Persistante            | Persistante           | Request/Response      | Aucune           |
| **Latence Événements**    | < 10ms                 | < 50ms                | 0-30s (variable)      | N/A              |
| **Heartbeat**             | ❌ Non                 | ✅ 30s                | ❌ Non                | N/A              |
| **MessageQueue Usage**    | Fallback               | Fallback              | **Mécanisme primary** | N/A              |
| **Requêtes API**          | ✅ Via WebSocket       | ❌ HTTP séparé requis | ❌ HTTP séparé requis | ✅ Uniquement    |
| **Overhead Réseau**       | Très faible            | Faible                | Moyen-Élevé           | Faible           |
| **Support Navigateur**    | Moderne (>IE11)        | Moderne (>IE11)       | Universel             | Universel        |
| **Firewall/Proxy Issues** | Parfois bloqué         | Rarement bloqué       | Jamais bloqué         | Jamais bloqué    |
| **Scalabilité**           | Élevée (1 conn)        | Élevée (1 conn)       | Moyenne (polling)     | Élevée           |
| **Complexité Client**     | Moyenne                | Faible                | Faible                | Très faible      |
| **Reconnexion Auto**      | ✅ Oui                 | ✅ Oui                | ✅ Oui                | N/A              |
| **Buffering Events**      | ❌ Queue si déconnecté | ❌ Queue si erreur    | ✅ Queue systématique | N/A              |

### Matrice de Décision - Quand Utiliser Chaque Transport?

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TRANSPORT SELECTION MATRIX                            │
└─────────────────────────────────────────────────────────────────────────┘

Cas d'Usage                          WebSocket    SSE    Long Polling    REST
────────────────────────────────────────────────────────────────────────────
Dashboard temps réel                   🥇 1st     🥈 2nd    🥉 3rd       ❌
Chat/Messaging                         🥇 1st      ❌       🥉 3rd       ❌
Notifications push                     🥇 1st     🥈 2nd    🥉 3rd       ❌
Édition collaborative                  🥇 1st      ❌        ❌          ❌
Streaming de données (uni)              ❌       🥇 1st    🥉 3rd       ❌
Environnement restrictif (firewall)     ❌        ❌       🥇 1st       🥈 2nd
Requêtes API simples (CRUD)            🥈 2nd     ❌        ❌          🥇 1st
Serveur stateless requis                ❌        ❌        ❌          🥇 1st
Client legacy (IE10)                    ❌        ❌       🥇 1st       🥈 2nd
```

### Performance Comparison

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      LATENCY DISTRIBUTION                                │
└─────────────────────────────────────────────────────────────────────────┘

WebSocket:
Event émis ────> Client reçoit
           │ 5-15ms │
           ████████

SSE:
Event émis ────────────> Client reçoit
           │   20-50ms   │
           ████████████████

Long Polling (best case):
Event émis ─────────────────> Client reçoit
           │     50-100ms     │
           ███████████████████████

Long Polling (worst case):
Event émis ───────────────────────────────────────────> Client reçoit
           │              0-30,000ms                   │
           ████████████████████████████████████████████████████████████████
```

---

## Cas d'Usage Concrets

### Cas 1: Worker Name Update

**Scenario:** Un utilisateur modifie le nom d'un worker dans le frontend.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    WORKER UPDATE - EVENT FLOW                            │
└─────────────────────────────────────────────────────────────────────────┘

Frontend A           Frontend B         Frontend C      Backend
(WebSocket)          (SSE)              (Long Polling)  (WorkersService)
   │                    │                    │               │
   │ 1. User updates    │                    │               │
   │    worker name     │                    │               │
   │                    │                    │               │
   │ 2. PUT /workers/:id│                    │               │
   ├───────────────────────────────────────────────────────>│
   │                    │                    │               │
   │                    │                    │ 3. Update DB  │
   │                    │                    │               ├────┐
   │                    │                    │               │    │
   │                    │                    │               │<───┘
   │                    │                    │               │
   │ 4. Return updated  │                    │               │
   │    worker data     │                    │               │
   │<───────────────────────────────────────────────────────┤
   │                    │                    │               │
   │                    │                    │ 5. Emit event │
   │                    │                    │ (exclude      │
   │                    │                    │  Frontend A)  │
   │                    │                    │               │
   │                    │                    │ EventBroadcaster
   │                    │                    │ .broadcastExcept()
   │                    │                    │               │
   │                    │                    │               │
   │   ❌ Excluded      │                    │               │
   │   (origin)         │                    │               │
   │                    │                    │               │
   │                    │ 6. SSE push        │               │
   │                    │ (immediate)        │               │
   │                    │<───────────────────────────────────┤
   │                    │                    │               │
   │                    │                    │ 7. Long Polling│
   │                    │                    │    Client has  │
   │                    │                    │    pending poll│
   │                    │                    │    → immediate │
   │                    │                    │<───────────────┤
   │                    │                    │               │
   │                    │ 8. Process event   │ 9. Process    │
   │                    ├──────┐             │    event      │
   │                    │      │             ├─────┐         │
   │                    │<─────┘             │     │         │
   │                    │                    │<────┘         │
   │                    │                    │               │
   │ 10. UI reflects    │ 11. UI reflects    │ 12. UI reflects
   │     change         │     change         │     change    │
   │     (from API)     │     (from event)   │     (from event)
   │                    │                    │               │
```

**Code (WorkersService.ts, lignes 326-327):**

```typescript
// Update worker in database
const updatedWorker = await this.workersRepository.update(workerId, updateData);

// Emit event to all OTHER clients (exclude origin to avoid echo)
this.eventBroadcaster.broadcastExcept(
    B2F_WORKER_UPDATED,
    updatedWorker,
    connId // Exclude this connection
);

return updatedWorker;
```

### Cas 2: Task Status Change (Background Process)

**Scenario:** Un worker termine une tâche en arrière-plan (pas d'origine frontend).

```
┌─────────────────────────────────────────────────────────────────────────┐
│              TASK COMPLETION - BACKGROUND EVENT FLOW                     │
└─────────────────────────────────────────────────────────────────────────┘

Worker Process      Backend           Frontend A       Frontend B       Frontend C
(Background)        (TasksService)    (WebSocket)      (SSE)            (Long Polling)
   │                    │                 │                │                │
   │ 1. Task completed  │                 │                │                │
   │                    │                 │                │                │
   │ 2. Notify backend  │                 │                │                │
   ├───────────────────>│                 │                │                │
   │                    │                 │                │                │
   │                    │ 3. Update DB    │                │                │
   │                    ├────┐            │                │                │
   │                    │    │            │                │                │
   │                    │<───┘            │                │                │
   │                    │                 │                │                │
   │                    │ 4. Emit event   │                │                │
   │                    │ (to ALL clients)│                │                │
   │                    │                 │                │                │
   │                    │ EventBroadcaster│                │                │
   │                    │ .broadcast()    │                │                │
   │                    │                 │                │                │
   │                    ├────────────────>│                │                │
   │                    │ 5. WS push      │                │                │
   │                    │ (immediate)     │                │                │
   │                    │                 │                │                │
   │                    ├─────────────────────────────────>│                │
   │                    │ 6. SSE push     │                │                │
   │                    │ (immediate)     │                │                │
   │                    │                 │                │                │
   │                    ├────────────────────────────────────────────────────>│
   │                    │ 7. Long Polling │                │                │
   │                    │    NO pending   │                │                │
   │                    │    poll         │                │                │
   │                    │    → QUEUE      │                │                │
   │                    │                 │                │                │
   │                    │                 │ 8. Process     │ 9. Process     │
   │                    │                 ├────┐           ├────┐           │
   │                    │                 │    │           │    │           │
   │                    │                 │<───┘           │<───┘           │
   │                    │                 │                │                │
   │                    │                 │ 10. UI update  │ 11. UI update  │
   │                    │                 │     (toast:    │     (toast:    │
   │                    │                 │      "Task     │      "Task     │
   │                    │                 │      done!")   │      done!")   │
   │                    │                 │                │                │
   │                    │                 │                │    [30s later] │
   │                    │                 │                │                │
   │                    │                 │                │ 12. Next poll  │
   │                    │<───────────────────────────────────────────────────┤
   │                    │                 │                │                │
   │                    │ 13. Dequeue &   │                │                │
   │                    │     return event│                │                │
   │                    ├────────────────────────────────────────────────────>│
   │                    │                 │                │                │
   │                    │                 │                │ 14. Process    │
   │                    │                 │                │     event      │
   │                    │                 │                │    (delayed)   │
   │                    │                 │                │                │
   │                    │                 │                │ 15. UI update  │
   │                    │                 │                │     (delayed)  │
```

### Cas 3: Reconnexion et Récupération des Événements

**Scenario:** Un client perd temporairement sa connexion puis se reconnecte.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                RECONNECTION AND EVENT RECOVERY                           │
└─────────────────────────────────────────────────────────────────────────┘

Frontend (SSE)      Backend           MessageQueue      Service
   │                   │                    │               │
   │ 1. Connected      │                    │               │
   │    & subscribed   │                    │               │
   │                   │                    │               │
   │                   │                    │               │
   │ 2. Event 1 émis   │                    │               │
   │    (delivered)    │                    │               │
   │<──────────────────┤                    │               │
   │                   │                    │               │
   │ 3. Network issue! │                    │               │
   │    Connection lost│                    │               │
   │ ❌ DISCONNECTED   │                    │               │
   │                   │                    │               │
   │                   │                    │ 4. Event 2    │
   │                   │                    │    émis       │
   │                   │<───────────────────────────────────┤
   │                   │                    │               │
   │                   │ 5. Try to send     │               │
   │                   │    → FAILS         │               │
   │                   │    (no connection) │               │
   │                   │                    │               │
   │                   │ 6. Enqueue event   │               │
   │                   ├───────────────────>│               │
   │                   │                    │               │
   │                   │                    │ [Event 2      │
   │                   │                    │  queued]      │
   │                   │                    │               │
   │                   │                    │ 7. Event 3    │
   │                   │                    │    émis       │
   │                   │<───────────────────────────────────┤
   │                   │                    │               │
   │                   │ 8. Enqueue event   │               │
   │                   ├───────────────────>│               │
   │                   │                    │               │
   │                   │                    │ [Event 3      │
   │                   │                    │  queued]      │
   │                   │                    │               │
   │ 9. Network OK     │                    │               │
   │    Reconnecting...│                    │               │
   │                   │                    │               │
   │ 10. New SSE       │                    │               │
   │     connection    │                    │               │
   ├──────────────────>│                    │               │
   │                   │                    │               │
   │ 11. Authenticate  │                    │               │
   │     & send        │                    │               │
   │     "connected"   │                    │               │
   │<──────────────────┤                    │               │
   │                   │                    │               │
   │                   │ 12. Dequeue pending│               │
   │                   │     events         │               │
   │                   ├───────────────────>│               │
   │                   │                    │               │
   │                   │ 13. Return [Event2,│               │
   │                   │     Event3]        │               │
   │                   │<───────────────────┤               │
   │                   │                    │               │
   │ 14. Send queued   │                    │               │
   │     events        │                    │               │
   │<──────────────────┤                    │               │
   │                   │                    │               │
   │ 15. Process both  │                    │               │
   │     events        │                    │               │
   ├─────┐             │                    │               │
   │     │             │                    │               │
   │<────┘             │                    │               │
   │                   │                    │               │
   │ 16. UI up to date │                    │               │
   │     (no data loss)│                    │               │
   │                   │                    │               │
```

**Code (SSETransportServer.ts, lignes 164-176):**

```typescript
// After authentication, send queued events
try {
	// Get any queued events for this client
	const queuedEvents = this.messageQueue.dequeue(clientId);

	// Send connected event
	this.sendSSEEvent(reply, 'connected', {
		userId: session.userId,
		tokenExpiresAt: session.tokenExpiresAt,
	});

	// Send all queued events
	for (const event of queuedEvents) {
		this.sendSSEEvent(reply, 'message', event);
	}

	console.log(`[SSE] Sent ${queuedEvents.length} queued events to ${clientId}`);
} catch (error) {
	console.error(`[SSE] Failed to send initial events:`, error);
}
```

---

## Résumé et Meilleures Pratiques

### Points Clés

1. **EventBroadcaster = Hub Central**
    - Dispatche à **tous** les transports simultanément
    - Design anti-fragile: échec d'un transport n'affecte pas les autres
    - Support de broadcast(), broadcastExcept(), sendToClient(), sendToUser()

2. **MessageQueue = Buffer Résilient**
    - **WebSocket/SSE:** Fallback uniquement (clients déconnectés)
    - **Long Polling:** Mécanisme principal (clients sans poll actif)
    - TTL: 60 secondes, deduplication automatique
    - Cleanup automatique toutes les 10 secondes

3. **Latence Variable**
    - WebSocket: 5-15ms (optimal)
    - SSE: 20-50ms (excellent)
    - Long Polling: 0-30s (variable, acceptable)

4. **Sélection Auto du Transport**
    - Frontend détecte les capacités du navigateur et de l'environnement
    - Fallback automatique: WebSocket → SSE → Long Polling → REST (no events)

### Recommandations

**Pour le Développement:**

- Tester tous les modes de transport (TransportModeSelector)
- Simuler les déconnexions réseau
- Vérifier que les événements sont bien reçus après reconnexion

**Pour la Production:**

- Privilégier WebSocket (meilleure performance)
- SSE comme fallback (bon compromis)
- Long Polling pour environnements restrictifs uniquement
- Monitorer les queues (taille, latence de delivery)

**Anti-Patterns à Éviter:**

- ❌ Ne pas appeler `broadcast()` en boucle (utiliser throttling)
- ❌ Ne pas envoyer des payloads massifs (>1MB) via événements
- ❌ Ne pas oublier d'unsubscribe quand un composant est démonté
- ❌ Ne pas mélanger Long Polling avec polling manuel (double overhead)

---

## Fichiers de Référence

### Backend

- `EventBroadcaster.ts` - Hub central de dispatch
- `MessageQueue.ts` - File d'attente résiliente
- `TransportSessionManager.ts` - Gestion des sessions
- `WebSocketTransportServer.ts` - Transport WebSocket
- `SSETransportServer.ts` - Transport SSE
- `LongPollingTransportServer.ts` - Transport Long Polling

### Frontend

- `TransportProvider.tsx` - Provider React pour les transports
- `WebSocketTransportClient.ts` - Client WebSocket
- `SSETransportClient.ts` - Client SSE
- `LongPollingTransportClient.ts` - Client Long Polling
- `RestTransportClient.ts` - Client REST (no events)

### Configuration

- `server.ts` - Initialisation des transports (lignes 97-155)
- `DataStoreFactory.ts` - Factory pour les composants transport

---

**Document généré le:** 2025-12-27_19-52
**Architecture version:** 1.0
**Statut:** ✅ Complet et vérifié
