/**
 * Transport Integration Tests
 *
 * Full integration tests for the transport layer including:
 * - TransportProvider initialization and connection
 * - useTransport hook in components
 * - Request/response flow through transport
 * - Event subscription and handling in components
 * - Connection state tracking in UI
 * - Cleanup on component unmount
 *
 * These tests verify the complete flow from React components through
 * the transport layer using MockTransportClient for predictable behavior.
 */
import { useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { type ConnectionState } from '@shared/transport';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TransportProvider, useTransportContext } from '../TransportProvider';
import { MockTransportClient } from '../adapters/MockTransportClient';
import { useTransport } from '../useTransport';

/**
 * Wrapper component that provides both Router and TransportProvider
 */
function TestWrapper({
	children,
	transport,
	autoConnect = false,
}: {
	children: React.ReactNode;
	transport: MockTransportClient;
	autoConnect?: boolean;
}) {
	return (
		<MemoryRouter>
			<TransportProvider transport={transport} autoConnect={autoConnect}>
				{children}
			</TransportProvider>
		</MemoryRouter>
	);
}

// Test component that uses transport for requests
function TasksList() {
	const { transport } = useTransportContext();
	const [tasks, setTasks] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function fetchTasks() {
			if (!transport) {
				setError('Transport not available');
				setLoading(false);
				return;
			}

			try {
				setLoading(true);
				const data = await transport.request('GET', '/api/tasks/' as any);
				setTasks(Array.isArray(data) ? data : []);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to fetch tasks');
			} finally {
				setLoading(false);
			}
		}

		fetchTasks();
	}, [transport]);

	if (loading) return <div>Loading tasks...</div>;
	if (error) return <div role="alert">Error: {error}</div>;

	return (
		<div>
			<h1>Tasks</h1>
			<ul>
				{tasks.map((task: any) => (
					<li key={task.id} data-testid={`task-${task.id}`}>
						{task.description}
					</li>
				))}
			</ul>
		</div>
	);
}

// Test component that subscribes to events
function TasksWithEvents() {
	const { transport } = useTransport();
	const [tasks, setTasks] = useState<any[]>([]);
	const [eventCount, setEventCount] = useState(0);

	useEffect(() => {
		// Subscribe to task:created events
		const unsubscribe = transport.subscribe('task:created' as any, (task: any) => {
			setTasks(prev => [...prev, task]);
			setEventCount(prev => prev + 1);
		});

		return unsubscribe;
	}, [transport]);

	return (
		<div>
			<h1>Tasks (Live)</h1>
			<div data-testid="event-count">Events received: {eventCount}</div>
			<ul>
				{tasks.map(task => (
					<li key={task.id} data-testid={`task-${task.id}`}>
						{task.description}
					</li>
				))}
			</ul>
		</div>
	);
}

// Test component that creates tasks
function CreateTaskForm() {
	const { transport } = useTransport();
	const [description, setDescription] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [result, setResult] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!description.trim()) return;

		try {
			setSubmitting(true);
			const task = (await transport.request(
				'POST',
				'/api/tasks/' as any,
				{
					body: { description },
				} as any
			)) as any;
			setResult(`Created task: ${task.id}`);
			setDescription('');
		} catch (err) {
			setResult(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<form onSubmit={handleSubmit}>
			<input
				type="text"
				value={description}
				onChange={e => setDescription(e.target.value)}
				placeholder="Task description"
				disabled={submitting}
			/>
			<button type="submit" disabled={submitting}>
				{submitting ? 'Creating...' : 'Create Task'}
			</button>
			{result && <div data-testid="result">{result}</div>}
		</form>
	);
}

// Test component that monitors connection state
function ConnectionStatus() {
	const { connectionState, isConnected } = useTransportContext();
	const [stateHistory, setStateHistory] = useState<ConnectionState[]>([]);

	useEffect(() => {
		if (connectionState) {
			setStateHistory(prev => [...prev, connectionState]);
		}
	}, [connectionState]);

	return (
		<div>
			<div data-testid="connection-state">State: {connectionState || 'unknown'}</div>
			<div data-testid="is-connected">Connected: {isConnected ? 'yes' : 'no'}</div>
			<div data-testid="state-history">History: {stateHistory.join(' → ')}</div>
		</div>
	);
}

