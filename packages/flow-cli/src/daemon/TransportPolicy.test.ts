import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { admitTransport, resolveBindAddress, resolveSharedSecret } from './TransportPolicy.js';

describe('admitTransport - loopback', () => {
	// A forked worker and a `flow worker` in a terminal are loopback children. Requiring TLS
	// for them would mean shipping certificates to run a flow on one machine.
	it('admits an unencrypted loopback peer', () => {
		expect(admitTransport({ remoteAddress: '127.0.0.1', encrypted: false }).ok).toBe(true);
	});

	it('admits IPv6 and mapped loopback forms', () => {
		expect(admitTransport({ remoteAddress: '::1', encrypted: false }).ok).toBe(true);
		expect(admitTransport({ remoteAddress: '::ffff:127.0.0.1', encrypted: false }).ok).toBe(true);
	});

	it('admits an encrypted loopback peer too', () => {
		expect(admitTransport({ remoteAddress: '127.0.0.1', encrypted: true }).ok).toBe(true);
	});
});

describe('admitTransport - off loopback (P-5)', () => {
	// The rule the whole principle exists for: refuse, never warn.
	it('refuses an unencrypted remote peer', () => {
		const decision = admitTransport({ remoteAddress: '192.168.1.40', encrypted: false });

		expect(decision.ok).toBe(false);
	});

	it('says what was refused and what to do about it', () => {
		const decision = admitTransport({ remoteAddress: '192.168.1.40', encrypted: false });
		const reason = decision.ok ? '' : decision.reason;

		expect(reason).toContain('192.168.1.40');
		expect(reason).toMatch(/encrypt/i);
	});

	it('admits an encrypted remote peer', () => {
		expect(admitTransport({ remoteAddress: '192.168.1.40', encrypted: true }).ok).toBe(true);
	});

	// Fails closed: an address the daemon cannot read is treated as remote, so the unknown
	// case refuses rather than granting loopback trust.
	it('treats an unknown address as remote', () => {
		expect(admitTransport({ encrypted: false }).ok).toBe(false);
		expect(admitTransport({ remoteAddress: '', encrypted: false }).ok).toBe(false);
	});

	it('admits an unknown address when the channel is encrypted', () => {
		expect(admitTransport({ encrypted: true }).ok).toBe(true);
	});
});

describe('resolveBindAddress', () => {
	// Loopback stays the default: making the daemon reachable is a decision the user takes,
	// never one they get by upgrading.
	it('binds loopback when nothing is configured', () => {
		expect(resolveBindAddress(undefined, { hasTls: false })).toBe('127.0.0.1');
	});

	it('binds the configured address when TLS is available', () => {
		expect(resolveBindAddress('0.0.0.0', { hasTls: true })).toBe('0.0.0.0');
	});

	// Binding wide with no certificate would produce a listener that refuses every peer it
	// accepts -- confusing, and it advertises a port for nothing.
	it('refuses to bind beyond loopback without TLS configured', () => {
		expect(() => resolveBindAddress('0.0.0.0', { hasTls: false })).toThrow(/tls/i);
	});

	it('names the setting to fix in that error', () => {
		expect(() => resolveBindAddress('0.0.0.0', { hasTls: false })).toThrow(/worker\.tls/);
	});

	// Explicitly asking for loopback needs no certificate.
	it('allows an explicit loopback address without TLS', () => {
		expect(resolveBindAddress('127.0.0.1', { hasTls: false })).toBe('127.0.0.1');
	});
});

describe('resolveSharedSecret (D#44)', () => {
	it('reads a secret from the environment', () => {
		process.env['FLOW_TEST_SECRET'] = 'from-env';
		try {
			expect(resolveSharedSecret('${FLOW_TEST_SECRET}')).toBe('from-env');
		} finally {
			delete process.env['FLOW_TEST_SECRET'];
		}
	});

	it('fails when the named variable is not set, rather than using the literal', () => {
		delete process.env['FLOW_TEST_MISSING'];

		expect(() => resolveSharedSecret('${FLOW_TEST_MISSING}')).toThrow(/FLOW_TEST_MISSING/);
	});

	// A literal in config is a hard error, not a warning: it ends up in version control.
	it('refuses a literal secret', () => {
		expect(() => resolveSharedSecret('hunter2')).toThrow(/\$\{ENV_VAR\}|file:/);
	});

	it('refuses an empty value instead of treating it as "no secret"', () => {
		expect(() => resolveSharedSecret('')).toThrow();
		expect(() => resolveSharedSecret('   ')).toThrow();
	});

	// The other permitted indirection, and the one an operator is most likely to use for a
	// long-lived secret. It was implemented and never exercised.
	it('reads a secret from a file', () => {
		const dir = mkdtempSync(join(tmpdir(), 'shared-secret-'));
		try {
			const file = join(dir, 'token');
			writeFileSync(file, 'from-file\n', 'utf8');

			expect(resolveSharedSecret(`file:${file}`)).toBe('from-file');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('names the missing file rather than continuing without a secret', () => {
		const missing = join(tmpdir(), 'definitely-not-here-4b2a');

		expect(() => resolveSharedSecret(`file:${missing}`)).toThrow(/definitely-not-here-4b2a/);
	});

	// An empty file is a configuration mistake, not an empty credential: accepting it would
	// authenticate a peer that presented nothing.
	it('refuses an empty file', () => {
		const dir = mkdtempSync(join(tmpdir(), 'shared-secret-'));
		try {
			const file = join(dir, 'token');
			writeFileSync(file, '\n  \n', 'utf8');

			expect(() => resolveSharedSecret(`file:${file}`)).toThrow(/empty/i);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
