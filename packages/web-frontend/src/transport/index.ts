/**
 * Transport Layer - Phase 5: Frontend Integration
 *
 * This module provides the frontend transport implementation with:
 * - Automatic cookie-based authentication (HTTP_ONLY cookies)
 * - Automatic token refresh before expiration
 * - Server-side event filtering via subscriptions
 * - Multiple transport adapters (WebSocket, REST, Mock)
 * - Type-safe requests and events
 * - React context and hooks for easy integration
 *
 * Security Features:
 * - Tokens are NEVER exposed to JavaScript
 * - HTTP_ONLY cookies for authentication
 * - Automatic token refresh via HTTP
 * - No tokens in WebSocket messages
 *
 * @see .claude/plans/transport-front-back_prop4.md
 */

// Transport Manager (Singleton)
export { TransportManager } from './TransportManager';
export type { TransportManagerConfig, TransportMode } from './TransportManager';

// Token Refresh Manager
export { TokenRefreshManager } from './TokenRefreshManager';
export type { TokenRefreshConfig } from './TokenRefreshManager';

// Connection ID helpers (centralized connId management)
export { clearConnId, getConnId } from './connection-id';

// Transport Client Interface
export type { ITransportClient, Subscription, TransportStatus } from './ITransportClient';

// Transport Adapters
export { WebSocketTransportClient } from './adapters/WebSocketTransportClient';
export { SSETransportClient } from './adapters/SSETransportClient';
export { LongPollingTransportClient } from './adapters/LongPollingTransportClient';
export { HttpPollingTransportClient } from './adapters/HttpPollingTransportClient';
export { RestTransportClient } from './adapters/RestTransportClient';
export { MockTransportClient } from './adapters/MockTransportClient';

// React Integration (Phase 5)
export { TransportProvider, useTransportContext } from './TransportProvider';
export type { TransportProviderProps, TransportContextState } from './TransportProvider';
export { useTransport, useConnId } from './useTransport';
export type { TransportHookResult } from './useTransport';
