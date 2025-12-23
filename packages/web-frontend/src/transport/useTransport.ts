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
 *   const transport = useTransport();
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
 *   const transport = useTransport();
 *
 *   const handleAction = async () => {
 *     if (!transport.isConnected()) {
 *       console.warn('Not connected');
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
import type { ITransportClient } from './ITransportClient';
import { useTransportContext } from './TransportProvider';

/**
 * Hook to access the transport client
 *
 * Returns the transport client instance from context. Must be used within
 * a TransportProvider.
 *
 * @returns ITransportClient instance
 * @throws Error if used outside TransportProvider
 */
export function useTransport(): ITransportClient {
	const { transport } = useTransportContext();

	if (!transport) {
		throw new Error('Transport not initialized');
	}

	return transport;
}

/**
 * Re-export types for convenience
 */
export type {
	ITransportClient,
	TransportConfig,
	ConnectionState,
	ConnectionStateHandler,
	TransportType,
} from './ITransportClient';

/**
 * Re-export TransportProvider and context hook
 */
export { TransportProvider, useTransportContext } from './TransportProvider';
export type { TransportProviderProps, TransportContextState } from './TransportProvider';
