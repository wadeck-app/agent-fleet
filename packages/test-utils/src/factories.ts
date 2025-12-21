/**
 * Test Data Factories
 *
 * Factory functions to create test data objects with sensible defaults.
 * Use the overrides parameter to customize specific properties.
 */
import type {
	FlowDefinition,
	FlowExecutionResult,
	FlowStep,
	FlowTrace,
	GitStrategy,
	ModelFlowStep,
	ReusePolicy,
	ScriptFlowStep,
	StepTrace,
	SubFlowStep,
	Workspace,
	WorkspaceMode,
} from 'flow-engine/types.js';
import type { Task, TaskStatus, WorkerInfo, WorkerType } from 'shared-common/types.js';

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
		type: 'dev' as WorkerType,
		connectedAt: new Date().toISOString(),
		taskId: null,
		...overrides,
	};
}

/**
 * Create a mock StepTrace for testing
 */
export function createMockStepTrace(overrides?: Partial<StepTrace>): StepTrace {
	return {
		stepId: 'step-1',
		stepName: 'Test Step',
		stepType: 'model',
		startTime: Date.now(),
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

/**
 * Create a mock FlowExecutionResult for testing
 */
export function createMockFlowResult(overrides?: Partial<FlowExecutionResult>): FlowExecutionResult {
	return {
		success: true,
		trace: createMockFlowTrace(),
		outputs: {},
		...overrides,
	};
}

/**
 * Create a mock ModelFlowStep for testing
 */
export function createMockModelStep(overrides?: Partial<ModelFlowStep>): ModelFlowStep {
	return {
		id: 'model-step',
		name: 'Model Step',
		type: 'model',
		model: 'sonnet',
		prompt: 'Test prompt',
		...overrides,
	};
}

/**
 * Create a mock ScriptFlowStep for testing
 */
export function createMockScriptStep(overrides?: Partial<ScriptFlowStep>): ScriptFlowStep {
	return {
		id: 'script-step',
		name: 'Script Step',
		type: 'script',
		script: 'echo "test"',
		...overrides,
	};
}

/**
 * Create a mock SubFlowStep for testing
 */
export function createMockSubFlowStep(overrides?: Partial<SubFlowStep>): SubFlowStep {
	return {
		id: 'subflow-step',
		name: 'SubFlow Step',
		type: 'subflow',
		flowId: 'target-flow',
		inputs: {},
		...overrides,
	};
}

/**
 * Create multiple mock tasks with sequential IDs
 */
export function createMockTasks(count: number, overrides?: Partial<Task>): Task[] {
	return Array.from({ length: count }, (_, i) =>
		createMockTask({
			id: `task-${i + 1}`,
			...overrides,
		})
	);
}

/**
 * Create multiple mock workers with sequential IDs
 */
export function createMockWorkers(count: number, overrides?: Partial<WorkerInfo>): WorkerInfo[] {
	return Array.from({ length: count }, (_, i) =>
		createMockWorker({
			id: `worker-${i + 1}`,
			...overrides,
		})
	);
}

/**
 * Create a completed StepTrace for testing
 *
 * @example
 * ```typescript
 * const trace = mockStepExecution({
 *   stepId: 'analyze',
 *   outputs: { result: 'success' }
 * });
 * ```
 */
export function mockStepExecution(overrides?: Partial<StepTrace>): StepTrace {
	const startTime = Date.now();
	const endTime = startTime + 1000;

	return {
		stepId: 'step-1',
		stepName: 'Test Step',
		stepType: 'model',
		startTime,
		endTime,
		durationMs: 1000,
		outputs: {},
		...overrides,
	};
}

/**
 * Create a FlowStep of any type
 *
 * @example
 * ```typescript
 * const step = createTestStep('model', { prompt: 'Custom prompt' });
 * const scriptStep = createTestStep('script', { script: 'npm test' });
 * ```
 */
export function createTestStep(type: 'model' | 'script' | 'subflow', overrides?: Partial<FlowStep>): FlowStep {
	switch (type) {
		case 'model':
			return createMockModelStep(overrides as Partial<ModelFlowStep>);
		case 'script':
			return createMockScriptStep(overrides as Partial<ScriptFlowStep>);
		case 'subflow':
			return createMockSubFlowStep(overrides as Partial<SubFlowStep>);
	}
}
