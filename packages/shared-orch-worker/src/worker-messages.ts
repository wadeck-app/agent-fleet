// Worker → Orchestrator (W2O) messages
import { ProtocolMessage, createMessageInternal, createMessageInternal_Timestamp } from 'shared-common/protocol';

import type { FlowMetadata, TaskStatus } from './domain-types';

export enum W2OMessageType {
	// W2O Messages (Worker → Orchestrator)
	WORKER_READY = 'w2o:worker:ready',
	WORKER_HEARTBEAT = 'w2o:worker:heartbeat',
	REQUEST_TASK = 'w2o:task:request',
	TASK_STARTED = 'w2o:task:started',
	TASK_PROGRESS = 'w2o:task:progress',
	TASK_COMPLETED = 'w2o:task:completed',
	TASK_FAILED = 'w2o:task:failed',
	TASK_QUESTION = 'w2o:task:question',
	FLOWS_UPDATED = 'w2o:flows:updated',
	FLOW_STEP_STARTED = 'w2o:flow:step:started',
	FLOW_STEP_COMPLETED = 'w2o:flow:step:completed',
	FLOW_STEP_FAILED = 'w2o:flow:step:failed',
	WORKSPACE_ALLOCATED = 'w2o:workspace:allocated',
	WORKSPACE_RELEASED = 'w2o:workspace:released',

	// Hook → Orchestrator (via Worker) - TODO: Deprecated?
	/** TODO Deprecated no?*/
	STOP_REQUESTED = 'stop_requested',
	/** TODO Deprecated no?*/
	HOOK_EVENT = 'hook_event',
	/** TODO Deprecated no?*/
	TOOL_RESULT = 'tool_result',

	ACK = 'w2o:ack',
	ERROR = 'w2o:error',
}

export interface W2OBaseMessage extends ProtocolMessage<W2OMessageType> {}

export interface W2OWorkerReadyMessage extends W2OBaseMessage {
	type: W2OMessageType.WORKER_READY;
	preferredId?: string;
	projectId: string;
	workspacePath: string;
	availableFlows: FlowMetadata[];
}

export interface W2OWorkerHeartbeatMessage extends W2OBaseMessage {
	type: W2OMessageType.WORKER_HEARTBEAT;
	workerId: string;
}

export interface W2ORequestTaskMessage extends W2OBaseMessage {
	type: W2OMessageType.REQUEST_TASK;
	workerId: string;
}

export interface W2OTaskStartedMessage extends W2OBaseMessage {
	type: W2OMessageType.TASK_STARTED;
	workerId: string;
	taskId: string;
	newStatus?: TaskStatus;
}

export interface W2OTaskProgressMessage extends W2OBaseMessage {
	type: W2OMessageType.TASK_PROGRESS;
	workerId: string;
	taskId: string;
	progress: string;
}

export interface W2OTaskCompletedMessage extends W2OBaseMessage {
	type: W2OMessageType.TASK_COMPLETED;
	workerId: string;
	taskId: string;
	newStatus?: TaskStatus;
	result?: any;
}

export interface W2OTaskFailedMessage extends W2OBaseMessage {
	type: W2OMessageType.TASK_FAILED;
	workerId: string;
	taskId: string;
	error: string;
	newStatus?: TaskStatus;
}

export interface W2OTaskQuestionMessage extends W2OBaseMessage {
	type: W2OMessageType.TASK_QUESTION;
	workerId: string;
	taskId: string;
	question: string;
}

export interface W2OFlowStepStartedMessage extends W2OBaseMessage {
	type: W2OMessageType.FLOW_STEP_STARTED;
	workerId: string;
	taskId: string;
	stepId: string;
	stepName?: string;
}

export interface W2OFlowStepCompletedMessage extends W2OBaseMessage {
	type: W2OMessageType.FLOW_STEP_COMPLETED;
	workerId: string;
	taskId: string;
	stepId: string;
	outputs?: Record<string, any>;
}

export interface W2OFlowStepFailedMessage extends W2OBaseMessage {
	type: W2OMessageType.FLOW_STEP_FAILED;
	workerId: string;
	taskId: string;
	stepId: string;
	error: string;
}

export interface W2OWorkspaceAllocatedMessage extends W2OBaseMessage {
	type: W2OMessageType.WORKSPACE_ALLOCATED;
	workerId: string;
	taskId: string;
	workspaceId: string;
	workspacePath: string;
}

