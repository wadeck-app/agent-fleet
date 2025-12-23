// Orchestrator → Worker (O2W) messages
import type { Task } from './domain-types.js';
import type { BaseMessage, MessageType } from './protocol.js';

export interface WorkerWelcomeMessage extends BaseMessage {
	type: MessageType.WORKER_WELCOME;
	workerId: string;
}

export interface AssignTaskMessage extends BaseMessage {
	type: MessageType.ASSIGN_TASK;
	task: Task;
}

export interface KillClaudeMessage extends BaseMessage {
	type: MessageType.KILL_CLAUDE;
	reason: string;
}

export interface PauseMessage extends BaseMessage {
	type: MessageType.PAUSE;
}

export interface ResumeMessage extends BaseMessage {
	type: MessageType.RESUME;
}

export interface ShutdownMessage extends BaseMessage {
	type: MessageType.SHUTDOWN;
}

export interface AckMessage extends BaseMessage {
	type: MessageType.ACK;
	[key: string]: any;
}

export interface ErrorMessage extends BaseMessage {
	type: MessageType.ERROR;
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
