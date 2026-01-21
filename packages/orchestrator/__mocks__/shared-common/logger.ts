import { vi } from 'vitest';

/**
 * Mock implementation of shared-common/logger for tests
 * This is a manual mock that will be automatically picked up by Vitest
 */

export const createLogger = () => ({
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
});
