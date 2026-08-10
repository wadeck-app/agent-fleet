import { describe, expect, it } from 'vitest';

import { LogMasker } from './LogMasker.js';

describe('LogMasker', () => {
	it('masks raw plaintext occurrences', () => {
		const masker = new LogMasker();
		masker.register('secret123');
		expect(masker.mask('the secret is secret123 here')).toBe('the secret is [REDACTED] here');
	});

	it('masks base64 encoding (without padding)', () => {
		const masker = new LogMasker();
		const value = 'hello';
		masker.register(value);
		// Masker registers base64 WITHOUT padding — matches the body, trailing = is unmasked
		const b64NoPad = Buffer.from(value).toString('base64').replace(/=+$/, '');
		expect(masker.mask(`encoded: ${b64NoPad}`)).toBe('encoded: [REDACTED]');
	});

	it('masks base64 encoding with padding', () => {
		const masker = new LogMasker();
		const value = 'test'; // 'test' base64 = 'dGVzdA==' (has padding)
		masker.register(value);
		const b64WithPad = Buffer.from(value).toString('base64'); // 'dGVzdA=='
		expect(masker.mask(`encoded: ${b64WithPad}`)).toBe('encoded: [REDACTED]');
	});

	it('masks hex encoding', () => {
		const masker = new LogMasker();
		const value = 'hello';
		masker.register(value);
		const hex = Buffer.from(value).toString('hex');
		expect(masker.mask(`hex: ${hex}`)).toBe('hex: [REDACTED]');
	});

	it('masks base64url encoding', () => {
		const masker = new LogMasker();
		const value = 'hello';
		masker.register(value);
		const b64url = Buffer.from(value).toString('base64url');
		expect(masker.mask(`url: ${b64url}`)).toBe('url: [REDACTED]');
	});

	it('skips values shorter than 4 chars', () => {
		const masker = new LogMasker();
		masker.register('ab');
		// 'ab' is < 4 chars, should not be registered
		expect(masker.mask('ab is in the text')).toBe('ab is in the text');
	});

	it('skips empty string', () => {
		const masker = new LogMasker();
		masker.register('');
		expect(masker.mask('some text')).toBe('some text');
	});

	it('masks multiple secrets', () => {
		const masker = new LogMasker();
		masker.register('alpha');
		masker.register('beta1');
		const text = 'alpha and beta1 are secrets';
		const result = masker.mask(text);
		expect(result).not.toContain('alpha');
		expect(result).not.toContain('beta1');
	});

	it('returns text unchanged when no secrets registered', () => {
		const masker = new LogMasker();
		expect(masker.mask('nothing to hide')).toBe('nothing to hide');
	});

	it('handles regex special chars in secret value', () => {
		const masker = new LogMasker();
		masker.register('pa$$word');
		expect(masker.mask('password is pa$$word here')).toBe('password is [REDACTED] here');
	});

	it('masks secret embedded at base64 byte offset 1', () => {
		const masker = new LogMasker();
		const value = 'mysecret';
		masker.register(value);
		const raw = Buffer.from(value);
		const offset1 = Buffer.concat([Buffer.from([0x00]), raw]).toString('base64').replace(/=+$/, '').slice(2);
		expect(masker.mask(`data: ${offset1}`)).toBe('data: [REDACTED]');
	});

	it('masks secret embedded at base64 byte offset 2', () => {
		const masker = new LogMasker();
		const value = 'mysecret';
		masker.register(value);
		const raw = Buffer.from(value);
		const offset2 = Buffer.concat([Buffer.from([0x00, 0x00]), raw]).toString('base64').replace(/=+$/, '').slice(3);
		expect(masker.mask(`data: ${offset2}`)).toBe('data: [REDACTED]');
	});
});
