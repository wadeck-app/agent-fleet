/**
 * Test Mocks
 *
 * Reusable mock classes and objects for testing.
 */
import { EventEmitter } from 'events';
// import type { FlowRegistry } from 'flow-engine/registry/FlowRegistry';
// import type { FlowDefinition } from 'flow-engine/types';
// import type { IssueCollector, ValidationCode, ValidationIssue } from 'flow-engine/validation/ValidationTypes';
import { vi } from 'vitest';

/**
 * Mock IssueCollector for validation testing
 */
// export class MockIssueCollector implements IssueCollector {
// 	public issues: ValidationIssue[] = [];
//
// 	addIssue(issue: ValidationIssue): void {
// 		this.issues.push(issue);
// 	}
//
// 	reset(): void {
// 		this.issues = [];
// 	}
//
// 	getErrors(): ValidationIssue[] {
// 		return this.issues.filter(i => i.severity === 'error');
// 	}
//
// 	getWarnings(): ValidationIssue[] {
// 		return this.issues.filter(i => i.severity === 'warning');
// 	}
//
// 	hasCode(code: ValidationCode): boolean {
// 		return this.issues.some(i => i.code === code);
// 	}
//
// 	getIssueByCode(code: ValidationCode): ValidationIssue | undefined {
// 		return this.issues.find(i => i.code === code);
// 	}
//
// 	hasError(): boolean {
// 		return this.getErrors().length > 0;
// 	}
//
// 	hasWarning(): boolean {
// 		return this.getWarnings().length > 0;
// 	}
// }
//
// /**
//  * Mock FlowRegistry for testing
//  */
// export class MockFlowRegistry implements Pick<FlowRegistry, 'getFlow' | 'hasFlow'> {
// 	private flows: Map<string, FlowDefinition> = new Map();
//
// 	addFlow(flow: FlowDefinition): void {
// 		this.flows.set(flow.id, flow);
// 	}
//
// 	getFlow(id: string): FlowDefinition | undefined {
// 		return this.flows.get(id);
// 	}
//
// 	hasFlow(id: string): boolean {
// 		return this.flows.has(id);
// 	}
//
// 	clear(): void {
// 		this.flows.clear();
// 	}
//
// 	getAllFlows(): FlowDefinition[] {
// 		return Array.from(this.flows.values());
// 	}
// }

/**
 * Mock WebSocket for testing
 */
export class MockWebSocket {
	public readyState = 1; // OPEN
	public send = vi.fn();
	public close = vi.fn();
	public on = vi.fn().mockReturnThis();
	public addEventListener = vi.fn();
	public removeEventListener = vi.fn();

	constructor(public url?: string) {}

	// Simulate receiving a message
	simulateMessage(data: any): void {
		const event = { data: typeof data === 'string' ? data : JSON.stringify(data) };
		const handler = this.on.mock.calls.find((call: any) => call[0] === 'message')?.[1];
		if (handler) handler(event);
	}

	// Simulate connection
	simulateOpen(): void {
		const handler = this.on.mock.calls.find((call: any) => call[0] === 'open')?.[1];
		if (handler) handler();
	}

	// Simulate close
	simulateClose(): void {
		const handler = this.on.mock.calls.find((call: any) => call[0] === 'close')?.[1];
		if (handler) handler();
	}

	// Simulate error
	simulateError(error: Error): void {
		const handler = this.on.mock.calls.find((call: any) => call[0] === 'error')?.[1];
		if (handler) handler(error);
	}
}

/**
 * Mock Child Process for testing script execution
 */
export class MockChildProcess extends EventEmitter {
	public stdout = new EventEmitter();
	public stderr = new EventEmitter();
	public stdin = new EventEmitter();
	public kill = vi.fn();
	public killed = false;
	public pid?: number;

	constructor(pid?: number) {
		super();
		this.pid = pid;
	}

	// Simulate stdout data
	simulateStdout(data: string): void {
		this.stdout.emit('data', Buffer.from(data));
	}

	// Simulate stderr data
	simulateStderr(data: string): void {
		this.stderr.emit('data', Buffer.from(data));
	}

	// Simulate process close
	simulateClose(exitCode: number | null): void {
		this.emit('close', exitCode);
	}

	// Simulate process error
	simulateError(error: Error): void {
		this.emit('error', error);
	}

	// Simulate process exit
	simulateExit(exitCode: number | null): void {
		this.emit('exit', exitCode);
	}
}

/**
 * Create a mock logger that suppresses output
 */
export function createMockLogger() {
	return {
		log: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	};
}

/**
 * Create mock console spies with automatic restoration
 */
export function createConsoleMocks() {
	const mocks = {
		log: vi.spyOn(console, 'log').mockImplementation(() => {}),
		error: vi.spyOn(console, 'error').mockImplementation(() => {}),
		warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
		info: vi.spyOn(console, 'info').mockImplementation(() => {}),
		debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
	};

	return {
		...mocks,
		restore: () => {
			Object.values(mocks).forEach(mock => mock.mockRestore());
		},
	};
}

/**
 * Create a mock TaskManager
 */
export function createMockTaskManager() {
	return {
		getAllTasks: vi.fn().mockReturnValue([]),
		getTask: vi.fn(),
		addTask: vi.fn(),
		updateTaskStatus: vi.fn(),
		addComment: vi.fn(),
		assignTask: vi.fn(),
		unassignTask: vi.fn(),
		getNextTaskForWorker: vi.fn(),
	};
}

/**
 * Create a mock StateManager
 */
export function createMockStateManager() {
	return {
		emitWorkerConnected: vi.fn(),
		emitWorkerDisconnected: vi.fn(),
		emitWorkerTaskAssigned: vi.fn(),
		emitWorkerTaskReleased: vi.fn(),
		emitTaskUpdated: vi.fn(),
		emitTaskCreated: vi.fn(),
		emitTaskDeleted: vi.fn(),
		emitMetricsUpdated: vi.fn(),
	};
}

/**
 * Create a mock WorkspaceManager
 */
export function createMockWorkspaceManager() {
	return {
		allocate: vi.fn(),
		release: vi.fn(),
		cleanup: vi.fn(),
		cleanupAll: vi.fn(),
		getWorkspace: vi.fn(),
		listWorkspaces: vi.fn(),
	};
}

/**
 * Create a mock FlowExecutor
 */
export function createMockFlowExecutor() {
	return {
		execute: vi.fn(),
		setFlowRegistry: vi.fn(),
	};
}

/**
 * Create a mock ConnectionManager
 */
export function createMockConnectionManager() {
	return {
		getWorker: vi.fn(),
		getWorkers: vi.fn().mockReturnValue([]),
		addWorker: vi.fn(),
		removeWorker: vi.fn(),
		releaseWorker: vi.fn(),
		sendMessage: vi.fn(),
	};
}
