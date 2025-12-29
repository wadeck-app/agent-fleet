import { EventEmitter } from 'events';

import type { Task, WorkerInfo } from './domain-types';

export enum StateEvent {
	// Task events
	TASK_CREATED = 'task_created',
	TASK_UPDATED = 'task_updated',
	TASK_DELETED = 'task_deleted',

	// Worker events
	WORKER_CONNECTED = 'worker_connected',
	WORKER_DISCONNECTED = 'worker_disconnected',
	WORKER_TASK_ASSIGNED = 'worker_task_assigned',
	WORKER_TASK_RELEASED = 'worker_task_released',

	// Orchestrator lifecycle events
	ORCHESTRATOR_STARTED = 'orchestrator_started',
	ORCHESTRATOR_READY = 'orchestrator_ready',
	ORCHESTRATOR_STOPPING = 'orchestrator_stopping',

	// Flow execution events (more granular than task events)
	FLOW_EXECUTION_STARTED = 'flow_execution_started',
	FLOW_EXECUTION_PROGRESS = 'flow_execution_progress',
	FLOW_EXECUTION_COMPLETED = 'flow_execution_completed',
	FLOW_EXECUTION_FAILED = 'flow_execution_failed',

	// Metrics and monitoring
	METRICS_UPDATED = 'metrics_updated',
	SYSTEM_STATUS_CHANGED = 'system_status_changed',

	// Logs
	LOG_MESSAGE = 'log_message',
}

export interface TaskEventData {
	task: Task;
}

export interface WorkerEventData {
	worker: WorkerInfo;
	taskId?: string;
}

export interface OrchestratorStatusData {
	status: 'starting' | 'ready' | 'stopping' | 'stopped';
	uptime: number;
	workersConnected: number;
	tasksInProgress: number;
	timestamp: string;
}

export interface MetricsData {
	taskThroughput: {
		total: number;
		completed: number;
		failed: number;
		inProgress: number;
	};
	workerUtilization: {
		idle: number;
		busy: number;
		total: number;
	};
	averageTaskDuration: number; // milliseconds
	timestamp: string;
}

export interface FlowExecutionEventData {
	taskId: string;
	flowId?: string;
	stepId?: string;
	progress?: any;
	result?: any;
	error?: string;
	timestamp: string;
}

/**
 * Centralized state manager using EventEmitter
 * Allows different parts of the system to emit and listen to state changes
 */
export class StateManager extends EventEmitter {
	constructor() {
		super();
	}

	// Task events
	emitTaskCreated(task: Task): void {
		this.emit(StateEvent.TASK_CREATED, { task });
	}

	emitTaskUpdated(task: Task): void {
		this.emit(StateEvent.TASK_UPDATED, { task });
	}

	emitTaskDeleted(taskId: string): void {
		this.emit(StateEvent.TASK_DELETED, { taskId });
	}

	// Worker events
	emitWorkerConnected(worker: WorkerInfo): void {
		this.emit(StateEvent.WORKER_CONNECTED, { worker });
	}

	emitWorkerDisconnected(workerId: string): void {
		this.emit(StateEvent.WORKER_DISCONNECTED, { workerId });
	}

	emitWorkerTaskAssigned(workerId: string, taskId: string): void {
		this.emit(StateEvent.WORKER_TASK_ASSIGNED, { workerId, taskId });
	}

	emitWorkerTaskReleased(workerId: string): void {
		this.emit(StateEvent.WORKER_TASK_RELEASED, { workerId });
	}

	// Log events
	emitLogMessage(message: string): void {
		this.emit(StateEvent.LOG_MESSAGE, { message });
	}

	// Orchestrator lifecycle events
	emitOrchestratorStarted(): void {
		this.emit(StateEvent.ORCHESTRATOR_STARTED, {
			timestamp: new Date().toISOString(),
		});
	}

	emitOrchestratorReady(): void {
		this.emit(StateEvent.ORCHESTRATOR_READY, {
			timestamp: new Date().toISOString(),
		});
	}

	emitOrchestratorStopping(): void {
		this.emit(StateEvent.ORCHESTRATOR_STOPPING, {
			timestamp: new Date().toISOString(),
		});
	}

	// Flow execution events (more granular than task events)
	emitFlowExecutionStarted(taskId: string, flowId: string): void {
		this.emit(StateEvent.FLOW_EXECUTION_STARTED, {
			taskId,
			flowId,
			timestamp: new Date().toISOString(),
		} as FlowExecutionEventData);
	}

	emitFlowExecutionProgress(taskId: string, stepId: string, progress: any): void {
		this.emit(StateEvent.FLOW_EXECUTION_PROGRESS, {
			taskId,
			stepId,
			progress,
			timestamp: new Date().toISOString(),
		} as FlowExecutionEventData);
	}

	emitFlowExecutionCompleted(taskId: string, result: any): void {
		this.emit(StateEvent.FLOW_EXECUTION_COMPLETED, {
			taskId,
			result,
			timestamp: new Date().toISOString(),
		} as FlowExecutionEventData);
	}

	emitFlowExecutionFailed(taskId: string, error: string): void {
		this.emit(StateEvent.FLOW_EXECUTION_FAILED, {
			taskId,
			error,
			timestamp: new Date().toISOString(),
		} as FlowExecutionEventData);
	}

	// Metrics events
	emitMetricsUpdated(metrics: MetricsData): void {
		this.emit(StateEvent.METRICS_UPDATED, { metrics });
	}

	// System status
	emitSystemStatusChanged(status: OrchestratorStatusData): void {
		this.emit(StateEvent.SYSTEM_STATUS_CHANGED, { status });
	}
}
