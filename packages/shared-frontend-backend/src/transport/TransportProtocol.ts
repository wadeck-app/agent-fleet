import type { HttpMethod } from '../route-builder';

/**
 * Transport Error
 * Standardized error format for transport layer
 */
export interface TransportError {
	/** Error code (e.g., 'VALIDATION_ERROR', 'NOT_FOUND', 'INTERNAL_ERROR') */
	code: string;
	/** Human-readable error message */
	message: string;
	/** Additional error details */
	details?: Record<string, any>;
}

/**
 * Transport Request
 * Generic request format for all transport mechanisms (WebSocket, HTTP, SSE, etc.)
 *
 * @template TBody - Type of the request body
 */
export interface TransportRequest<TBody = unknown> {
	/** Unique request identifier for matching requests with responses */
	id: string;
	/** HTTP method (GET, POST, PUT, DELETE, PATCH) */
	method: HttpMethod;
	/** API path (e.g., '/api/tasks') */
	path: string;
	/** Query parameters */
	query?: Record<string, any>;
	/** Path parameters (e.g., { id: '123' } for /api/tasks/:id) */
	params?: Record<string, string>;
	/** Request body */
	body?: TBody;
	/** Request headers */
	headers?: Record<string, string>;
	/** Request timestamp in milliseconds since epoch */
	timestamp: number;
}

/**
 * Transport Response
 * Generic response format for all transport mechanisms
 *
 * @template TBody - Type of the response body
 */
export interface TransportResponse<TBody = unknown> {
	/** Request ID that this response corresponds to */
	id: string;
	/** HTTP status code (200, 404, 500, etc.) */
	status: number;
	/** Response body */
	body?: TBody;
	/** Error information (present if status >= 400) */
	error?: TransportError;
	/** Response headers */
	headers?: Record<string, string>;
	/** Response timestamp in milliseconds since epoch */
	timestamp: number;
}

/**
 * Transport Event
 * Real-time event pushed from server to client(s)
 *
 * @template TData - Type of the event data
 */
export interface TransportEvent<TData = unknown> {
	/** Unique event identifier */
	id: string;
	/** Event type (e.g., 'task:created', 'worker:heartbeat') */
	type: string;
	/** Event payload */
	data: TData;
	/** Event timestamp in milliseconds since epoch */
	timestamp: number;
}

/**
 * Subscription Message
 * Control message for managing event subscriptions
 *
 * Clients send this to subscribe/unsubscribe from specific event types.
 * Server-side filtering reduces bandwidth by only sending subscribed events.
 */
export interface SubscriptionMessage {
	/** Message type identifier */
	type: 'subscription';
	/** Subscription action */
	action: 'subscribe' | 'unsubscribe';
	/** Array of event types to subscribe/unsubscribe from */
	events: string[];
	/**
	 * Optional filters for server-side event filtering
	 * Example: { workerId: 'worker-123', status: 'IN_PROGRESS' }
	 * Backend will only broadcast events that match ALL specified filters
	 */
	filters?: Record<string, unknown>;
}
