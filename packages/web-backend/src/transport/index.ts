/**
 * Transport Layer - Backend
 *
 * Export all transport-related modules for easy imports.
 */

// Core interfaces
export type { ITransportServer, ClientConnectedHandler, ClientDisconnectedHandler } from './ITransportServer';

// Session management
export { WebSocketSessionManager } from './WebSocketSessionManager';
export type { WebSocketSession, SessionStats } from './WebSocketSessionManager';

// Routing and broadcasting
export { TransportRouter } from './TransportRouter';
export { EventBroadcaster } from './EventBroadcaster';

// Adapters
export { WebSocketTransportServer } from './adapters/WebSocketTransportServer';
export { MockTransportServer } from './adapters/MockTransportServer';
export type { BroadcastRecord, ClientSendRecord } from './adapters/MockTransportServer';