export interface W2OWorkspaceReleasedMessage extends W2OBaseMessage {
	type: W2OMessageType.WORKSPACE_RELEASED;
	workerId: string;
	taskId: string;
	workspaceId: string;
}

export interface W2OFlowsUpdatedMessage extends W2OBaseMessage {
	type: W2OMessageType.FLOWS_UPDATED;
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
export interface REMOVE_W2OStopRequestedMessage extends W2OBaseMessage {
	type: W2OMessageType.STOP_REQUESTED;
	workerId: string;
	taskId: string;
	claudePid: number;
}

export interface W2OHookEventMessage extends W2OBaseMessage {
	type: W2OMessageType.HOOK_EVENT;
	workerId: string;
	hookName: string;
	data: any;
}

export interface W2OAckMessage extends W2OBaseMessage {
	type: W2OMessageType.ACK;
	[key: string]: any;
}

export interface W2OErrorMessage extends W2OBaseMessage {
	type: W2OMessageType.ERROR;
	error: string;
}

export type W2OMessage =
	| W2OWorkerReadyMessage
	| W2OWorkerHeartbeatMessage
	| W2ORequestTaskMessage
	| W2OTaskStartedMessage
	| W2OTaskProgressMessage
	| W2OTaskCompletedMessage
	| W2OTaskFailedMessage
	| W2OTaskQuestionMessage
	| W2OFlowStepStartedMessage
	| W2OFlowStepCompletedMessage
	| W2OFlowStepFailedMessage
	| W2OWorkspaceAllocatedMessage
	| W2OWorkspaceReleasedMessage
	| W2OFlowsUpdatedMessage
	| REMOVE_W2OStopRequestedMessage
	| W2OHookEventMessage
	| W2OAckMessage
	| W2OErrorMessage;

/**
 * Type map for Worker → Orchestrator messages.
 * Maps each W2OMessageType to its corresponding message interface.
 */
export interface W2OMessageMap {
	[W2OMessageType.WORKER_READY]: W2OWorkerReadyMessage;
	[W2OMessageType.WORKER_HEARTBEAT]: W2OWorkerHeartbeatMessage;
	[W2OMessageType.REQUEST_TASK]: W2ORequestTaskMessage;
	[W2OMessageType.TASK_STARTED]: W2OTaskStartedMessage;
	[W2OMessageType.TASK_PROGRESS]: W2OTaskProgressMessage;
	[W2OMessageType.TASK_COMPLETED]: W2OTaskCompletedMessage;
	[W2OMessageType.TASK_FAILED]: W2OTaskFailedMessage;
	[W2OMessageType.TASK_QUESTION]: W2OTaskQuestionMessage;
	[W2OMessageType.FLOWS_UPDATED]: W2OFlowsUpdatedMessage;
	[W2OMessageType.FLOW_STEP_STARTED]: W2OFlowStepStartedMessage;
	[W2OMessageType.FLOW_STEP_COMPLETED]: W2OFlowStepCompletedMessage;
	[W2OMessageType.FLOW_STEP_FAILED]: W2OFlowStepFailedMessage;
	[W2OMessageType.WORKSPACE_ALLOCATED]: W2OWorkspaceAllocatedMessage;
	[W2OMessageType.WORKSPACE_RELEASED]: W2OWorkspaceReleasedMessage;
	[W2OMessageType.STOP_REQUESTED]: REMOVE_W2OStopRequestedMessage;
	[W2OMessageType.HOOK_EVENT]: W2OHookEventMessage;
	[W2OMessageType.TOOL_RESULT]: W2OBaseMessage;
	[W2OMessageType.ACK]: W2OAckMessage;
	[W2OMessageType.ERROR]: W2OErrorMessage;
}

/**
 * Creates a typed Worker → Orchestrator message.
 *
 * @template T - The message type (inferred from the type parameter)
 * @param type - The W2O message type
 * @param payload - The message payload (type-safe based on message type)
 * @param timestamp - Optional timestamp otherwise "now" is used
 * @returns A fully typed W2O message with timestamp
 *
 * @example
 * const msg = createW2OMessage(W2OMessageType.TASK_STARTED, {
 *   workerId: '123',
 *   taskId: '456',
 *   newStatus: 'running'
 * });
 * // msg is automatically typed as W2OTaskStartedMessage
 */
export function createW2OMessage<T extends W2OMessageType>(
	type: T,
	payload: Omit<W2OMessageMap[T], 'type' | 'timestamp'>,
	timestamp?: createMessageInternal_Timestamp
): W2OMessageMap[T] {
	return createMessageInternal(type, payload, timestamp);
}
