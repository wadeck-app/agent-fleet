/**
 * End-to-end check of the property Phase 2a rests on (D#48, D#51).
 *
 * A worker the daemon did not create must never be told to exit when the daemon goes
 * idle. Before the fix, broadcastDone() sent `done` to every connected worker, so the
 * worker a user launched in a terminal died with the daemon.
 *
 * Only that property is asserted here, because it is the one cleanly observable across
 * the process boundary. Admission and refusal are covered by WorkerProvisioner's unit
 * tests: at this level they cannot be distinguished from the daemon's own idle shutdown,
 * which closes every socket and fires in the same tick as the registration.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { type TestDaemonContext, startTestDaemon } from '../test-utils/TestHelpers';

let ctx: TestDaemonContext;

beforeEach(async () => {
	ctx = await startTestDaemon();
});

afterEach(async () => {
	await ctx[Symbol.asyncDispose]();
});

/** The daemon defaults its WebSocket port to the HTTP port plus one. */
function wsUrl(daemonDir: string): string {
	const { port } = JSON.parse(readFileSync(join(daemonDir, 'config.port'), 'utf8')) as { port: number };
	return `ws://127.0.0.1:${String(port + 1)}`;
}

describe('a worker the daemon did not create', () => {
	it('is never sent the shutdown notice that daemon-created workers receive', async () => {
		const token = readFileSync(join(ctx.daemonDir, 'health_token'), 'utf8').trim();
		const ws = new WebSocket(wsUrl(ctx.daemonDir));
		const received: string[] = [];

		await new Promise<void>((resolve, reject) => {
			ws.once('open', () => resolve());
			ws.once('error', reject);
		});
		ws.on('message', (data: Buffer) => received.push(data.toString()));

		// pid is deliberately not one this daemon spawned, so admission goes through the
		// credential path rather than provenance.
		ws.send(JSON.stringify({ type: 'ready', pid: 999_001, authToken: token }));

		// Long enough for the daemon to notice it has nothing to do and shut down.
		await new Promise(resolve => setTimeout(resolve, 1200));
		ws.close();

		const types = received.map(raw => (JSON.parse(raw) as { type: string }).type);
		expect(types).not.toContain('done');
	});
});
