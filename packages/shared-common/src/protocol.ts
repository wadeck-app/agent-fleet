import { BaseMessage, Message, MessageType } from './types.js';

export function createMessage<T extends Message>(
	type: T['type'],
	payload: Omit<T, 'type' | 'timestamp'> = {} as any
): T {
	return {
		type,
		timestamp: new Date().toISOString(),
		...payload,
	} as T;
}

export function parseMessage(data: string): Message {
	try {
		const parsed = JSON.parse(data);
		if (!parsed.type) {
			throw new Error('Message missing type field');
		}
		return parsed as Message;
	} catch (e) {
		throw new Error(`Invalid message format: ${(e as Error).message}`);
	}
}

export function serializeMessage(message: Message): string {
	return JSON.stringify(message);
}
