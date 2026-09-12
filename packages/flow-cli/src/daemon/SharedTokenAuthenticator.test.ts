import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SharedTokenAuthenticator } from './SharedTokenAuthenticator.js';
import { WorkerSourceRegistry } from './WorkerSourceRegistry.js';

let dir: string;
const DAEMON_TOKEN = 'a'.repeat(64);

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'shared-token-auth-'));
	writeFileSync(join(dir, 'health_token'), `${DAEMON_TOKEN}\n`, 'utf8');
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

function auth(): SharedTokenAuthenticator {
	return new SharedTokenAuthenticator(dir, new WorkerSourceRegistry(dir));
}

describe('SharedTokenAuthenticator - daemon token', () => {
	it('accepts a loopback peer presenting the daemon token', () => {
		const result = auth().authenticate({ token: DAEMON_TOKEN, loopback: true });
		expect(result.ok).toBe(true);
	});

	it('tolerates surrounding whitespace in the stored token', () => {
		writeFileSync(join(dir, 'health_token'), `  ${DAEMON_TOKEN}  \n`, 'utf8');
		expect(auth().authenticate({ token: DAEMON_TOKEN, loopback: true }).ok).toBe(true);
	});

	it('refuses a wrong token with a reason', () => {
		const result = auth().authenticate({ token: 'b'.repeat(64), loopback: true });

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected refusal');
		expect(result.reason).toMatch(/token/i);
	});

	it('refuses a peer presenting no token at all', () => {
		const result = auth().authenticate({ loopback: true });

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected refusal');
		expect(result.reason).toMatch(/no credential|no token/i);
	});
});

describe('SharedTokenAuthenticator - per-source token', () => {
	it('accepts a peer presenting its own source token', () => {
		const registry = new WorkerSourceRegistry(dir);
		const { token } = registry.declare({
			sourceId: 'laptop',
			provider: 'built-in:inbound',
			labels: [],
			maxWorkers: 1,
		});

		const result = new SharedTokenAuthenticator(dir, registry).authenticate({
			token,
			sourceId: 'laptop',
			loopback: false,
		});

		expect(result.ok).toBe(true);
	});

	// A source token must not be interchangeable with another source's.
	it('refuses a source token presented for a different source', () => {
		const registry = new WorkerSourceRegistry(dir);
		const { token } = registry.declare({
			sourceId: 'laptop',
			provider: 'built-in:inbound',
			labels: [],
			maxWorkers: 1,
		});
		registry.declare({ sourceId: 'desktop', provider: 'built-in:inbound', labels: [], maxWorkers: 1 });

		const result = new SharedTokenAuthenticator(dir, registry).authenticate({
			token,
			sourceId: 'desktop',
			loopback: false,
		});

		expect(result.ok).toBe(false);
	});

	it('names the source when refusing, so the log is actionable', () => {
		const result = auth().authenticate({ token: 'c'.repeat(64), sourceId: 'ghost', loopback: false });

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected refusal');
		expect(result.reason).toContain('ghost');
	});

	// The daemon token is a loopback CLI credential; it must not let a remote peer in.
	it('refuses the daemon token from a non-loopback peer', () => {
		const result = auth().authenticate({ token: DAEMON_TOKEN, loopback: false });

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected refusal');
		expect(result.reason).toMatch(/loopback|source/i);
	});
});

describe('SharedTokenAuthenticator - missing daemon token file', () => {
	// Failing closed matters: treating an unreadable token as "no check" would admit anyone.
	it('refuses rather than admitting everyone when the token file is absent', () => {
		rmSync(join(dir, 'health_token'));

		const result = auth().authenticate({ token: DAEMON_TOKEN, loopback: true });

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected refusal');
		expect(result.reason).toMatch(/health_token/);
	});
});
