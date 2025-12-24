export interface ProtocolMessage<T extends string> {
	type: T;
	timestamp: string;
}

//FIXME stronger typing to find error in payload!!! and to determine the outcome based on the type
export function createMessage<M extends ProtocolMessage<T>, T extends string>(
	type: M['type'],
	payload: Omit<M, 'type' | 'timestamp'> = {} as any
): M {
	return {
		type,
		timestamp: new Date().toISOString(),
		...payload,
	} as M;
}

export function parseMessage<M extends ProtocolMessage<T>, T extends string>(data: string): M {
	try {
		const parsed = JSON.parse(data);
		if (!parsed.type) {
			throw new Error('Message missing type field');
		}
		return parsed as M;
	} catch (e) {
		throw new Error(`Invalid message format: ${(e as Error).message}`);
	}
}

export function serializeMessage<M extends ProtocolMessage<T>, T extends string>(message: M): string {
	return JSON.stringify(message);
}
