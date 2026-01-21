import { vi } from 'vitest';

/**
 * Global test setup for Orchestrator package
 * Mocks the logger to prevent "Cannot read properties of undefined" errors
 */

// Mock the logger module - this must be done before any modules are imported
vi.mock('shared-common/logger', async () => {
	const actual = await vi.importActual('shared-common/logger');
	return {
		...actual,
		createLogger: () => ({
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		}),
	};
});
