/**
 * ===========================================================================================
 * TRANSPORT LAYER EXPORTS
 * ===========================================================================================
 *
 * Multi-transport infrastructure for Frontend-Backend communication.
 * Supports WebSocket, SSE, Long Polling, HTTP Polling, and REST fallback.
 *
 * ===========================================================================================
 */

// Core interfaces
export type { ITransportServer } from './ITransportServer';

// Transport server implementations
export { WebSocketTransportServer } from './adapters/WebSocketTransportServer';
export { SSETransportServer } from './adapters/SSETransportServer';
export { LongPollingTransportServer } from './adapters/LongPollingTransportServer';
export { HttpPollingTransportServer } from './adapters/HttpPollingTransportServer';
export { MockTransportServer } from './adapters/MockTransportServer';

// Event broadcasting
export { EventBroadcaster } from './EventBroadcaster';

// Session management
export { TransportSessionManager, type BaseSession, type TransportSession } from './TransportSessionManager';

// Message queue for polling transports
export { MessageQueue } from './MessageQueue';

// Request routing
export { TransportRouter } from './TransportRouter';
