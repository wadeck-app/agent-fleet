// Orchestrator → Worker (O2W) messages
import { ProtocolMessage } from 'shared-common/protocol';

import type { Task } from './domain-types';

export interface O2WBaseMessage extends ProtocolMessage<O2WMessageType> {}

export enum O2WMessageType {
	// O2W Messages (Orchestrator → Worker)
	WORKER_WELCOME = 'o2w:worker:welcome',
	ASSIGN_TASK = 'o2w:task:assign',
	KILL_CLAUDE = 'o2w:claude:kill',
	PAUSE = 'o2w:execution:pause',
	RESUME = 'o2w:execution:resume',
	SHUTDOWN = 'o2w:worker:shutdown',
	ACK = 'o2w:ack',
	ERROR = 'o2w:error',
}

export interface WorkerWelcomeMessage extends O2WBaseMessage {
	type: O2WMessageType.WORKER_WELCOME;
	workerId: string;
}

export interface AssignTaskMessage extends O2WBaseMessage {
	type: O2WMessageType.ASSIGN_TASK;
	task: Task;
}

export interface KillClaudeMessage extends O2WBaseMessage {
	type: O2WMessageType.KILL_CLAUDE;
	reason: string;
}

export interface PauseMessage extends O2WBaseMessage {
	type: O2WMessageType.PAUSE;
}

export interface ResumeMessage extends O2WBaseMessage {
	type: O2WMessageType.RESUME;
}

export interface ShutdownMessage extends O2WBaseMessage {
	type: O2WMessageType.SHUTDOWN;
}

export interface AckMessage extends O2WBaseMessage {
	type: O2WMessageType.ACK;
	[key: string]: any;
}

export interface ErrorMessage extends O2WBaseMessage {
	type: O2WMessageType.ERROR;
	error: string;
}

export type O2WMessage =
	| WorkerWelcomeMessage
	| AssignTaskMessage
	| KillClaudeMessage
	| PauseMessage
	| ResumeMessage
	| ShutdownMessage
	| AckMessage
	| ErrorMessage;
