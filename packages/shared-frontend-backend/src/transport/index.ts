/**
 * Transport Layer - Phase 1: Shared Types
 *
 * This module provides the foundational types and interfaces for the transport layer.
 * It enables type-safe communication between frontend and backend using multiple
 * transport mechanisms (WebSocket, SSE, HTTP, etc.)
 *
 * Key Features:
 * - Type-safe requests/responses based on ALL_API_ROUTES
 * - Type-safe event subscriptions based on domain types
 * - Transport-agnostic interface (ITransport)
 * - Server-side event filtering support (SubscriptionMessage)
 *
 * @see packages/shared-frontend-backend/.claude/plans/transport-front-back_prop4.md
 */

//FIXME remove index.ts

// Transport Protocol - Core protocol types
export type {
	TransportRequest,
	TransportResponse,
	TransportEvent,
	SubscriptionMessage,
	TransportError,
} from './TransportProtocol';

// Event Types - Event type registry and helpers
export type {
	CrudEventType,
	ResourceEvent,
	BusinessEvents,
	EventTypes,
	EventType,
	EventData,
	EventFilter,
	ResourceName,
	EventsForResource,
} from './EventTypes';

// B2F Event Constants - Backend-to-Frontend event constants
export {
	B2F_TASKS_UPDATED,
	B2F_TASK_CREATED,
	B2F_TASK_UPDATED,
	B2F_TASK_DELETED,
	B2F_TASK_STATUS_CHANGED,
	B2F_TASK_ASSIGNED,
	B2F_TASK_PRIORITY_CHANGED,
	B2F_WORKERS_UPDATED,
	B2F_WORKER_CREATED,
	B2F_WORKER_UPDATED,
	B2F_WORKER_DELETED,
	B2F_WORKER_STATUS_CHANGED,
	B2F_WORKER_HEARTBEAT,
	B2F_WORKER_CAPACITY_CHANGED,
	B2F_WORKER_CONNECTED,
	B2F_WORKER_DISCONNECTED,
	B2F_WORKER_STATUS,
	B2F_WORKSPACE_CREATED,
	B2F_WORKSPACE_UPDATED,
	B2F_WORKSPACE_DELETED,
	B2F_WORKSPACE_STATUS_CHANGED,
	B2F_WORKSPACE_QUOTA_EXCEEDED,
	B2F_WORKSPACE_ARCHIVED,
	B2F_DASHBOARD_UPDATED,
} from './B2FEventConstants';

// Typed Transport - Type-safe transport interface
export type {
	ITransport,
	TransportConfig,
	RequestOptions,
	ResponseType,
	UnsubscribeFunction,
	ConnectionState,
	ConnectionStateHandler,
	EventHandler,
	TransportType,
} from './TypedTransport';

export { isValidPath, getAvailableMethods } from './TypedTransport';

// Re-export route builder types needed by transport
export type { HttpMethod, RouteContract } from '../route-builder';
export type { PathsForMethod, RouteParams, RouteQuery, RouteBody, RouteResponse } from '../types';
