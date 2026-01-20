import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLogger, logger } from './logger';

describe('Logger', () => {
	let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
	let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
	let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
		consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
		consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleInfoSpy.mockRestore();
		consoleDebugSpy.mockRestore();
		consoleWarnSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	describe('createLogger with name', () => {
		it('should include service name in info logs', () => {
			const log = createLogger('TestService');
			log.info('Test message');

			expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
			const logOutput = consoleInfoSpy.mock.calls[0][0];

			// Should match: [HH:MM:SS.mmm] [ INFO] [TestService] Test message
			expect(logOutput).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\] \[\s*INFO\] \[TestService\] Test message/);
		});

		it('should include service name in debug logs', () => {
			const log = createLogger('TestService');
			log.debug('Debug message');

			expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
			const logOutput = consoleDebugSpy.mock.calls[0][0];

			expect(logOutput).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\] \[\s*DEBUG\] \[TestService\] Debug message/);
		});

		it('should include service name in warn logs', () => {
			const log = createLogger('TestService');
			log.warn('Warning message');

			expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
			const logOutput = consoleWarnSpy.mock.calls[0][0];

			expect(logOutput).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\] \[\s*WARN\] \[TestService\] Warning message/);
		});

		it('should include service name in error logs', () => {
			const log = createLogger('TestService');
			log.error('Error message');

			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
			const logOutput = consoleErrorSpy.mock.calls[0][0];

			expect(logOutput).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\] \[\s*ERROR\] \[TestService\] Error message/);
		});

		it('should handle different service names', () => {
			const taskLog = createLogger('TasksService');
			const workerLog = createLogger('FlowWorker 2');

			taskLog.info('Task message');
			workerLog.info('Worker message');

			expect(consoleInfoSpy).toHaveBeenCalledTimes(2);
			const log1 = consoleInfoSpy.mock.calls[0][0];
			const log2 = consoleInfoSpy.mock.calls[1][0];

			expect(log1).toContain('[TasksService]');
			expect(log2).toContain('[FlowWorker 2]');
		});

		it('should pass additional arguments to console methods', () => {
			const log = createLogger('TestService');
			const extraData = { foo: 'bar' };

			log.info('Message with data', extraData);

			expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
			expect(consoleInfoSpy.mock.calls[0][1]).toEqual(extraData);
		});
	});

	describe('logger singleton without name (backward compatibility)', () => {
		it('should not include service name in logs', () => {
			logger.info('Message without name');

			expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
			const logOutput = consoleInfoSpy.mock.calls[0][0];

			// Should match: [HH:MM:SS.mmm] [ INFO] Message without name
			// Should NOT contain brackets after INFO
			expect(logOutput).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\] \[\s*INFO\] Message without name/);
			expect(logOutput).not.toContain('][');
		});

		it('should work with all log levels without name', () => {
			logger.debug('Debug message');
			logger.info('Info message');
			logger.warn('Warn message');
			logger.error('Error message');

			expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
			expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
			expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

			// None should have service name brackets
			const debugLog = consoleDebugSpy.mock.calls[0][0];
			const infoLog = consoleInfoSpy.mock.calls[0][0];
			const warnLog = consoleWarnSpy.mock.calls[0][0];
			const errorLog = consoleErrorSpy.mock.calls[0][0];

			expect(debugLog).not.toContain('][');
			expect(infoLog).not.toContain('][');
			expect(warnLog).not.toContain('][');
			expect(errorLog).not.toContain('][');
		});
	});

	describe('log format consistency', () => {
		it('should maintain consistent timestamp format', () => {
			const log = createLogger('TestService');
			log.info('Message 1');
			log.info('Message 2');

			expect(consoleInfoSpy).toHaveBeenCalledTimes(2);
			const log1 = consoleInfoSpy.mock.calls[0][0];
			const log2 = consoleInfoSpy.mock.calls[1][0];

			// Both should have valid timestamp format
			expect(log1).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
			expect(log2).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
		});

		it('should pad log level to 5 characters', () => {
			const log = createLogger('TestService');
			log.info('Info');
			log.warn('Warn');
			log.error('Error');
			log.debug('Debug');

			// Extract log levels from output
			const infoLog = consoleInfoSpy.mock.calls[0][0];
			const warnLog = consoleWarnSpy.mock.calls[0][0];
			const errorLog = consoleErrorSpy.mock.calls[0][0];
			const debugLog = consoleDebugSpy.mock.calls[0][0];

			// All should have padded level names
			expect(infoLog).toMatch(/\[\s*INFO\]/);
			expect(warnLog).toMatch(/\[\s*WARN\]/);
			expect(errorLog).toMatch(/\[\s*ERROR\]/);
			expect(debugLog).toMatch(/\[\s*DEBUG\]/);
		});
	});
});
