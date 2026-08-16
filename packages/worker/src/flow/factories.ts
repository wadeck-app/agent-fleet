/**
 * Test Data Factories
 *
 * Factory functions to create test data objects with sensible defaults.
 * Use the overrides parameter to customize specific properties.
 */
import type {
	FlowDefinition,
	FlowTrace,
	GitStrategy,
	ModelFlowStep,
	ReusePolicy,
	Workspace,
	WorkspaceMode,
} from 'flow-engine/types';
import type { TaskStatus } from 'shared-orch-worker/domain-types';
import { type Task, type WorkerInfo } from 'shared-orch-worker/domain-types';

/**
 * Create a mock Task for testing
 */
export function createMockTask(overrides?: Partial<Task>): Task {
	const now = new Date().toISOString();
	return {
		id: 'test-task-1',
		description: 'Test task description',
		status: 'pending' as TaskStatus,
		priority: 'medium',
		createdAt: now,
		updatedAt: now,
		assignedTo: null,
		comments: [],
		metadata: {},
		history: [],
		...overrides,
	};
}

/**
 * Create a mock FlowDefinition for testing
 */
export function createMockFlow(overrides?: Partial<FlowDefinition>): FlowDefinition {
	return {
		id: 'test-flow',
		version: '1.0.0',
		name: 'Test Flow',
		description: 'Test flow description',
		workspace: {
			mode: 'isolated' as WorkspaceMode,
			gitStrategy: 'feature-branch' as GitStrategy,
			reusePolicy: 'if-available' as ReusePolicy,
		},
		inputs: {},
		steps: [
			{
				id: 'step1',
				name: 'Test Step',
				type: 'model',
				model: 'sonnet',
				prompt: 'Test prompt',
			} as ModelFlowStep,
		],
		...overrides,
	};
}

/**
 * Create a mock Workspace for testing
 */
export function createMockWorkspace(overrides?: Partial<Workspace>): Workspace {
	const now = new Date().toISOString();
	return {
		id: 'workspace-1',
		path: '/tmp/workspace-1',
		metaDir: '/tmp/workspace-1.meta',
		mode: 'isolated' as WorkspaceMode,
		concurrency: {
			key: 'test',
			activeTasks: new Set(),
			locked: false,
		},
		createdAt: now,
		lastUsedAt: now,
		usageCount: 1,
		...overrides,
	};
}

/**
 * Create a mock WorkerInfo for testing
 */
export function createMockWorker(overrides?: Partial<WorkerInfo>): WorkerInfo {
	return {
		id: 'worker-1',
		// type: 'dev' as WorkerType,
		connectedAt: new Date().toISOString(),
		taskId: null,
		taskStartedAt: null,
		...overrides,
	};
}

/**
 * Create a mock FlowTrace for testing
 */
export function createMockFlowTrace(overrides?: Partial<FlowTrace>): FlowTrace {
	return {
		id: 'trace-1',
		taskId: 'task-1',
		flowId: 'test-flow',
		workspaceId: 'workspace-1',
		startTime: Date.now(),
		status: 'completed',
		steps: [],
		...overrides,
	};
}
