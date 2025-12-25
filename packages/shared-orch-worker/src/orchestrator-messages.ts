// Orchestrator → Worker (O2W) messages
import { ProtocolMessage, createMessageInternal, createMessageInternal_Timestamp } from 'shared-common/protocol';

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

/**
 * Type map for Orchestrator → Worker messages.
 * Maps each O2WMessageType to its corresponding message interface.
 */
export interface O2WMessageMap {
	[O2WMessageType.WORKER_WELCOME]: WorkerWelcomeMessage;
	[O2WMessageType.ASSIGN_TASK]: AssignTaskMessage;
	[O2WMessageType.KILL_CLAUDE]: KillClaudeMessage;
	[O2WMessageType.PAUSE]: PauseMessage;
	[O2WMessageType.RESUME]: ResumeMessage;
	[O2WMessageType.SHUTDOWN]: ShutdownMessage;
	[O2WMessageType.ACK]: AckMessage;
	[O2WMessageType.ERROR]: ErrorMessage;
}

/**
 * Creates a typed Orchestrator → Worker message.
 *
 * @template T - The message type (inferred from the type parameter)
 * @param type - The O2W message type
 * @param payload - The message payload (type-safe based on message type)
 * @param timestamp - Optional timestamp otherwise "now" is used
 * @returns A fully typed O2W message with timestamp
 *
 * @example
 * const msg = createO2WMessage(O2WMessageType.WORKER_WELCOME, {
 *   workerId: '123'
 * });
 * // msg is automatically typed as WorkerWelcomeMessage
 */
export function createO2WMessage<T extends O2WMessageType>(
	type: T,
	payload: Omit<O2WMessageMap[T], 'type' | 'timestamp'>,
	timestamp?: createMessageInternal_Timestamp
): O2WMessageMap[T] {
	return createMessageInternal(type, payload, timestamp);
}
