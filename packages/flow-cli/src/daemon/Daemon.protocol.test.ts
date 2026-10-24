import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { FlowConfigLoader } from '../config/FlowConfig.js';
import { type TestDaemonContext, startTestDaemon } from '../test-utils/TestHelpers';
import { waitUntil } from '../test-utils/WaitHelpers';
import { Daemon } from './Daemon.js';

// Characterization of the daemon's IPC command validation, its worker-socket protocol guards and its
// plugin-config refusals: behaviour that no other test pins down and that lives in Daemon.ts.
describe('Daemon IPC command validation', () => {
	let ctx: TestDaemonContext;

	beforeEach(async () => {
		ctx = await startTestDaemon({ concurrency: 0 });
	});

	afterEach(async () => {
		await ctx[Symbol.asyncDispose]();
	});

	const send = (command: string, payload: unknown): Promise<unknown> =>
		(ctx.client as unknown as { send: (c: string, p: unknown) => Promise<unknown> }).send(command, payload);

	it('refuses resume without a non-empty executionId', async () => {
		await expect(send('resume', { type: 'resume', executionId: '  ' })).rejects.toThrow(
			/resume requires a non-empty "executionId"/
		);
	});

	it('refuses setDraining without a boolean and echoes a valid value', async () => {
		await expect(send('setDraining', { draining: 'yes' })).rejects.toThrow(
			/setDraining requires a boolean "draining"/
		);
		expect(await send('setDraining', { draining: true })).toEqual({ draining: true });
		expect(await send('setDraining', { draining: false })).toEqual({ draining: false });
	});

	it('refuses updateWorker without a non-empty workerId', async () => {
		await expect(send('updateWorker', { workerId: '' })).rejects.toThrow(
			/updateWorker requires a non-empty "workerId"/
		);
	});

	it('lists no worker when none is connected', async () => {
		expect(await send('workers', {})).toEqual([]);
	});
});

describe('Daemon worker socket protocol guards', () => {
	let ctx: TestDaemonContext;
	let socket: WebSocket | undefined;

	beforeEach(async () => {
		ctx = await startTestDaemon({ concurrency: 0 });
	});

	afterEach(async () => {
		socket?.close();
		socket = undefined;
		vi.restoreAllMocks();
		await ctx[Symbol.asyncDispose]();
	});

	async function connect(): Promise<WebSocket> {
		const portFile = path.join(ctx.daemonDir, 'worker.port');
		await waitUntil(() => fs.existsSync(portFile), {
			timeoutMs: 4_000,
			failureMessage: 'the daemon never published a worker port',
		});
		const { port } = JSON.parse(fs.readFileSync(portFile, 'utf8')) as { port: number };
		const ws = new WebSocket(`ws://127.0.0.1:${String(port)}`);
		socket = ws;
		await new Promise<void>((resolve, reject) => {
			ws.once('open', () => resolve());
			ws.once('error', reject);
		});
		return ws;
	}

	function daemonLog(): string {
		const logsDir = path.join(ctx.daemonDir, 'logs');
		return fs
			.readdirSync(logsDir)
			.filter(f => f.endsWith('.ndjson'))
			.map(f => fs.readFileSync(path.join(logsDir, f), 'utf8'))
			.join('\n');
	}

	it('terminates a relay presenting an unknown source credential and logs why', async () => {
		const ws = await connect();
		const closed = new Promise<void>(resolve => ws.once('close', () => resolve()));
		ws.send(JSON.stringify({ type: 'source_ready', sourceId: 'ghost', sourceToken: 'nope', capacity: 1 }));
		await closed;
		expect(daemonLog()).toContain('refused relay for source \\"ghost\\"');
	});

	it('rejects reports bound to an assignment this socket does not hold', async () => {
		const stderr = vi.spyOn(process.stderr, 'write');
		const ws = await connect();
		const base = { assignmentId: 'a-unknown', executionId: 'e-unknown', stepId: 's-unknown' };
		ws.send(JSON.stringify({ type: 'step_progress', ...base }));
		ws.send(JSON.stringify({ type: 'log', ...base, entry: { level: 'info', message: 'x', timestamp: 'x' } }));
		ws.send(JSON.stringify({ type: 'step_completed', ...base, output: {} }));
		ws.send(JSON.stringify({ type: 'step_failed', ...base, error: 'boom' }));
		ws.send(
			JSON.stringify({ type: 'inject_steps', assignmentId: 'a-unknown', executionId: 'e-unknown', steps: [] })
		);
		await waitUntil(
			() =>
				stderr.mock.calls.filter(c => String(c[0]).includes('[CommandHandler] rejected worker report'))
					.length >= 5,
			{ timeoutMs: 4_000, failureMessage: 'not every unbound report was rejected' }
		);
	});
});

describe('Daemon plugin config refusals', () => {
	let tmpDir: string;
	let previousXdg: string | undefined;

	beforeEach(() => {
		tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-daemon-plugins-')));
		previousXdg = process.env['XDG_CONFIG_HOME'];
		process.env['XDG_CONFIG_HOME'] = tmpDir;
	});

	afterEach(() => {
		if (previousXdg === undefined) {
			delete process.env['XDG_CONFIG_HOME'];
		} else {
			process.env['XDG_CONFIG_HOME'] = previousXdg;
		}
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('refuses to start when the global config declares a plugin point the daemon does not load', async () => {
		fs.mkdirSync(path.join(tmpDir, 'flow'), { recursive: true });
		fs.writeFileSync(path.join(tmpDir, 'flow', 'config.yml'), 'plugins:\n  authentication:\n    use: x\n', 'utf8');

		await expect(
			Daemon.start(
				{ ...FlowConfigLoader.DEFAULT, worker: { ...FlowConfigLoader.DEFAULT.worker, wsPort: 0 } },
				path.join(tmpDir, 'daemon'),
				{ port: 0 }
			)
		).rejects.toThrow(
			/configures plugins\.authentication, but the daemon does not load a authentication plugin yet/
		);
	});
});
