/**
 * ===========================================================================================
 * TRANSPORT LAYER EXPORTS
 * ===========================================================================================
 *
 * WebSocket transport infrastructure for Frontend-Backend communication.
 *
 * ===========================================================================================
 */

// Core interfaces
export type { ITransportServer } from './ITransportServer';

// WebSocket server implementation
export { WebSocketTransportServer } from './adapters/WebSocketTransportServer';

// Event broadcasting
export { EventBroadcaster } from './EventBroadcaster';

// Session management
export { WebSocketSessionManager } from './WebSocketSessionManager';

// Request routing
export { TransportRouter } from './TransportRouter';

// Testing utilities
export { MockTransportServer } from './adapters/MockTransportServer';
