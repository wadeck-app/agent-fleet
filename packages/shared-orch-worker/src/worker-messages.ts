// Worker → Orchestrator (W2O) messages
import type { FlowMetadata, TaskStatus, WorkerType } from './domain-types.js';
import type { BaseMessage, MessageType } from './protocol.js';

export interface WorkerReadyMessage extends BaseMessage {
	type: MessageType.WORKER_READY;
	workerType: WorkerType;
	preferredId?: string;
	projectId: string;
	workspacePath: string;
	availableFlows: FlowMetadata[];
}

export interface WorkerHeartbeatMessage extends BaseMessage {
	type: MessageType.WORKER_HEARTBEAT;
	workerId: string;
}

export interface RequestTaskMessage extends BaseMessage {
	type: MessageType.REQUEST_TASK;
	workerId: string;
}

export interface TaskStartedMessage extends BaseMessage {
	type: MessageType.TASK_STARTED;
	workerId: string;
	taskId: string;
	newStatus?: TaskStatus;
}

export interface TaskProgressMessage extends BaseMessage {
	type: MessageType.TASK_PROGRESS;
	workerId: string;
	taskId: string;
	progress: string;
}

export interface TaskCompletedMessage extends BaseMessage {
	type: MessageType.TASK_COMPLETED;
	workerId: string;
	taskId: string;
	newStatus?: TaskStatus;
	result?: any;
}

export interface TaskFailedMessage extends BaseMessage {
	type: MessageType.TASK_FAILED;
	workerId: string;
	taskId: string;
	error: string;
	newStatus?: TaskStatus;
}

export interface TaskQuestionMessage extends BaseMessage {
	type: MessageType.TASK_QUESTION;
	workerId: string;
	taskId: string;
	question: string;
}

export interface FlowStepStartedMessage extends BaseMessage {
	type: MessageType.FLOW_STEP_STARTED;
	workerId: string;
	taskId: string;
	stepId: string;
	stepName?: string;
}

export interface FlowStepCompletedMessage extends BaseMessage {
	type: MessageType.FLOW_STEP_COMPLETED;
	workerId: string;
	taskId: string;
	stepId: string;
	outputs?: Record<string, any>;
}

export interface FlowStepFailedMessage extends BaseMessage {
	type: MessageType.FLOW_STEP_FAILED;
	workerId: string;
	taskId: string;
	stepId: string;
	error: string;
}

export interface WorkspaceAllocatedMessage extends BaseMessage {
	type: MessageType.WORKSPACE_ALLOCATED;
	workerId: string;
	taskId: string;
	workspaceId: string;
	workspacePath: string;
}

export interface WorkspaceReleasedMessage extends BaseMessage {
	type: MessageType.WORKSPACE_RELEASED;
	workerId: string;
	taskId: string;
	workspaceId: string;
}

export interface FlowsUpdatedMessage extends BaseMessage {
	type: MessageType.FLOWS_UPDATED;
	workerId: string;
	projectId: string;
	flows: FlowMetadata[];
	changes?: {
		added: string[];
		removed: string[];
		updated: string[];
	};
}

// Deprecated messages (TODO: Remove?)
export interface StopRequestedMessage extends BaseMessage {
	type: MessageType.STOP_REQUESTED;
	workerId: string;
	taskId: string;
	claudePid: number;
}

export interface HookEventMessage extends BaseMessage {
	type: MessageType.HOOK_EVENT;
	workerId: string;
	hookName: string;
	data: any;
}

export type W2OMessage =
	| WorkerReadyMessage
	| WorkerHeartbeatMessage
	| RequestTaskMessage
	| TaskStartedMessage
	| TaskProgressMessage
	| TaskCompletedMessage
	| TaskFailedMessage
	| TaskQuestionMessage
	| FlowStepStartedMessage
	| FlowStepCompletedMessage
	| FlowStepFailedMessage
	| WorkspaceAllocatedMessage
	| WorkspaceReleasedMessage
	| FlowsUpdatedMessage
	| StopRequestedMessage
	| HookEventMessage;
