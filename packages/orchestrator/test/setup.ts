import { vi } from 'vitest';

/**
 * Global test setup for Orchestrator package
 * Mocks the logger to ensure all logger methods are vi.fn() mocks
 */

// Mock the logger module - this must be done before any modules are imported
vi.mock('shared-common/logger', () => ({
	createLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	}),
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));
