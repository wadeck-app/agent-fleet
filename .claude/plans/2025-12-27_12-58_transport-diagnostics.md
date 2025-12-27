# Transport Layer Diagnostics - Analysis Report

**Date:** 2025-12-27_12-58
**Status:** Analysis Phase

## Executive Summary

Three transport mechanisms are experiencing failures:

1. **Long Polling** - JSON parsing errors due to empty/incomplete responses
2. **SSE (Server-Sent Events)** - CORS policy violations
3. **Simple HTTP Polling** - Not implemented (backend missing)

All issues are fixable with targeted changes to client-side error handling and server-side CORS configuration.

---

## Problem 1: Long Polling - JSON Parsing Error

### Error Message

```
[LongPolling] Polling error: SyntaxError: Failed to execute 'json' on 'Response':
Unexpected end of JSON input at LongPollingTransportClient.performPoll (LongPollingTransportClient.ts:396:53)
```

### Root Cause Analysis

**Client-Side Issue:**

- **File:** `packages/web-frontend/src/transport/adapters/LongPollingTransportClient.ts:396`
- **Code:** `const data: LongPollingResponse = await response.json();`
- **Problem:** No defensive checking before parsing JSON - assumes response body always exists

**Server-Side Contributing Factor:**

- **File:** `packages/web-backend/src/transport/adapters/LongPollingTransportServer.ts:226-232`
- **Code:** Connection close handler cleans up but doesn't send response

```typescript
request.raw.on('close', () => {
	const p = this.pendingPolls.get(clientId);
	if (p) {
		clearTimeout(p.timeout);
		this.pendingPolls.delete(clientId);
		// Missing: No response sent!
	}
});
```

### Failure Scenario

1. Client initiates long polling request to `/long-polling/events`
2. Server holds connection open (no events queued, not a new session)
3. Client aborts request (reconnection, page navigation, manual disconnect)
4. Server's close handler fires but doesn't send response body
5. Client receives HTTP response with headers but no/incomplete body
6. `response.json()` fails with "Unexpected end of JSON input"

### Technical Details

**Expected Response Format:**

```typescript
interface LongPollingResponse {
	events: TransportEvent[];
	authenticated: boolean;
	userId?: string;
	tokenExpiresAt?: number;
}
```

**Normal Flow (Working):**

- Client polls → Server waits (30s max) → Events arrive OR timeout → Server responds with JSON → Client parses successfully

**Failure Flow (Broken):**

- Client polls → Server waits → Client aborts → Server cleanup (no response) → Client receives empty body → JSON parse error

---

## Problem 2: SSE - CORS Policy Violations

### Error Message

```
Access to resource at 'http://localhost:3030/sse' from origin 'http://localhost:5030'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
on the requested resource.
```

### Root Cause Analysis

**CORS Configuration:**

- **File:** `packages/web-backend/src/server.ts:457-464`
- **Configuration:** Global CORS correctly configured for development

```typescript
await fastify.register(cors, {
	origin: process.env.NODE_ENV === 'production' ? process.env.CORS_ORIGIN || 'http://localhost:5173' : true, // Development: accepts ALL origins
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
});
```

**SSE Implementation:**

- **File:** `packages/web-backend/src/transport/adapters/SSETransportServer.ts:139`
- **Code:** Uses raw HTTP response, bypassing Fastify's CORS plugin

```typescript
reply.raw.writeHead(200, {
	'Content-Type': 'text/event-stream',
	'Cache-Control': 'no-cache',
	Connection: 'keep-alive',
	'X-Accel-Buffering': 'no',
	// Missing: CORS headers!
});
```

### Why CORS Headers Are Missing

**Fastify CORS Plugin Limitation:**

- The CORS plugin adds headers to Fastify-managed responses
- SSE uses `reply.raw.writeHead()` which bypasses Fastify's response pipeline
- CORS headers are NOT automatically added to raw responses
- This is a common gotcha when mixing Fastify abstractions with raw Node.js HTTP

**EventSource API Constraints:**

- Browser's `EventSource` API doesn't send preflight OPTIONS requests
- CORS headers MUST be present in the initial SSE connection response
- Without proper headers, browser blocks the connection immediately

### Technical Details

**Client Request:**

- **File:** `packages/web-frontend/src/transport/adapters/SSETransportClient.ts:166`
- **Code:** `new EventSource(sseUrl, { withCredentials: true })`
- Uses credentials (cookies) → Requires strict CORS headers

**Required CORS Headers for SSE:**

```
Access-Control-Allow-Origin: http://localhost:5030
Access-Control-Allow-Credentials: true
```

---

## Problem 3: Simple HTTP Polling - Not Implemented

### Status: Not Implemented in Backend

**Frontend Reference:**

- Transport mode selector includes `'http'` as an option
- `RestTransportClient` exists but is for request-response only (no event polling)

**Backend Missing:**

- No dedicated simple HTTP polling endpoint
- Only implemented transports:
    - WebSocket (`/ws`)
    - Server-Sent Events (`/sse`)
    - Long Polling (`/long-polling/events`)

**Note:** This is likely intentional - Long Polling serves as the "HTTP fallback" mechanism.

---

## Architecture Overview

### Frontend Transport Clients

**LongPollingTransportClient** (`packages/web-frontend/src/transport/adapters/LongPollingTransportClient.ts`)

- Endpoint: `GET /long-polling/events`
- Subscription: `POST /long-polling/subscription`
- Timeout: 30 seconds client-side
- Strategy: Continuous polling (no delay between polls)

**SSETransportClient** (`packages/web-frontend/src/transport/adapters/SSETransportClient.ts`)

