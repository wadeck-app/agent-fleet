import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * ===========================================================================================
 * ORCHESTRATOR WEBSOCKET HOOK - Real-time Updates
 * ===========================================================================================
 *
 * Responsibilities:
 * - Connect to orchestrator WebSocket endpoint (ws://localhost:3737/ws/ui)
 * - Handle connection states (connecting, connected, disconnected, error)
 * - Auto-reconnect with exponential backoff (start at 1s, max 30s)
 * - Listen for event types: state_update, command_result, error, snapshot, connected
 * - Emit events using a callback pattern
 * - Clean up on unmount
 *
 * Message Types from Backend:
 * - { type: 'connected', message: string, timestamp: string }
 * - { type: 'state_update', ...data }
 * - { type: 'command_result', ...data }
 * - { type: 'error', ...data }
 * - { type: 'snapshot', ...data }
 *
 * ===========================================================================================
 */

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WebSocketMessage {
	type: 'connected' | 'state_update' | 'command_result' | 'error' | 'snapshot';
	[key: string]: unknown;
}

export interface UseOrchestratorWebSocketParams {
	url?: string; // default: ws://localhost:3737/ws/ui
	enabled?: boolean; // default: true
	onMessage?: (message: WebSocketMessage) => void;
	onStatusChange?: (status: WebSocketStatus) => void;
	// Reconnection config
	initialReconnectDelay?: number; // default: 1000ms
	maxReconnectDelay?: number; // default: 30000ms
	reconnectDecayFactor?: number; // default: 1.5
}

export interface UseOrchestratorWebSocketResult {
	status: WebSocketStatus;
	isConnected: boolean;
	lastMessage: WebSocketMessage | null;
	connect: () => void;
	disconnect: () => void;
	send: (message: unknown) => void;
}

export function useOrchestratorWebSocket(
	params?: UseOrchestratorWebSocketParams
): UseOrchestratorWebSocketResult {
	const {
		url = 'ws://localhost:3737/ws/ui',
		enabled = true,
		onMessage,
		onStatusChange,
		initialReconnectDelay = 1000,
		maxReconnectDelay = 30000,
		reconnectDecayFactor = 1.5,
	} = params || {};

	// State
	const [status, setStatus] = useState<WebSocketStatus>('disconnected');
	const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

	// Refs for managing WebSocket lifecycle
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const reconnectDelayRef = useRef<number>(initialReconnectDelay);
	const shouldReconnectRef = useRef<boolean>(true);
	const isMountedRef = useRef<boolean>(true);

	// Update status and notify callback
	const updateStatus = useCallback(
		(newStatus: WebSocketStatus) => {
			if (isMountedRef.current) {
				setStatus(newStatus);
				onStatusChange?.(newStatus);
				console.log('[useOrchestratorWebSocket] Status changed:', newStatus);
			}
		},
		[onStatusChange]
	);

	// Connect to WebSocket
	const connect = useCallback(() => {
		// Don't connect if disabled or already connecting/connected
		if (!enabled || wsRef.current?.readyState === WebSocket.CONNECTING || wsRef.current?.readyState === WebSocket.OPEN) {
			return;
		}

		console.log('[useOrchestratorWebSocket] Connecting to:', url);
		updateStatus('connecting');

		try {
			const ws = new WebSocket(url);
			wsRef.current = ws;

			// Connection opened
			ws.onopen = () => {
				console.log('[useOrchestratorWebSocket] Connected');
				updateStatus('connected');
				// Reset reconnect delay on successful connection
				reconnectDelayRef.current = initialReconnectDelay;
			};

			// Message received
			ws.onmessage = event => {
				try {
					const message = JSON.parse(event.data) as WebSocketMessage;
					console.log('[useOrchestratorWebSocket] Message received:', message.type);

					if (isMountedRef.current) {
						setLastMessage(message);
						onMessage?.(message);
					}
				} catch (err) {
					console.error('[useOrchestratorWebSocket] Failed to parse message:', err);
				}
			};

			// Connection closed
			ws.onclose = event => {
				console.log('[useOrchestratorWebSocket] Connection closed:', event.code, event.reason);
				wsRef.current = null;

				if (isMountedRef.current) {
					updateStatus('disconnected');

					// Auto-reconnect with exponential backoff if enabled and should reconnect
					if (enabled && shouldReconnectRef.current) {
						const delay = reconnectDelayRef.current;
						console.log('[useOrchestratorWebSocket] Reconnecting in', delay, 'ms');

						reconnectTimeoutRef.current = setTimeout(() => {
							// Increase delay for next reconnection (exponential backoff)
							reconnectDelayRef.current = Math.min(
								reconnectDelayRef.current * reconnectDecayFactor,
								maxReconnectDelay
							);
							connect();
						}, delay);
					}
				}
			};

			// Connection error
			ws.onerror = err => {
				console.error('[useOrchestratorWebSocket] WebSocket error:', err);
				if (isMountedRef.current) {
					updateStatus('error');
				}
			};
		} catch (err) {
			console.error('[useOrchestratorWebSocket] Failed to create WebSocket:', err);
			updateStatus('error');
		}
	}, [enabled, url, onMessage, updateStatus, initialReconnectDelay, maxReconnectDelay, reconnectDecayFactor]);

	// Disconnect from WebSocket
	const disconnect = useCallback(() => {
		console.log('[useOrchestratorWebSocket] Disconnecting');
		shouldReconnectRef.current = false;

		// Clear reconnect timeout
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}

		// Close WebSocket connection
		if (wsRef.current) {
			wsRef.current.close();
			wsRef.current = null;
		}

		if (isMountedRef.current) {
			updateStatus('disconnected');
		}
	}, [updateStatus]);

	// Send message to WebSocket
	const send = useCallback((message: unknown) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify(message));
			console.log('[useOrchestratorWebSocket] Message sent:', message);
		} else {
			console.warn('[useOrchestratorWebSocket] Cannot send message - WebSocket not connected');
		}
	}, []);

	// Auto-connect on mount if enabled
	useEffect(() => {
		isMountedRef.current = true;
		shouldReconnectRef.current = true;

		if (enabled) {
			connect();
		}

		// Cleanup on unmount
		return () => {
			isMountedRef.current = false;
			shouldReconnectRef.current = false;

			// Clear reconnect timeout
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
				reconnectTimeoutRef.current = null;
			}

			// Close WebSocket connection
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}
		};
	}, [enabled, connect]);

	return {
		status,
		isConnected: status === 'connected',
		lastMessage,
		connect,
		disconnect,
		send,
	};
}
