export interface ProtocolMessage<T extends string> {
	type: T;
	timestamp: string;
}

export type createMessageInternal_Timestamp = Date | number | undefined;

/**
 * Factory function for creating protocol messages with timestamp.
 *
 * This function is used by specialized message factories (createW2OMessage, createO2WMessage)
 * to create typed messages. It handles adding the timestamp automatically.
 *
 * @param type - The message type
 * @param payload - The message payload
 * @param timestamp - Optional timestamp otherwise "now" is used
 * @returns The complete message with type and timestamp
 */
export function createMessageInternal<T extends string>(
	type: T,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	payload: Record<string, any>,
	timestamp?: createMessageInternal_Timestamp
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
	let tsDate: Date;
	if (timestamp instanceof Date) {
		tsDate = timestamp;
	} else if (typeof timestamp == 'number') {
		tsDate = new Date(timestamp);
	} else {
		tsDate = new Date();
	}
	return {
		type,
		timestamp: tsDate.toISOString(),
		...payload,
	};
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
