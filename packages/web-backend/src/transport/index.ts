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
export type { ITransportServer } from './ITransportServer.js';

// WebSocket server implementation
export { WebSocketTransportServer } from './adapters/WebSocketTransportServer.js';

// Event broadcasting
export { EventBroadcaster } from './EventBroadcaster.js';

// Session management
export { WebSocketSessionManager } from './WebSocketSessionManager.js';

// Request routing
export { TransportRouter } from './TransportRouter.js';

// Testing utilities
export { MockTransportServer } from './MockTransportServer.js';
