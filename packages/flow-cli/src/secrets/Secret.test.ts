import { describe, expect, it } from 'vitest';
import * as util from 'node:util';

import { Secret } from './Secret.js';

describe('Secret', () => {
	it('returns plaintext via use()', () => {
		const secret = new Secret('my-password');
		expect(secret.use()).toBe('my-password');
	});

	it('toString returns [REDACTED]', () => {
		const secret = new Secret('my-password');
		expect(String(secret)).toBe('[REDACTED]');
	});

	it('toJSON returns [REDACTED]', () => {
		const secret = new Secret('my-password');
		expect(JSON.stringify({ s: secret })).toBe('{"s":"[REDACTED]"}');
	});

	it('Symbol.toPrimitive returns [REDACTED]', () => {
		const secret = new Secret('my-password');
		expect(`${secret}`).toBe('[REDACTED]');
	});

	it('does not leak in template literals', () => {
		const secret = new Secret('super-secret');
		const msg = `Token: ${secret}`;
		expect(msg).toBe('Token: [REDACTED]');
		expect(msg).not.toContain('super-secret');
	});

	it('handles empty string', () => {
		const secret = new Secret('');
		expect(secret.use()).toBe('');
		expect(String(secret)).toBe('[REDACTED]');
	});

	it('util.inspect returns [REDACTED] without leaking value', () => {
		const secret = new Secret('super-secret-value');
		expect(util.inspect(secret)).toBe('[REDACTED]');
	});
});
