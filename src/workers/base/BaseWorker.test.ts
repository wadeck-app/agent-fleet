/**
 * BaseWorker Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseWorker } from '../base/BaseWorker.js';
import {
	MessageType,
	WorkerType,
	Task,
	TaskStatus,
	WorkerWelcomeMessage,
	AssignTaskMessage,
	KillClaudeMessage,
	ShutdownMessage,
	Message
} from '../../shared/types.js';
import { createMessage, serializeMessage} from '../../shared/protocol.js';

// Global event handlers storage for mock
const globalWsEventHandlers: Record<string, Function> = {};

// Mock the ws module
vi.mock('ws', () => {
	// Define MockWebSocket inside the factory function
	class MockWS {
		static OPEN = 1;
		static CLOSED = 3;
		static CONNECTING = 0;
		static CLOSING = 2;

		on = vi.fn();
		send = vi.fn();
		close = vi.fn();
		readyState = 1; // OPEN

		constructor(public url: string) {
			// Store instance for test access
			MockWS.latestInstance = this;

			// Setup on() to capture handlers
			this.on = vi.fn((event: string, handler: Function) => {
				globalWsEventHandlers[event] = handler;
				return this;
			});
		}

		static latestInstance: any | null = null;
		static reset() {
			MockWS.latestInstance = null;
		}
	}

	return {
		default: MockWS
	};
});

// Create a concrete implementation of BaseWorker for testing
class TestWorker extends BaseWorker {
	public executeTaskMock = vi.fn();

	protected async executeTask(task: Task): Promise<void> {
		return this.executeTaskMock(task);
	}

	// Expose protected methods for testing
	public exposedSendMessage(message: Message): void {
		return this.sendMessage(message);
	}

	public exposedSendTaskStarted(newStatus?: string): void {
		return this.sendTaskStarted(newStatus);
	}

	public exposedSendTaskProgress(progress: string): void {
		return this.sendTaskProgress(progress);
	}

	public exposedSendTaskCompleted(result?: any, newStatus?: string): void {
		return this.sendTaskCompleted(result, newStatus);
	}

	public exposedSendTaskFailed(error: string, newStatus?: TaskStatus): void {
		return this.sendTaskFailed(error, newStatus);
	}

	public exposedSendTaskQuestion(question: string): void {
		return this.sendTaskQuestion(question);
	}

	public exposedSendStopRequested(claudePid: number): void {
		return this.sendStopRequested(claudePid);
	}

	public exposedSendHookEvent(hookName: string, data: any): void {
		return this.sendHookEvent(hookName, data);
	}

	public getWorkerId(): string {
		return this.workerId;
	}

	public getCurrentTask(): Task | null {
		return this.currentTask;
	}

	public getWs(): any | null {
		return this.ws;
	}
}

describe('BaseWorker', () => {
	let worker: TestWorker;
	let mockWs: any;
	let MockWebSocket: any;

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		// Get the mocked WebSocket class
		const ws = await import('ws');
		MockWebSocket = ws.default;

		MockWebSocket.reset();

		// Clear global handlers
		Object.keys(globalWsEventHandlers).forEach(key => delete globalWsEventHandlers[key]);

		worker = new TestWorker(WorkerType.DEV, 'ws://localhost:3738');
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// Helper to get the mock WebSocket instance
	const getMockWs = () => {
		mockWs = MockWebSocket.latestInstance!;
		return mockWs;
	};

	describe('Constructor', () => {
		it('should initialize with default values', () => {
			const worker = new TestWorker(WorkerType.DEV);

			expect(worker.getWorkerId()).toBe('?');
		});

		it('should accept custom wsUrl', () => {
			const customUrl = 'ws://custom:9999';
			const worker = new TestWorker(WorkerType.DEV, customUrl);

			expect(worker).toBeDefined();
		});

		it('should accept preferredWorkerId', () => {
			const worker = new TestWorker(WorkerType.DEV, 'ws://localhost:3738', 'preferred-123');

			expect(worker).toBeDefined();
		});
	});

	describe('Connection', () => {
		it('should connect to WebSocket server', async () => {
			// Need to set up handlers before connect() is called
			const connectPromise = (async () => {
				// Introduce a small delay to allow mockWs to be assigned
				await Promise.resolve();
				getMockWs();
				return worker.connect();
			})();

			// Give connect() time to create the WebSocket
			await Promise.resolve();
			getMockWs();

			globalWsEventHandlers['open']();
			await connectPromise;

			expect(mockWs.on).toHaveBeenCalledWith('open', expect.any(Function));
			expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function));
			expect(mockWs.on).toHaveBeenCalledWith('close', expect.any(Function));
			expect(mockWs.on).toHaveBeenCalledWith('error', expect.any(Function));
		});

		it('should send WORKER_READY message after connecting', async () => {
			const connectPromise = worker.connect();
			getMockWs();

			globalWsEventHandlers['open']();
			await connectPromise;

			expect(mockWs.send).toHaveBeenCalledWith(
				expect.stringContaining('worker_ready')
			);

			const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
			expect(sentMessage.type).toBe(MessageType.WORKER_READY);
			expect(sentMessage.workerType).toBe(WorkerType.DEV);
		});

		it('should send WORKER_READY with preferredId if provided', async () => {
			const workerWithPreferred = new TestWorker(
				WorkerType.DEV,
				'ws://localhost:3738',
				'preferred-123'
			);

			const connectPromise = workerWithPreferred.connect();
			getMockWs();

			globalWsEventHandlers['open']();
			await connectPromise;

			const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
			expect(sentMessage.preferredId).toBe('preferred-123');
		});

		it('should reject on WebSocket error', async () => {
			const connectPromise = worker.connect();
			getMockWs();

			const error = new Error('Connection failed');
			globalWsEventHandlers['error'](error);

			await expect(connectPromise).rejects.toThrow('Connection failed');
		});

		it('should handle close event and schedule reconnect', async () => {
			const connectPromise = worker.connect();
			getMockWs();

			globalWsEventHandlers['open']();
			await connectPromise;

			// Clear previous calls
			MockWebSocket.reset();

			// Simulate close event
			globalWsEventHandlers['close']();

			// Fast-forward time to trigger reconnect
			vi.advanceTimersByTime(5000);

			// Should have created a new WebSocket instance
			expect(MockWebSocket.latestInstance).not.toBeNull();
		});
	});

	describe('Heartbeat', () => {
		beforeEach(async () => {
			const connectPromise = worker.connect();
			getMockWs();
			globalWsEventHandlers['open']();
			await connectPromise;
			mockWs.send.mockClear();
		});

		it('should start heartbeat after connection', () => {
			// Fast-forward time to trigger heartbeat
			vi.advanceTimersByTime(30000);

			expect(mockWs.send).toHaveBeenCalled();
			const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
			expect(sentMessage.type).toBe(MessageType.WORKER_HEARTBEAT);
		});

		it('should send heartbeat at regular intervals', () => {
			// Fast-forward through multiple heartbeat intervals
			vi.advanceTimersByTime(30000);
			expect(mockWs.send).toHaveBeenCalledTimes(1);

			vi.advanceTimersByTime(30000);
			expect(mockWs.send).toHaveBeenCalledTimes(2);

			vi.advanceTimersByTime(30000);
			expect(mockWs.send).toHaveBeenCalledTimes(3);
		});

		it('should stop heartbeat on disconnect', () => {
			// Disconnect
			globalWsEventHandlers['close']();

			mockWs.send.mockClear();

			// Fast-forward time
			vi.advanceTimersByTime(60000);

			// Should not send heartbeats after disconnect
			expect(mockWs.send).not.toHaveBeenCalled();
		});
	});

	describe('Message Handling', () => {
		beforeEach(async () => {
			const connectPromise = worker.connect();
			getMockWs();
			globalWsEventHandlers['open']();
			await connectPromise;
		});

		it('should handle WORKER_WELCOME message', () => {
			const welcomeMessage: WorkerWelcomeMessage = createMessage(
				MessageType.WORKER_WELCOME,
				{ workerId: 'worker-123' }
			);

			globalWsEventHandlers['message'](Buffer.from(serializeMessage(welcomeMessage)));

			expect(worker.getWorkerId()).toBe('worker-123');
		});

		it('should handle ASSIGN_TASK message', async () => {
			const task: Task = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.TODO,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: null,
				comments: [],
				metadata: {},
				history: [],
			};

			const assignMessage: AssignTaskMessage = createMessage(
				MessageType.ASSIGN_TASK,
				{ task }
			);

			worker.executeTaskMock.mockResolvedValue(undefined);

			globalWsEventHandlers['message'](Buffer.from(serializeMessage(assignMessage)));

			// Wait for async task execution
			await vi.waitFor(() => {
				expect(worker.executeTaskMock).toHaveBeenCalledWith(task);
			});

			expect(worker.getCurrentTask()).not.toBeNull();
		});

		it('should handle task execution error', async () => {
			const task: Task = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.TODO,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: null,
				comments: [],
				metadata: {},
				history: [],
			};

			const assignMessage: AssignTaskMessage = createMessage(
				MessageType.ASSIGN_TASK,
				{ task }
			);

			const error = new Error('Task execution failed');
			worker.executeTaskMock.mockRejectedValue(error);

			mockWs.send.mockClear();

			globalWsEventHandlers['message'](Buffer.from(serializeMessage(assignMessage)));

			await vi.waitFor(() => {
				const failedMessages = mockWs.send.mock.calls.filter((call: any[]) => {
					const msg = JSON.parse(call[0]);
					return msg.type === MessageType.TASK_FAILED;
				});
				expect(failedMessages.length).toBeGreaterThan(0);
			});
		});

		it('should handle KILL_CLAUDE message', () => {
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			const killMessage: KillClaudeMessage = createMessage(
				MessageType.KILL_CLAUDE,
				{ reason: 'Test kill' }
			);

			globalWsEventHandlers['message'](Buffer.from(serializeMessage(killMessage)));

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Kill Claude requested')
			);

			consoleSpy.mockRestore();
		});

		it('should handle PAUSE message', () => {
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			const pauseMessage = createMessage(MessageType.PAUSE, {});

			globalWsEventHandlers['message'](Buffer.from(serializeMessage(pauseMessage)));

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('PAUSE')
			);

			consoleSpy.mockRestore();
		});

		it('should handle RESUME message', () => {
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			const resumeMessage = createMessage(MessageType.RESUME, {});

			globalWsEventHandlers['message'](Buffer.from(serializeMessage(resumeMessage)));

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('RESUME')
			);

			consoleSpy.mockRestore();
		});

		it('should handle SHUTDOWN message', () => {
			const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

			const shutdownMessage: ShutdownMessage = createMessage(
				MessageType.SHUTDOWN,
				{}
			);

			globalWsEventHandlers['message'](Buffer.from(serializeMessage(shutdownMessage)));

			expect(exitSpy).toHaveBeenCalledWith(0);

			exitSpy.mockRestore();
		});

		it('should handle ACK message', () => {
			const ackMessage = createMessage(MessageType.ACK, {});

			// Should not throw
			expect(() => {
				globalWsEventHandlers['message'](Buffer.from(serializeMessage(ackMessage)));
			}).not.toThrow();
		});

		it('should warn on unknown message type', () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const unknownMessage = {
				type: 'unknown_type',
				timestamp: new Date().toISOString(),
			};

			globalWsEventHandlers['message'](Buffer.from(JSON.stringify(unknownMessage)));

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Unknown message type')
			);

			consoleSpy.mockRestore();
		});

		it('should handle invalid message format', () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			globalWsEventHandlers['message'](Buffer.from('invalid json'));

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Error parsing message'),
				expect.any(String)
			);

			consoleSpy.mockRestore();
		});
	});

	describe('Task Notifications', () => {
		let task: Task;

		beforeEach(async () => {
			const connectPromise = worker.connect();
			getMockWs();
			globalWsEventHandlers['open']();
			await connectPromise;

			task = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.TODO,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: null,
				comments: [],
				metadata: {},
				history: [],
			};

			// Assign a task to the worker
			const assignMessage: AssignTaskMessage = createMessage(
				MessageType.ASSIGN_TASK,
				{ task }
			);

			worker.executeTaskMock.mockImplementation(async () => {
				// Task execution in progress
			});

			globalWsEventHandlers['message'](Buffer.from(serializeMessage(assignMessage)));

			await vi.waitFor(() => {
				expect(worker.getCurrentTask()).not.toBeNull();
			});

			mockWs.send.mockClear();
		});

		it('should send TASK_STARTED notification', () => {
			worker.exposedSendTaskStarted();

			expect(mockWs.send).toHaveBeenCalled();
			const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
			expect(sentMessage.type).toBe(MessageType.TASK_STARTED);
			expect(sentMessage.taskId).toBe('task-1');
		});

		it('should send TASK_STARTED with custom status', () => {
			worker.exposedSendTaskStarted(TaskStatus.IN_PROGRESS);

			const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
			expect(sentMessage.newStatus).toBe(TaskStatus.IN_PROGRESS);
		});

		it('should send TASK_PROGRESS notification', () => {
			worker.exposedSendTaskProgress('50% complete');

			expect(mockWs.send).toHaveBeenCalled();
			const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
			expect(sentMessage.type).toBe(MessageType.TASK_PROGRESS);
			expect(sentMessage.progress).toBe('50% complete');
		});

		it('should send TASK_COMPLETED notification', () => {
			worker.exposedSendTaskCompleted({ success: true });

			expect(mockWs.send).toHaveBeenCalled();
			const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
			expect(sentMessage.type).toBe(MessageType.TASK_COMPLETED);
			expect(sentMessage.result).toEqual({ success: true });
			expect(worker.getCurrentTask()).toBeNull();
		});

		it('should send TASK_COMPLETED with custom status', () => {
			worker.exposedSendTaskCompleted({ success: true }, TaskStatus.REVIEW);

			const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
			expect(sentMessage.newStatus).toBe(TaskStatus.REVIEW);
		});

		it('should send TASK_FAILED notification', () => {
			worker.exposedSendTaskFailed('Something went wrong');

			expect(mockWs.send).toHaveBeenCalled();
			const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
			expect(sentMessage.type).toBe(MessageType.TASK_FAILED);
			expect(sentMessage.error).toBe('Something went wrong');
			expect(worker.getCurrentTask()).toBeNull();
		});

		it('should send TASK_FAILED with custom status', () => {
			worker.exposedSendTaskFailed('Error', TaskStatus.BLOCKED);

			const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
			expect(sentMessage.newStatus).toBe(TaskStatus.BLOCKED);
		});

		it('should send TASK_QUESTION notification', () => {
			worker.exposedSendTaskQuestion('Need clarification?');

			expect(mockWs.send).toHaveBeenCalled();
			const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
			expect(sentMessage.type).toBe(MessageType.TASK_QUESTION);
			expect(sentMessage.question).toBe('Need clarification?');
		});

		it('should send STOP_REQUESTED notification', () => {
			worker.exposedSendStopRequested(12345);

			expect(mockWs.send).toHaveBeenCalled();
			const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
			expect(sentMessage.type).toBe(MessageType.STOP_REQUESTED);
			expect(sentMessage.claudePid).toBe(12345);
		});

		it('should send HOOK_EVENT notification', () => {
			const hookData = { event: 'test', data: 'value' };
			worker.exposedSendHookEvent('test-hook', hookData);

			expect(mockWs.send).toHaveBeenCalled();
			const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
			expect(sentMessage.type).toBe(MessageType.HOOK_EVENT);
			expect(sentMessage.hookName).toBe('test-hook');
			expect(sentMessage.data).toEqual(hookData);
		});

		it('should not send notifications when no task is assigned', () => {
			// Complete the task to clear currentTask
			worker.exposedSendTaskCompleted();
			mockWs.send.mockClear();

			// Try to send notifications
			worker.exposedSendTaskStarted();
			worker.exposedSendTaskProgress('test');
			worker.exposedSendTaskCompleted();
			worker.exposedSendTaskFailed('error');
			worker.exposedSendTaskQuestion('question');
			worker.exposedSendStopRequested(123);

			expect(mockWs.send).not.toHaveBeenCalled();
		});
	});

	describe('Message Sending', () => {
		beforeEach(async () => {
			const connectPromise = worker.connect();
			getMockWs();
			globalWsEventHandlers['open']();
			await connectPromise;
			mockWs.send.mockClear();
		});

		it('should send message when connected', () => {
			const message = createMessage(MessageType.WORKER_HEARTBEAT, {
				workerId: 'test',
			});

			worker.exposedSendMessage(message);

			expect(mockWs.send).toHaveBeenCalledWith(serializeMessage(message));
		});

		it('should not send message when disconnected', () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			mockWs.readyState = 3; // CLOSED

			const message = createMessage(MessageType.WORKER_HEARTBEAT, {
				workerId: 'test',
			});

			worker.exposedSendMessage(message);

			expect(mockWs.send).not.toHaveBeenCalled();
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Cannot send message')
			);

			consoleSpy.mockRestore();
		});

		it('should not send message when WebSocket is null', () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			// Create a new worker without connecting
			const disconnectedWorker = new TestWorker(WorkerType.DEV);

			const message = createMessage(MessageType.WORKER_HEARTBEAT, {
				workerId: 'test',
			});

			disconnectedWorker.exposedSendMessage(message);

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Cannot send message')
			);

			consoleSpy.mockRestore();
		});
	});

	describe('Shutdown', () => {
		it('should shutdown gracefully', async () => {
			const connectPromise = worker.connect();
			getMockWs();
			globalWsEventHandlers['open']();
			await connectPromise;

			const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

			worker.shutdown();

			expect(mockWs.close).toHaveBeenCalled();
			expect(exitSpy).toHaveBeenCalledWith(0);

			exitSpy.mockRestore();
		});

		it('should stop heartbeat on shutdown', async () => {
			const connectPromise = worker.connect();
			getMockWs();
			globalWsEventHandlers['open']();
			await connectPromise;

			const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

			mockWs.send.mockClear();

			worker.shutdown();

			// Fast-forward time
			vi.advanceTimersByTime(60000);

			// Should not send heartbeats after shutdown
			const heartbeatMessages = mockWs.send.mock.calls.filter((call: any[]) => {
				if (call[0]) {
					const msg = JSON.parse(call[0]);
					return msg.type === MessageType.WORKER_HEARTBEAT;
				}
				return false;
			});

			expect(heartbeatMessages.length).toBe(0);

			exitSpy.mockRestore();
		});

		it('should handle shutdown when not connected', () => {
			const disconnectedWorker = new TestWorker(WorkerType.DEV);
			const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

			// Should not throw
			expect(() => {
				disconnectedWorker.shutdown();
			}).not.toThrow();

			expect(exitSpy).toHaveBeenCalledWith(0);

			exitSpy.mockRestore();
		});
	});

	describe('Worker Lifecycle', () => {
		it('should complete full lifecycle: connect -> assign -> execute -> complete', async () => {
			// Connect
			const connectPromise = worker.connect();
			getMockWs();
			globalWsEventHandlers['open']();
			await connectPromise;

			// Welcome
			const welcomeMessage: WorkerWelcomeMessage = createMessage(
				MessageType.WORKER_WELCOME,
				{ workerId: 'worker-123' }
			);
			globalWsEventHandlers['message'](Buffer.from(serializeMessage(welcomeMessage)));

			expect(worker.getWorkerId()).toBe('worker-123');

			// Assign task
			const task: Task = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.TODO,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: null,
				comments: [],
				metadata: {},
				history: [],
			};

			worker.executeTaskMock.mockImplementation(async () => {
				worker.exposedSendTaskStarted();
				worker.exposedSendTaskProgress('Working...');
				worker.exposedSendTaskCompleted({ result: 'done' });
			});

			const assignMessage: AssignTaskMessage = createMessage(
				MessageType.ASSIGN_TASK,
				{ task }
			);

			globalWsEventHandlers['message'](Buffer.from(serializeMessage(assignMessage)));

			await vi.waitFor(() => {
				expect(worker.executeTaskMock).toHaveBeenCalled();
			});

			// Verify notifications were sent
			const sentMessages = mockWs.send.mock.calls.map((call: any[]) =>
				JSON.parse(call[0])
			);

			expect(sentMessages.some((m: any) => m.type === MessageType.TASK_STARTED)).toBe(true);
			expect(sentMessages.some((m: any) => m.type === MessageType.TASK_PROGRESS)).toBe(true);
			expect(sentMessages.some((m: any) => m.type === MessageType.TASK_COMPLETED)).toBe(true);
		});

		it('should handle multiple tasks sequentially', async () => {
			const connectPromise = worker.connect();
			getMockWs();
			globalWsEventHandlers['open']();
			await connectPromise;

			const createTask = (id: string): Task => ({
				id,
				description: `Task ${id}`,
				status: TaskStatus.TODO,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: null,
				comments: [],
				metadata: {},
				history: [],
			});

			let taskExecutionOrder: string[] = [];

			worker.executeTaskMock.mockImplementation(async (task: Task) => {
				taskExecutionOrder.push(task.id);
				worker.exposedSendTaskCompleted();
			});

			// Assign first task
			const task1 = createTask('task-1');
			const assignMessage1: AssignTaskMessage = createMessage(
				MessageType.ASSIGN_TASK,
				{ task: task1 }
			);
			globalWsEventHandlers['message'](Buffer.from(serializeMessage(assignMessage1)));

			await vi.waitFor(() => {
				expect(worker.getCurrentTask()).toBeNull();
			});

			// Assign second task
			const task2 = createTask('task-2');
			const assignMessage2: AssignTaskMessage = createMessage(
				MessageType.ASSIGN_TASK,
				{ task: task2 }
			);
			globalWsEventHandlers['message'](Buffer.from(serializeMessage(assignMessage2)));

			await vi.waitFor(() => {
				expect(taskExecutionOrder.length).toBe(2);
			});

			expect(taskExecutionOrder).toEqual(['task-1', 'task-2']);
		});
	});

	describe('Error Scenarios', () => {
		it('should handle reconnection after connection loss', async () => {
			const connectPromise = worker.connect();
			getMockWs();
			globalWsEventHandlers['open']();
			await connectPromise;

			// Simulate connection loss
			globalWsEventHandlers['close']();

			MockWebSocket.reset();

			// Fast-forward to trigger reconnect
			vi.advanceTimersByTime(5000);

			// Should create new WebSocket
			expect(MockWebSocket.latestInstance).not.toBeNull();
		});

		it('should handle reconnection failure', async () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const connectPromise = worker.connect();
			getMockWs();
			globalWsEventHandlers['open']();
			await connectPromise;

			// Simulate connection loss
			globalWsEventHandlers['close']();

			// Fast-forward to trigger reconnect
			vi.advanceTimersByTime(5000);

			// Get the new WebSocket instance created by reconnection
			await vi.runAllTimersAsync();

			// The reconnection creates a new WebSocket, trigger error on it
			if (globalWsEventHandlers['error']) {
				globalWsEventHandlers['error'](new Error('Reconnect failed'));
			}

			await vi.waitFor(() => {
				expect(consoleSpy).toHaveBeenCalledWith(
					expect.stringContaining('Reconnection failed'),
					expect.any(Error)
				);
			}, { timeout: 100 });

			consoleSpy.mockRestore();
		});

		it('should handle message parsing errors gracefully', async () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const connectPromise = worker.connect();
			getMockWs();
			globalWsEventHandlers['open']();
			await connectPromise;

			// Send malformed message
			globalWsEventHandlers['message'](Buffer.from('not valid json {'));

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Error parsing message'),
				expect.any(String)
			);

			consoleSpy.mockRestore();
		});
	});

	describe('Log Prefix', () => {
		it('should generate correct log prefix before welcome', () => {
			const prefix = (worker as any).logPrefix();
			expect(prefix).toContain('Worker ?');
		});

		it('should generate correct log prefix after welcome', async () => {
			const connectPromise = worker.connect();
			getMockWs();
			globalWsEventHandlers['open']();
			await connectPromise;

			const welcomeMessage: WorkerWelcomeMessage = createMessage(
				MessageType.WORKER_WELCOME,
				{ workerId: 'worker-123' }
			);
			globalWsEventHandlers['message'](Buffer.from(serializeMessage(welcomeMessage)));

			const prefix = (worker as any).logPrefix();
			expect(prefix).toContain('Worker worker-123');
		});
	});
});
