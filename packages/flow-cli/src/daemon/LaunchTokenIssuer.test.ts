import { describe, expect, it } from 'vitest';

import { LaunchTokenIssuer } from './LaunchTokenIssuer.js';

describe('LaunchTokenIssuer', () => {
	it('accepts a token it issued for that source', () => {
		const issuer = new LaunchTokenIssuer();
		const token = issuer.issue('laptop');

		expect(issuer.consume('laptop', token)).toBe(true);
	});

	// Single use is the point: a token that stays valid is a long-lived credential the registry
	// never stored, which is what T-09 exists to avoid.
	it('accepts a token exactly once', () => {
		const issuer = new LaunchTokenIssuer();
		const token = issuer.issue('laptop');

		expect(issuer.consume('laptop', token)).toBe(true);
		expect(issuer.consume('laptop', token)).toBe(false);
	});

	it('refuses a token issued for another source', () => {
		const issuer = new LaunchTokenIssuer();
		const token = issuer.issue('laptop');

		expect(issuer.consume('builder', token)).toBe(false);
		// Refusing it elsewhere must not spend it where it belongs.
		expect(issuer.consume('laptop', token)).toBe(true);
	});

	it('refuses a token nobody issued', () => {
		const issuer = new LaunchTokenIssuer();

		expect(issuer.consume('laptop', 'a'.repeat(64))).toBe(false);
	});

	it('refuses an empty token rather than treating it as absent', () => {
		const issuer = new LaunchTokenIssuer();

		expect(issuer.consume('laptop', '')).toBe(false);
	});

	// The window covers a worker starting up, not a machine sitting idle: a token still valid
	// hours later would be a credential lying around in a process environment.
	it('refuses a token past its lifetime', () => {
		let now = 1_000;
		const issuer = new LaunchTokenIssuer(50, () => now);
		const token = issuer.issue('laptop');

		now += 51;

		expect(issuer.consume('laptop', token)).toBe(false);
	});

	it('keeps a token valid within its lifetime', () => {
		let now = 1_000;
		const issuer = new LaunchTokenIssuer(50, () => now);
		const token = issuer.issue('laptop');

		now += 49;

		expect(issuer.consume('laptop', token)).toBe(true);
	});

	it('issues a distinct token per call', () => {
		const issuer = new LaunchTokenIssuer();

		expect(issuer.issue('laptop')).not.toBe(issuer.issue('laptop'));
	});

	// Two workers from one source may be launched together; the first registration must not
	// invalidate the second's token.
	it('keeps several outstanding tokens for the same source', () => {
		const issuer = new LaunchTokenIssuer();
		const first = issuer.issue('laptop');
		const second = issuer.issue('laptop');

		expect(issuer.consume('laptop', second)).toBe(true);
		expect(issuer.consume('laptop', first)).toBe(true);
	});
});
