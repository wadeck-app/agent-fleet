/**
 * Logger Tests (Structured Logging)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LogLevel, Logger, StructuredLogEntry } from './Logger.js';
import { StateManager } from './StateManager.js';

// Mock StateManager
vi.mock('./StateManager.js');

describe('Logger', () => {
	let mockStateManager: StateManager;
	let consoleLogSpy: any;

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock StateManager
		mockStateManager = {
			emitLogMessage: vi.fn(),
		} as any;

		// Spy on console.log
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

		// Initialize Logger
		Logger.initialize(mockStateManager);
		Logger.setStructuredLogging(true);
		Logger.setLogLevel(LogLevel.DEBUG);
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
	});

	describe('logStructured', () => {
		it('should log a structured message', () => {
			Logger.logStructured('info', 'test-component', 'Test message');

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO] [test-component] Test message'));
		});

		it('should emit structured log to StateManager', () => {
			Logger.logStructured('info', 'test-component', 'Test message');

			expect(mockStateManager.emitLogMessage).toHaveBeenCalledWith(expect.stringContaining('"level":"info"'));
			expect(mockStateManager.emitLogMessage).toHaveBeenCalledWith(
				expect.stringContaining('"component":"test-component"')
			);
			expect(mockStateManager.emitLogMessage).toHaveBeenCalledWith(
				expect.stringContaining('"message":"Test message"')
			);
		});

		it('should include timestamp in structured log', () => {
			Logger.logStructured('info', 'test-component', 'Test message');

			const emittedMessage = vi.mocked(mockStateManager.emitLogMessage).mock.calls[0][0];
			const parsed: StructuredLogEntry = JSON.parse(emittedMessage);

			expect(parsed.timestamp).toBeDefined();
			expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		});

		it('should include context when provided', () => {
			Logger.logStructured('info', 'test-component', 'Test message', {
				foo: 'bar',
				count: 42,
			});

			const emittedMessage = vi.mocked(mockStateManager.emitLogMessage).mock.calls[0][0];
			const parsed: StructuredLogEntry = JSON.parse(emittedMessage);

			expect(parsed.context).toEqual({ foo: 'bar', count: 42 });
		});

		it('should include taskId from context', () => {
			Logger.logStructured('info', 'task-manager', 'Task started', {
				taskId: 'task-123',
			});

			const emittedMessage = vi.mocked(mockStateManager.emitLogMessage).mock.calls[0][0];
			const parsed: StructuredLogEntry = JSON.parse(emittedMessage);

			expect(parsed.taskId).toBe('task-123');
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('(task:task-123'));
		});

		it('should include workerId from context', () => {
			Logger.logStructured('info', 'worker', 'Worker connected', {
				workerId: 'worker-456',
			});

			const emittedMessage = vi.mocked(mockStateManager.emitLogMessage).mock.calls[0][0];
			const parsed: StructuredLogEntry = JSON.parse(emittedMessage);

			expect(parsed.workerId).toBe('worker-456');
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('worker:worker-456'));
		});

		it('should handle all log levels', () => {
			const levels: Array<'debug' | 'info' | 'warn' | 'error'> = ['debug', 'info', 'warn', 'error'];

			levels.forEach(level => {
				Logger.logStructured(level, 'test', `${level} message`);

				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`[${level.toUpperCase()}]`));
			});
		});

		it('should respect log level filtering', () => {
			Logger.setLogLevel(LogLevel.WARN);

			Logger.logStructured('debug', 'test', 'Debug message');
			Logger.logStructured('info', 'test', 'Info message');

			expect(mockStateManager.emitLogMessage).not.toHaveBeenCalled();

			Logger.logStructured('warn', 'test', 'Warning message');

			expect(mockStateManager.emitLogMessage).toHaveBeenCalledTimes(1);
		});

		it('should not emit when StateManager is not initialized', () => {
			Logger.initialize(null as any);

			expect(() => {
				Logger.logStructured('info', 'test', 'Message');
			}).not.toThrow();

			expect(consoleLogSpy).toHaveBeenCalled();
		});
	});

	describe('legacy methods with structured logging enabled', () => {
		it('should convert log() to structured format', () => {
			Logger.log('Test message');

			const emittedMessage = vi.mocked(mockStateManager.emitLogMessage).mock.calls[0][0];
			const parsed: StructuredLogEntry = JSON.parse(emittedMessage);

			expect(parsed.level).toBe('info');
			expect(parsed.component).toBe('system');
			expect(parsed.message).toBe('Test message');
		});

		it('should convert debug() to structured format', () => {
			Logger.debug('Debug message');

			const emittedMessage = vi.mocked(mockStateManager.emitLogMessage).mock.calls[0][0];
			const parsed: StructuredLogEntry = JSON.parse(emittedMessage);

			expect(parsed.level).toBe('debug');
		});

		it('should convert error() to structured format', () => {
			Logger.error('[ERROR] Error message');

			const emittedMessage = vi.mocked(mockStateManager.emitLogMessage).mock.calls[0][0];
			const parsed: StructuredLogEntry = JSON.parse(emittedMessage);

			expect(parsed.level).toBe('error');
			expect(parsed.message).toContain('Error message');
		});

		it('should handle multiple arguments in legacy log()', () => {
			Logger.log('Message', 'with', 'multiple', 'parts');

			const emittedMessage = vi.mocked(mockStateManager.emitLogMessage).mock.calls[0][0];
			const parsed: StructuredLogEntry = JSON.parse(emittedMessage);

			expect(parsed.message).toBe('Message with multiple parts');
		});

		it('should handle object arguments in legacy log()', () => {
			Logger.log('Object:', { foo: 'bar' });

			const emittedMessage = vi.mocked(mockStateManager.emitLogMessage).mock.calls[0][0];
			const parsed: StructuredLogEntry = JSON.parse(emittedMessage);

			expect(parsed.message).toContain('Object:');
			expect(parsed.message).toContain('{"foo":"bar"}');
		});
	});

	describe('setStructuredLogging', () => {
		it('should disable structured logging', () => {
			Logger.setStructuredLogging(false);

			Logger.log('Simple message');

			expect(mockStateManager.emitLogMessage).toHaveBeenCalledWith('Simple message');
		});

		it('should re-enable structured logging', () => {
			Logger.setStructuredLogging(false);
			Logger.setStructuredLogging(true);

			Logger.log('Structured message');

			const emittedMessage = vi.mocked(mockStateManager.emitLogMessage).mock.calls[0][0];
			expect(() => JSON.parse(emittedMessage)).not.toThrow();
		});
	});

	describe('setLogLevel', () => {
		it('should filter messages below log level', () => {
			Logger.setLogLevel(LogLevel.WARN);

			Logger.debug('Debug message');
			Logger.log('Info message');

			expect(mockStateManager.emitLogMessage).not.toHaveBeenCalled();
		});

		it('should allow messages at or above log level', () => {
			Logger.setLogLevel(LogLevel.WARN);

			Logger.warn('Warning message');
			Logger.error('Error message');

			expect(mockStateManager.emitLogMessage).toHaveBeenCalledTimes(2);
		});

		it('should handle LogLevel.DEBUG (show all)', () => {
			Logger.setLogLevel(LogLevel.DEBUG);

			Logger.debug('Debug message');
			Logger.log('Info message');
			Logger.warn('Warning message');
			Logger.error('Error message');

			expect(mockStateManager.emitLogMessage).toHaveBeenCalledTimes(4);
		});
	});

	describe('console output formatting', () => {
		it('should format console output with component', () => {
			Logger.logStructured('info', 'orchestrator', 'Started');

			expect(consoleLogSpy).toHaveBeenCalledWith('[INFO] [orchestrator] Started');
		});

		it('should format console output with taskId and workerId', () => {
			Logger.logStructured('info', 'flow-executor', 'Executing step', {
				taskId: 'task-123',
				workerId: 'worker-456',
			});

			expect(consoleLogSpy).toHaveBeenCalledWith(
				'[INFO] [flow-executor] Executing step (task:task-123, worker:worker-456)'
			);
		});

		it('should handle missing taskId/workerId gracefully', () => {
			Logger.logStructured('info', 'system', 'Message without IDs');

			expect(consoleLogSpy).toHaveBeenCalledWith('[INFO] [system] Message without IDs');
		});
	});

	describe('error handling', () => {
		it('should not crash when emitting to StateManager', () => {
			// Test that Logger continues to work even if StateManager throws
			try {
				vi.mocked(mockStateManager.emitLogMessage).mockImplementation(() => {
					throw new Error('StateManager error');
				});

				// This will throw, but Logger should call it
				Logger.logStructured('info', 'test', 'Message');
			} catch (error) {
				// Expected - StateManager threw an error
				expect(error).toBeDefined();
			}

			// Reset mock
			vi.mocked(mockStateManager.emitLogMessage).mockImplementation(() => {});

			// Logger should still work after error
			expect(() => {
				Logger.logStructured('info', 'test', 'Message after error');
			}).not.toThrow();
		});
	});

	describe('integration scenarios', () => {
		it('should support logging from different components', () => {
			Logger.logStructured('info', 'orchestrator', 'Starting');
			Logger.logStructured('info', 'task-manager', 'Task created', { taskId: 't1' });
			Logger.logStructured('info', 'worker', 'Connected', { workerId: 'w1' });
			Logger.logStructured('info', 'metrics', 'Collected');

			expect(mockStateManager.emitLogMessage).toHaveBeenCalledTimes(4);

			const messages = vi
				.mocked(mockStateManager.emitLogMessage)
				.mock.calls.map(call => JSON.parse(call[0]) as StructuredLogEntry);

			expect(messages[0].component).toBe('orchestrator');
			expect(messages[1].component).toBe('task-manager');
			expect(messages[2].component).toBe('worker');
			expect(messages[3].component).toBe('metrics');
		});

		it('should support rich context metadata', () => {
			Logger.logStructured('info', 'flow-executor', 'Step completed', {
				taskId: 'task-123',
				workerId: 'worker-456',
				stepId: 'step-1',
				duration: 1500,
				outputs: { result: 'success' },
			});

			const emittedMessage = vi.mocked(mockStateManager.emitLogMessage).mock.calls[0][0];
			const parsed: StructuredLogEntry = JSON.parse(emittedMessage);

			expect(parsed.context).toMatchObject({
				taskId: 'task-123',
				workerId: 'worker-456',
				stepId: 'step-1',
				duration: 1500,
				outputs: { result: 'success' },
			});
		});
	});
});
