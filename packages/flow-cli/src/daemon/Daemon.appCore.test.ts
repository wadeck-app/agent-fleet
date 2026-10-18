import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registration = vi.hoisted(() => ({ registerWithAppCore: vi.fn() }));
vi.mock('./AppCoreRegistration.js', () => registration);

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-daemon-app-core-')));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

function readDaemonLog(): { level: string; msg: string }[] {
	const logFile = path.join(tmpDir, 'logs', `${new Date().toISOString().slice(0, 10)}.ndjson`);
	return fs
		.readFileSync(logFile, 'utf8')
		.trim()
		.split('\n')
		.map(line => JSON.parse(line) as { level: string; msg: string });
}

async function startDaemon(options: { appCoreModule?: { manifestPath: string } }) {
	const { Daemon } = await import('./Daemon.js');
	const { FlowConfigLoader } = await import('../config/FlowConfig.js');
	return Daemon.start(
		{ ...FlowConfigLoader.DEFAULT, worker: { ...FlowConfigLoader.DEFAULT.worker, wsPort: 0 } },
		tmpDir,
		{ port: 0, ...options }
	);
}

describe('Daemon registration of the app-module with app-core', () => {
	it('registers the module on start with the given manifest and records what app-core answered in the daemon log', async () => {
		registration.registerWithAppCore.mockImplementation(
			async (_manifestPath: string, log: (entry: { level: string; source: string; message: string }) => void) => {
				log({
					level: 'info',
					source: 'AppCoreRegistration',
					message: 'app-core: module "flow" registered on port 4850',
				});
				log({ level: 'error', source: 'AppCoreRegistration', message: 'app-core refused: reason' });
			}
		);

		const handle = await startDaemon({ appCoreModule: { manifestPath: '/abs/dist-module/manifest.json' } });
		try {
			await vi.waitFor(() => expect(registration.registerWithAppCore).toHaveBeenCalledTimes(1), {
				timeout: 2000,
			});
			expect(registration.registerWithAppCore.mock.calls[0]![0]).toBe('/abs/dist-module/manifest.json');
			await vi.waitFor(() =>
				expect(readDaemonLog().map(e => e.msg)).toContain('[AppCoreRegistration] app-core refused: reason')
			);
			expect(readDaemonLog()).toEqual(
				expect.arrayContaining([
					{
						ts: expect.any(String),
						level: 'info',
						msg: '[AppCoreRegistration] app-core: module "flow" registered on port 4850',
					},
					{ ts: expect.any(String), level: 'error', msg: '[AppCoreRegistration] app-core refused: reason' },
				])
			);
		} finally {
			await handle.stop('idle');
		}
	});

	it('starts normally when the registration function rejects (best-effort: a broken app-core must not stop the daemon)', async () => {
		registration.registerWithAppCore.mockRejectedValue(new Error('unexpected'));

		const handle = await startDaemon({ appCoreModule: { manifestPath: '/abs/manifest.json' } });
		try {
			await vi.waitFor(() => expect(registration.registerWithAppCore).toHaveBeenCalled(), { timeout: 2000 });
			expect(readDaemonLog().map(e => e.msg)).toContain('Daemon started');
			await vi.waitFor(() =>
				expect(
					readDaemonLog().some(
						e => e.level === 'error' && e.msg.includes('app-core') && e.msg.includes('unexpected')
					)
				).toBe(true)
			);
		} finally {
			await handle.stop('idle');
		}
	});

	it('does not touch app-core when the caller passes no app-module (tests and embedders opt in explicitly)', async () => {
		const handle = await startDaemon({});
		try {
			expect(readDaemonLog().map(e => e.msg)).toContain('Daemon started');
			expect(registration.registerWithAppCore).not.toHaveBeenCalled();
		} finally {
			await handle.stop('idle');
		}
	});
});
