import { vi } from 'vitest';

import type { ITransportClient } from '@/transport/ITransportClient';

export class TransportMockFactory {
	static create(overrides: Partial<ITransportClient> = {}): ITransportClient {
		const defaultMockTransport: ITransportClient = {
			connect: vi.fn().mockResolvedValue(undefined),
			disconnect: vi.fn().mockResolvedValue(undefined),
			request: vi.fn().mockResolvedValue({}),
			subscribe: vi.fn().mockReturnValue(() => {}),
			getTransportType: vi.fn().mockReturnValue('mock'),
			isConnected: vi.fn().mockReturnValue(true),
			isConnecting: vi.fn().mockReturnValue(false),
			getLocalSubscriptions: vi.fn().mockReturnValue([]),
			onConnectionStateChange: vi.fn().mockReturnValue(() => {}),
			...overrides,
		};

		return defaultMockTransport;
	}

	static createFailingTransport(errorMessage = 'Transport connection failed'): ITransportClient {
		return {
			...this.create(),
			connect: vi.fn().mockRejectedValue(new Error(errorMessage)),
			isConnected: vi.fn().mockReturnValue(false),
		};
	}
}

export const createMockTransport = TransportMockFactory.create;
export const createFailingMockTransport = TransportMockFactory.createFailingTransport;
