/**
 * UI Protocol Types Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	UIConnectMessage,
	UIErrorMessage,
	UIMessageType,
	UISnapshotMessage,
	UIStartFlowMessage,
	UIStateUpdateMessage,
	createUIMessage,
	isUICommand,
	isUIResponse,
	parseUIMessage,
} from './types.js';

describe('UI Protocol Types', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('createUIMessage', () => {
		it('should create a UI message with automatic timestamp', () => {
			const message = createUIMessage<UIConnectMessage>(UIMessageType.CONNECT, {
				authToken: 'test-token',
				clientInfo: { version: '1.0.0' },
			});

			expect(message.type).toBe(UIMessageType.CONNECT);
			expect(message.timestamp).toBe('2024-01-01T00:00:00.000Z');
			expect(message.authToken).toBe('test-token');
			expect(message.clientInfo).toEqual({ version: '1.0.0' });
		});

		it('should create a PING message', () => {
			const message = createUIMessage(UIMessageType.PING, {});

			expect(message.type).toBe(UIMessageType.PING);
			expect(message.timestamp).toBeDefined();
		});

		it('should create a START_FLOW message with all fields', () => {
			const message = createUIMessage<UIStartFlowMessage>(UIMessageType.START_FLOW, {
				requestId: 'req-123',
				flowId: 'my-flow',
				inputs: { foo: 'bar' },
				workerId: 'worker-1',
				priority: 'high',
			});

			expect(message.type).toBe(UIMessageType.START_FLOW);
			expect(message.requestId).toBe('req-123');
			expect(message.flowId).toBe('my-flow');
			expect(message.inputs).toEqual({ foo: 'bar' });
			expect(message.workerId).toBe('worker-1');
			expect(message.priority).toBe('high');
		});

		it('should create a SNAPSHOT message', () => {
			const snapshot = {
				timestamp: '2024-01-01T00:00:00.000Z',
				orchestrator: { status: 'ready' as const, uptime: 1000, version: '1.0.0' },
				tasks: { all: [], total: 0, byStatus: {} },
				workers: { all: [], connected: 0, idle: 0, busy: 0 },
				metrics: {
					taskThroughput: { total: 0, completed: 0, failed: 0, inProgress: 0 },
					workerUtilization: { idle: 0, busy: 0, total: 0 },
					averageTaskDuration: 0,
					timestamp: '2024-01-01T00:00:00.000Z',
				},
			};

			const message = createUIMessage<UISnapshotMessage>(UIMessageType.SNAPSHOT, {
				requestId: 'req-123',
				snapshot,
			});

			expect(message.type).toBe(UIMessageType.SNAPSHOT);
			expect(message.snapshot).toEqual(snapshot);
		});

		it('should include optional requestId', () => {
			const message = createUIMessage(UIMessageType.REQUEST_SNAPSHOT, { requestId: 'req-456' });

			expect(message.requestId).toBe('req-456');
		});
	});

	describe('parseUIMessage', () => {
		it('should parse a valid UI message', () => {
			const json = JSON.stringify({
				type: UIMessageType.PING,
				timestamp: '2024-01-01T00:00:00.000Z',
			});

			const parsed = parseUIMessage(json);

			expect(parsed.type).toBe(UIMessageType.PING);
			expect(parsed.timestamp).toBe('2024-01-01T00:00:00.000Z');
		});

		it('should parse a CONNECT message', () => {
			const json = JSON.stringify({
				type: UIMessageType.CONNECT,
				timestamp: '2024-01-01T00:00:00.000Z',
				authToken: 'token-123',
				clientInfo: { version: '1.0.0' },
			});

			const parsed = parseUIMessage(json) as UIConnectMessage;

			expect(parsed.type).toBe(UIMessageType.CONNECT);
			expect(parsed.authToken).toBe('token-123');
			expect(parsed.clientInfo.version).toBe('1.0.0');
		});

		it('should parse a START_FLOW message', () => {
			const json = JSON.stringify({
				type: UIMessageType.START_FLOW,
				timestamp: '2024-01-01T00:00:00.000Z',
				requestId: 'req-123',
				flowId: 'my-flow',
				inputs: { key: 'value' },
			});

			const parsed = parseUIMessage(json) as UIStartFlowMessage;

			expect(parsed.type).toBe(UIMessageType.START_FLOW);
			expect(parsed.flowId).toBe('my-flow');
			expect(parsed.inputs).toEqual({ key: 'value' });
		});

		it('should throw error for invalid JSON', () => {
			expect(() => parseUIMessage('invalid json')).toThrow();
		});

		it('should throw error for missing type', () => {
			const json = JSON.stringify({ timestamp: '2024-01-01T00:00:00.000Z' });

			expect(() => parseUIMessage(json)).toThrow('Invalid UI message type');
		});

		it('should throw error for invalid type', () => {
			const json = JSON.stringify({
				type: 'invalid_type',
				timestamp: '2024-01-01T00:00:00.000Z',
			});

			expect(() => parseUIMessage(json)).toThrow('Invalid UI message type');
		});

		it('should parse STATE_UPDATE message', () => {
			const json = JSON.stringify({
				type: UIMessageType.STATE_UPDATE,
				timestamp: '2024-01-01T00:00:00.000Z',
				event: 'task_created',
				data: { task: { id: 'task-1' } },
			});

			const parsed = parseUIMessage(json) as UIStateUpdateMessage;

			expect(parsed.type).toBe(UIMessageType.STATE_UPDATE);
			expect(parsed.event).toBe('task_created');
			expect(parsed.data).toEqual({ task: { id: 'task-1' } });
		});

		it('should parse ERROR message', () => {
			const json = JSON.stringify({
				type: UIMessageType.ERROR,
				timestamp: '2024-01-01T00:00:00.000Z',
				error: 'Connection failed',
				details: { code: 500 },
			});

			const parsed = parseUIMessage(json) as UIErrorMessage;

			expect(parsed.type).toBe(UIMessageType.ERROR);
			expect(parsed.error).toBe('Connection failed');
			expect(parsed.details).toEqual({ code: 500 });
		});
	});

	describe('isUICommand', () => {
		it('should return true for CONNECT', () => {
			const message = createUIMessage(UIMessageType.CONNECT, {
				authToken: 'token',
				clientInfo: {},
			});

			expect(isUICommand(message)).toBe(true);
		});

		it('should return true for START_FLOW', () => {
			const message = createUIMessage(UIMessageType.START_FLOW, {
				flowId: 'flow-1',
			});

			expect(isUICommand(message)).toBe(true);
		});

		it('should return true for STOP_FLOW', () => {
			const message = createUIMessage(UIMessageType.STOP_FLOW, {
				taskId: 'task-1',
			});

			expect(isUICommand(message)).toBe(true);
		});

		it('should return true for REQUEST_SNAPSHOT', () => {
			const message = createUIMessage(UIMessageType.REQUEST_SNAPSHOT, {});

			expect(isUICommand(message)).toBe(true);
		});

		it('should return true for SUBSCRIBE', () => {
			const message = createUIMessage(UIMessageType.SUBSCRIBE, {
				events: ['task_created'],
			});

			expect(isUICommand(message)).toBe(true);
		});

		it('should return true for PING', () => {
			const message = createUIMessage(UIMessageType.PING, {});

			expect(isUICommand(message)).toBe(true);
		});

		it('should return false for CONNECTED', () => {
			const message = createUIMessage(UIMessageType.CONNECTED, {
				orchestratorId: 'orch-1',
				version: '1.0.0',
				capabilities: [],
			});

			expect(isUICommand(message)).toBe(false);
		});

		it('should return false for SNAPSHOT', () => {
			const message = createUIMessage(UIMessageType.SNAPSHOT, {
				snapshot: {} as any,
			});

			expect(isUICommand(message)).toBe(false);
		});

		it('should return false for STATE_UPDATE', () => {
			const message = createUIMessage(UIMessageType.STATE_UPDATE, {
				event: 'test',
				data: {},
			});

			expect(isUICommand(message)).toBe(false);
		});

		it('should return false for ERROR', () => {
			const message = createUIMessage(UIMessageType.ERROR, {
				error: 'Test error',
			});

			expect(isUICommand(message)).toBe(false);
		});

		it('should return false for PONG', () => {
			const message = createUIMessage(UIMessageType.PONG, {});

			expect(isUICommand(message)).toBe(false);
		});
	});

	describe('isUIResponse', () => {
		it('should return true for CONNECTED', () => {
			const message = createUIMessage(UIMessageType.CONNECTED, {
				orchestratorId: 'orch-1',
				version: '1.0.0',
				capabilities: [],
			});

			expect(isUIResponse(message)).toBe(true);
		});

		it('should return true for SNAPSHOT', () => {
			const message = createUIMessage(UIMessageType.SNAPSHOT, {
				snapshot: {} as any,
			});

			expect(isUIResponse(message)).toBe(true);
		});

		it('should return true for STATE_UPDATE', () => {
			const message = createUIMessage(UIMessageType.STATE_UPDATE, {
				event: 'test',
				data: {},
			});

			expect(isUIResponse(message)).toBe(true);
		});

		it('should return true for COMMAND_RESULT', () => {
			const message = createUIMessage(UIMessageType.COMMAND_RESULT, {
				requestId: 'req-123',
				success: true,
			});

			expect(isUIResponse(message)).toBe(true);
		});

		it('should return true for ERROR', () => {
			const message = createUIMessage(UIMessageType.ERROR, {
				error: 'Test error',
			});

			expect(isUIResponse(message)).toBe(true);
		});

		it('should return true for PONG', () => {
			const message = createUIMessage(UIMessageType.PONG, {});

			expect(isUIResponse(message)).toBe(true);
		});

		it('should return false for CONNECT', () => {
			const message = createUIMessage(UIMessageType.CONNECT, {
				authToken: 'token',
				clientInfo: {},
			});

			expect(isUIResponse(message)).toBe(false);
		});

		it('should return false for START_FLOW', () => {
			const message = createUIMessage(UIMessageType.START_FLOW, {
				flowId: 'flow-1',
			});

			expect(isUIResponse(message)).toBe(false);
		});

		it('should return false for PING', () => {
			const message = createUIMessage(UIMessageType.PING, {});

			expect(isUIResponse(message)).toBe(false);
		});
	});

	describe('message type completeness', () => {
		it('should classify all UIMessageType values', () => {
			// Get all message types
			const allTypes = Object.values(UIMessageType);

			// Test each type
			allTypes.forEach(type => {
				const message = { type, timestamp: '2024-01-01T00:00:00.000Z' } as any;

				const isCommand = isUICommand(message);
				const isResponse = isUIResponse(message);

				// Each message should be either command or response (not both, not neither)
				expect(isCommand !== isResponse).toBe(true);
			});
		});
	});

	describe('message serialization round-trip', () => {
		it('should serialize and deserialize CONNECT message', () => {
			const original = createUIMessage<UIConnectMessage>(UIMessageType.CONNECT, {
				authToken: 'token-123',
				clientInfo: { version: '1.0.0', userAgent: 'Test' },
			});

			const json = JSON.stringify(original);
			const parsed = parseUIMessage(json) as UIConnectMessage;

			expect(parsed).toEqual(original);
		});

		it('should serialize and deserialize START_FLOW message', () => {
			const original = createUIMessage<UIStartFlowMessage>(UIMessageType.START_FLOW, {
				requestId: 'req-123',
				flowId: 'my-flow',
				inputs: { key: 'value' },
				priority: 'high',
			});

			const json = JSON.stringify(original);
			const parsed = parseUIMessage(json) as UIStartFlowMessage;

			expect(parsed).toEqual(original);
		});

		it('should handle nested objects in message', () => {
			const original = createUIMessage<UIStateUpdateMessage>(UIMessageType.STATE_UPDATE, {
				event: 'task_created',
				data: {
					task: {
						id: 'task-1',
						metadata: { nested: { deep: 'value' } },
					},
				},
			});

			const json = JSON.stringify(original);
			const parsed = parseUIMessage(json) as UIStateUpdateMessage;

			expect(parsed).toEqual(original);
		});
	});
});