- Endpoint: `GET /sse` (EventSource API)
- Subscription: `POST /sse/subscription`
- Heartbeat: 30-second server-side heartbeat
- Strategy: Single persistent connection

**RestTransportClient** (`packages/web-frontend/src/transport/adapters/RestTransportClient.ts`)

- No dedicated endpoint (uses standard API routes)
- Purpose: Stateless HTTP requests only (no real-time events)
- Better error handling than Long Polling: `await response.json().catch(() => ({}))`

### Backend Transport Servers

**LongPollingTransportServer** (`packages/web-backend/src/transport/adapters/LongPollingTransportServer.ts`)

- Routes:
    - `GET /long-polling/events` (lines 157-240)
    - `POST /long-polling/subscription` (lines 242-279)
- Session timeout: 60 seconds
- Hold timeout: 30 seconds
- Message queue: Yes (for offline events)

**SSETransportServer** (`packages/web-backend/src/transport/adapters/SSETransportServer.ts`)

- Routes:
    - `GET /sse` (lines 113-152)
    - `POST /sse/subscription` (lines 154-195)
- Headers: `text/event-stream`, keep-alive, no-cache
- Heartbeat: 30-second interval (lines 277-288)
- Message queue: Yes (for reconnection)

### Transport Initialization

**File:** `packages/web-backend/src/server.ts:97-155`

All transports initialized and wired to EventBroadcaster:

```typescript
const wsTransportServer = new WebSocketTransportServer(sessionManager, router);
const sseTransportServer = new SSETransportServer(sessionManager, messageQueue);
const longPollingTransportServer = new LongPollingTransportServer(sessionManager, messageQueue);

// All three initialized
await wsTransportServer.initialize(app);
await sseTransportServer.initialize(app);
await longPollingTransportServer.initialize(app);

const eventBroadcaster = new EventBroadcaster(allTransports, sessionManager, messageQueue);
```

---

## Configuration Details

### URL Construction

**Development Mode:**

- Frontend: `http://localhost:5030` (5000 + PROJECT_ID*10 + WORKSPACE_ID*100)
- Backend: `http://localhost:3030` (3000 + PROJECT_ID*10 + WORKSPACE_ID*100)
- Proxy: Frontend proxies `/api` → `http://localhost:3030`

**Environment Variables:**

- `NODE_ENV=development` → CORS accepts all origins
- `VITE_PROJECT_ID=3` → Port offset calculation
- `VITE_WORKSPACE_ID=0` → Port offset calculation
- `DISABLE_AUTH_DEV=true` → Auth bypassed in development

### Transport Endpoints

| Transport    | Frontend URL                                | Backend Route          | Status              |
| ------------ | ------------------------------------------- | ---------------------- | ------------------- |
| WebSocket    | `ws://localhost:3030/ws`                    | `/ws`                  | ✅ Working          |
| SSE          | `http://localhost:3030/sse`                 | `/sse`                 | ❌ CORS Error       |
| Long Polling | `http://localhost:3030/long-polling/events` | `/long-polling/events` | ❌ JSON Parse Error |
| REST         | `http://localhost:3030/api/*`               | Various                | ✅ Working          |

---

## Affected Files Summary

### Frontend Files

1. `packages/web-frontend/src/transport/adapters/LongPollingTransportClient.ts`
    - Line 396: JSON parsing without error handling
    - Line 365-444: performPoll() method

2. `packages/web-frontend/src/transport/adapters/SSETransportClient.ts`
    - Line 166: EventSource with credentials
    - Lines 152-251: connect() method

3. `packages/web-frontend/src/transport/TransportProvider.tsx`
    - Lines 236-247: Transport instantiation
    - Lines 254-280: Transport switching logic

### Backend Files

1. `packages/web-backend/src/transport/adapters/LongPollingTransportServer.ts`
    - Lines 157-240: handlePollRequest() - main polling logic
    - Lines 226-232: Connection close handler (missing response)
    - Lines 312-329: respondToPoll() - sends JSON response

2. `packages/web-backend/src/transport/adapters/SSETransportServer.ts`
    - Line 139: writeHead() without CORS headers
    - Line 191: Authentication error response (also needs CORS)
    - Lines 113-152: handleSSEConnection() method

3. `packages/web-backend/src/server.ts`
    - Lines 457-464: Global CORS configuration
    - Lines 97-155: Transport initialization

---

## Impact Assessment

### Severity

- **High:** SSE completely broken (CORS blocking all connections)
- **High:** Long Polling unreliable (intermittent failures on reconnection)
- **Low:** Simple HTTP polling not needed (Long Polling serves as fallback)

### User Experience

- Users selecting SSE mode: Complete failure, forced to manual downgrade
- Users selecting Long Polling: Intermittent connection failures, automatic reconnection attempts
- Users selecting WebSocket: No issues (working correctly)

### Workaround

- Users can manually select WebSocket transport mode via TransportModeSelector
- WebSocket is the default and working correctly

---

## Next Steps (Analysis Complete)

This is a diagnostic analysis only. Implementation of fixes would require:

1. **Long Polling Fix (Client-Side)**
    - Add try-catch around JSON parsing
    - Handle empty/malformed responses gracefully
    - Estimated complexity: Low

2. **Long Polling Fix (Server-Side)**
    - Send proper response in close handler
    - Check if reply already sent before responding
    - Estimated complexity: Low

3. **SSE Fix (Server-Side)**
    - Add explicit CORS headers to raw response
    - Handle authentication errors with CORS headers
    - Estimated complexity: Low

4. **Testing Strategy**
    - Test connection abort scenarios
    - Test cross-origin SSE connections
    - Test all transport modes end-to-end

All fixes are low-risk and localized to specific files.