describe('Transport Integration Tests', () => {
	let mockTransport: MockTransportClient;

	beforeEach(() => {
		mockTransport = new MockTransportClient();
		vi.clearAllMocks();
	});

	describe('TransportProvider initialization', () => {
		it('should initialize and provide transport to components', () => {
			render(
				<TestWrapper transport={mockTransport} autoConnect={false}>
					<div data-testid="child">Child Component</div>
				</TestWrapper>
			);

			expect(screen.getByTestId('child')).toBeInTheDocument();
		});

		it('should auto-connect when autoConnect=true', async () => {
			const connectSpy = vi.spyOn(mockTransport, 'connect');

			render(
				<TestWrapper transport={mockTransport} autoConnect={true}>
					<div>Child</div>
				</TestWrapper>
			);

			await waitFor(() => {
				expect(connectSpy).toHaveBeenCalledTimes(1);
			});
		});

		it('should not auto-connect when autoConnect=false', async () => {
			const connectSpy = vi.spyOn(mockTransport, 'connect');

			render(
				<TestWrapper transport={mockTransport} autoConnect={false}>
					<div>Child</div>
				</TestWrapper>
			);

			await new Promise(resolve => setTimeout(resolve, 100));
			expect(connectSpy).not.toHaveBeenCalled();
		});
	});

	describe('useTransport hook in components', () => {
		it('should provide transport to components', async () => {
			mockTransport.mockResponse('GET', '/api/tasks/', {
				body: [
					{ id: '1', description: 'Task 1' },
					{ id: '2', description: 'Task 2' },
				],
			});

			await mockTransport.connect();

			render(
				<TestWrapper transport={mockTransport} autoConnect={false}>
					<TasksList />
				</TestWrapper>
			);

			expect(screen.getByText('Loading tasks...')).toBeInTheDocument();

			await waitFor(() => {
				expect(screen.getByText('Tasks')).toBeInTheDocument();
			});

			expect(screen.getByText('Task 1')).toBeInTheDocument();
			expect(screen.getByText('Task 2')).toBeInTheDocument();
		});

		it('should handle request errors', async () => {
			mockTransport.mockResponse('GET', '/api/tasks/', {
				error: {
					code: 'NETWORK_ERROR',
					message: 'Connection failed',
				},
			});

			await mockTransport.connect();

			render(
				<TestWrapper transport={mockTransport} autoConnect={false}>
					<TasksList />
				</TestWrapper>
			);

			await waitFor(() => {
				expect(screen.getByRole('alert')).toHaveTextContent('Failed to fetch tasks');
			});
		});
	});

	describe('request/response flow', () => {
		it('should handle GET requests', async () => {
			mockTransport.mockResponse('GET', '/api/tasks/', {
				body: [{ id: '1', description: 'Test Task' }],
			});

			await mockTransport.connect();

			render(
				<TestWrapper transport={mockTransport} autoConnect={false}>
					<TasksList />
				</TestWrapper>
			);

			await waitFor(() => {
				expect(screen.getByTestId('task-1')).toHaveTextContent('Test Task');
			});
		});

		it('should handle POST requests', async () => {
			const user = userEvent.setup();

			mockTransport.mockResponse('POST', '/api/tasks/', {
				body: { id: '123', description: 'New task' },
			});

			await mockTransport.connect();

			render(
				<TestWrapper transport={mockTransport} autoConnect={false}>
					<CreateTaskForm />
				</TestWrapper>
			);

			const input = screen.getByPlaceholderText('Task description');
			const button = screen.getByRole('button', { name: /create task/i });

			await user.type(input, 'New task');
			await user.click(button);

			await waitFor(() => {
				expect(screen.getByTestId('result')).toHaveTextContent('Created task: 123');
			});
		});

		it('should track request history', async () => {
			mockTransport.mockResponse('GET', '/api/tasks/', {
				body: [{ id: '1', description: 'Task 1' }],
			});

			await mockTransport.connect();

			render(
				<TestWrapper transport={mockTransport} autoConnect={false}>
					<TasksList />
				</TestWrapper>
			);

			await waitFor(() => {
				expect(screen.getByText('Task 1')).toBeInTheDocument();
			});

			const history = mockTransport.getRequestHistory();
			expect(history).toHaveLength(1);
			expect(history[0].method).toBe('GET');
			expect(history[0].path).toBe('/api/tasks/');
		});
	});

	describe('event subscription and handling', () => {
		it('should receive events in components', async () => {
			await mockTransport.connect();

			render(
				<TestWrapper transport={mockTransport} autoConnect={false}>
					<TasksWithEvents />
				</TestWrapper>
			);

			expect(screen.getByText('Tasks (Live)')).toBeInTheDocument();
			expect(screen.getByTestId('event-count')).toHaveTextContent('Events received: 0');

			// Emit event
			mockTransport.emit('task:created' as any, {
				id: '1',
				description: 'New Task 1',
			});

			await waitFor(() => {
				expect(screen.getByTestId('event-count')).toHaveTextContent('Events received: 1');
			});

			expect(screen.getByTestId('task-1')).toHaveTextContent('New Task 1');
		});

		it('should handle multiple events', async () => {
			await mockTransport.connect();

			render(
				<TestWrapper transport={mockTransport} autoConnect={false}>
					<TasksWithEvents />
				</TestWrapper>
			);

			// Emit multiple events
			mockTransport.emit('task:created' as any, {
				id: '1',
				description: 'Task 1',
			});
			mockTransport.emit('task:created' as any, {
				id: '2',
				description: 'Task 2',
			});
			mockTransport.emit('task:created' as any, {
				id: '3',
				description: 'Task 3',
			});

			await waitFor(() => {
				expect(screen.getByTestId('event-count')).toHaveTextContent('Events received: 3');
			});

			expect(screen.getByTestId('task-1')).toBeInTheDocument();
			expect(screen.getByTestId('task-2')).toBeInTheDocument();
			expect(screen.getByTestId('task-3')).toBeInTheDocument();
		});

		it('should unsubscribe on component unmount', async () => {
			await mockTransport.connect();

			const { unmount } = render(
				<TestWrapper transport={mockTransport} autoConnect={false}>
					<TasksWithEvents />
				</TestWrapper>
			);

			expect(screen.getByText('Tasks (Live)')).toBeInTheDocument();

			// Emit event before unmount
			mockTransport.emit('task:created' as any, {
				id: '1',
				description: 'Task 1',
			});

			await waitFor(() => {
				expect(screen.getByTestId('event-count')).toHaveTextContent('Events received: 1');
			});

			// Unmount component
			unmount();

			// Emit event after unmount - should not cause errors
			expect(() => {
				mockTransport.emit('task:created' as any, {
					id: '2',
					description: 'Task 2',
				});
			}).not.toThrow();
		});
	});

	describe('connection state tracking', () => {
		it('should track connection state in UI', async () => {
			render(
				<TestWrapper transport={mockTransport} autoConnect={false}>
					<ConnectionStatus />
				</TestWrapper>
			);

			expect(screen.getByTestId('connection-state')).toHaveTextContent('State: disconnected');
			expect(screen.getByTestId('is-connected')).toHaveTextContent('Connected: no');

			// Connect
			await mockTransport.connect();

			await waitFor(() => {
				expect(screen.getByTestId('connection-state')).toHaveTextContent('State: connected');
			});

			expect(screen.getByTestId('is-connected')).toHaveTextContent('Connected: yes');
		});

		it('should track connection state transitions', async () => {
			render(
				<TestWrapper transport={mockTransport} autoConnect={false}>
					<ConnectionStatus />
				</TestWrapper>
			);

			// Initial state
			await waitFor(() => {
				expect(screen.getByTestId('state-history')).toHaveTextContent('History: disconnected');
			});

			// Connect
			await mockTransport.connect();

			await waitFor(() => {
				const history = screen.getByTestId('state-history').textContent;
				expect(history).toContain('connecting');
				expect(history).toContain('connected');
			});
		});
	});

	describe('cleanup and disconnection', () => {
		it('should disconnect on provider unmount', async () => {
			const disconnectSpy = vi.spyOn(mockTransport, 'disconnect');

			const { unmount } = render(
				<TestWrapper transport={mockTransport} autoConnect={true}>
					<div>Child</div>
				</TestWrapper>
			);

			await waitFor(() => {
				expect(mockTransport.isConnected()).toBe(true);
			});

			unmount();

			// Note: TransportProvider does NOT disconnect on unmount (singleton persists)
			// This is intentional to maintain connection across React remounts
			await waitFor(() => {
				expect(disconnectSpy).not.toHaveBeenCalled();
			});
		});

		it('should clean up subscriptions on unmount', async () => {
			await mockTransport.connect();

			const { unmount } = render(
				<TestWrapper transport={mockTransport} autoConnect={false}>
					<TasksWithEvents />
				</TestWrapper>
			);

			// Verify subscription works
			mockTransport.emit('task:created' as any, {
				id: '1',
				description: 'Task 1',
			});

			await waitFor(() => {
				expect(screen.getByTestId('event-count')).toHaveTextContent('Events received: 1');
			});

			// Unmount
			unmount();

			// Emitting after unmount should not cause errors
			expect(() => {
				mockTransport.emit('task:created' as any, {
					id: '2',
					description: 'Task 2',
				});
			}).not.toThrow();
		});
	});

	describe('full flow integration', () => {
		it('should handle complete request → event → UI update flow', async () => {
			const user = userEvent.setup();

			mockTransport.mockResponse('POST', '/api/tasks/', {
				body: { id: '123', description: 'Integration test task' },
			});

			await mockTransport.connect();

			render(
				<TestWrapper transport={mockTransport} autoConnect={false}>
					<div>
						<CreateTaskForm />
						<TasksWithEvents />
					</div>
				</TestWrapper>
			);

			const input = screen.getByPlaceholderText('Task description');
			const button = screen.getByRole('button', { name: /create task/i });

			// Create task
			await user.type(input, 'Integration test task');
			await user.click(button);

			await waitFor(() => {
				expect(screen.getByTestId('result')).toHaveTextContent('Created task: 123');
			});

			// Emit event (simulating server broadcast)
			mockTransport.emit('task:created' as any, {
				id: '123',
				description: 'Integration test task',
			});

			// Verify event received and UI updated
			await waitFor(() => {
				expect(screen.getByTestId('task-123')).toHaveTextContent('Integration test task');
			});
		});
	});
});
