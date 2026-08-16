import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks before any imports
const { mockCreateDaemon } = vi.hoisted(() => ({
	mockCreateDaemon: vi.fn(),
}));

vi.mock('@wadeck/singleton-daemon-kit', () => ({
	createDaemon: mockCreateDaemon,
	DaemonNotRunningError: class DaemonNotRunningError extends Error {},
}));

vi.mock('./WebSocketServer.js', () => ({
	WebSocketServer: class MockWebSocketServer {
		constructor() {}
		close() {}
	},
}));

// Import after mocking
const { startDaemon } = await import('./Daemon.js');

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-test-'));
	// Default: createDaemon succeeds and calls onStart hook synchronously
	mockCreateDaemon.mockImplementation(async (opts: { hooks?: { onStart?: (port: number) => void } }) => {
		opts.hooks?.onStart?.(9999);
		return { port: 9999, stop: vi.fn() };
	});
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
	vi.clearAllMocks();
});

describe('startDaemon', () => {
	it('creates daemon dir before calling createDaemon', async () => {
		const daemonDir = path.join(tmpDir, 'flow-daemon');
		expect(fs.existsSync(daemonDir)).toBe(false);

		// Track call order: does the dir exist when createDaemon is called?
		let dirExistedAtCallTime = false;
		mockCreateDaemon.mockImplementation(async (opts: { hooks?: { onStart?: (port: number) => void } }) => {
			dirExistedAtCallTime = fs.existsSync(daemonDir);
			opts.hooks?.onStart?.(9999);
			return { port: 9999, stop: vi.fn() };
		});

		await startDaemon(undefined, daemonDir);
		expect(dirExistedAtCallTime).toBe(true);
	});

	it('creates executions/ and logs/ subdirs inside onStart', async () => {
		const daemonDir = path.join(tmpDir, 'flow-daemon');
		await startDaemon(undefined, daemonDir);
		expect(fs.existsSync(path.join(daemonDir, 'executions'))).toBe(true);
		expect(fs.existsSync(path.join(daemonDir, 'logs'))).toBe(true);
	});

	it('is idempotent — does not throw if daemon dir already exists', async () => {
		const daemonDir = path.join(tmpDir, 'flow-daemon');
		fs.mkdirSync(daemonDir, { recursive: true });
		await expect(startDaemon(undefined, daemonDir)).resolves.not.toThrow();
	});
});
