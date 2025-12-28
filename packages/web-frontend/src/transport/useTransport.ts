/**
 * useTransport Hook
 *
 * Convenient hook for accessing the transport client in components.
 *
 * This hook provides easy access to the transport client instance from
 * TransportContext. It simplifies the common pattern of accessing the
 * transport client in components.
 *
 * @example
 * ```tsx
 * function TasksList() {
 *   const { transport } = useTransport();
 *   const [tasks, setTasks] = useState([]);
 *
 *   useEffect(() => {
 *     // Make requests
 *     transport.request('GET', '/api/tasks/').then(setTasks);
 *
 *     // Subscribe to events
 *     const unsubscribe = transport.subscribe('b2f:task:created', (task) => {
 *       setTasks(prev => [...prev, task]);
 *     });
 *
 *     return unsubscribe;
 *   }, [transport]);
 *
 *   return <div>{tasks.map(task => <TaskItem key={task.id} task={task} />)}</div>;
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Check connection state
 * function MyComponent() {
 *   const { transport, connectionState, isConnected } = useTransport();
 *
 *   const handleAction = async () => {
 *     if (!isConnected) {
 *       console.warn('Not connected, state:', connectionState);
 *       return;
 *     }
 *
 *     await transport.request('POST', '/api/tasks/', {
 *       body: { title: 'New Task' }
 *     });
 *   };
 *
 *   return <button onClick={handleAction}>Create Task</button>;
 * }
 * ```
 *
 * @throws Error if used outside TransportProvider
 */
import type { ConnectionState } from '@shared/transport';

import type { ITransportClient } from './ITransportClient';
import { useTransportContext } from './TransportProvider';

/**
 * Transport hook result
 * Provides transport client instance and connection state information
 */
export interface TransportHookResult {
	/** Transport client instance */
	transport: ITransportClient;
	/** Current connection state */
	connectionState: ConnectionState;
	/** Whether transport is connected (convenience shorthand for connectionState === 'connected') */
	isConnected: boolean;
	/** Port number being used for the connection */
	port: number;
	/** Force manual downgrade to REST polling (stops WebSocket reconnection attempts) */
	forceDowngrade: () => void;
	/** Next reconnection delay in seconds (0 if not reconnecting) */
	reconnectDelay: number;
	/** Switch to a different transport mode dynamically (without page reload) */
	switchTransport: (
		mode: 'auto' | 'websocket' | 'sse' | 'long-polling' | 'http-polling' | 'rest' | 'mock'
	) => Promise<void>;
	/** Connection ID - Unique identifier for this browser/tab (for request correlation) */
	connId: string;
	/** Active subscriptions - Event types that have handlers registered locally */
	subscriptions: string[];
}

/**
 * Hook to access the transport client and connection state
 *
 * Returns the transport client instance and connection state from context.
 * Must be used within a TransportProvider.
 *
 * @returns Transport client, connection state, and isConnected flag
 * @throws Error if used outside TransportProvider
 */
export function useTransport(): TransportHookResult {
	const context = useTransportContext();

	if (!context.transport) {
		throw new Error('Transport not initialized');
	}

	return {
		transport: context.transport,
		connectionState: context.connectionState,
		isConnected: context.isConnected,
		port: context.port,
		forceDowngrade: context.forceDowngrade,
		reconnectDelay: context.reconnectDelay,
		switchTransport: context.switchTransport,
		connId: context.connId,
		subscriptions: context.subscriptions,
	};
}

/**
 * Hook to access connection ID
 *
 * Convenience hook that returns only the connection ID.
 * Useful when you only need the connId and not the full transport context.
 *
 * @returns Connection ID (unique per browser/tab)
 * @throws Error if used outside TransportProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const connId = useConnId();
 *   console.log('My connection ID:', connId);
 *   return <div>Connected as: {connId.substring(0, 8)}</div>;
 * }
 * ```
 */
export function useConnId(): string {
	const context = useTransportContext();
	return context.connId;
}

/**
 * Re-export TransportProvider and context hook
 */
export { TransportProvider, useTransportContext } from './TransportProvider';
export type { TransportProviderProps, TransportContextState } from './TransportProvider';
