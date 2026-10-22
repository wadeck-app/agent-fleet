import { describe, expect, it } from 'vitest';

import { REDACTED_TEXT, isSecretName, redactSecretValue, redactSecrets } from './SecretRedaction.js';

describe('isSecretName', () => {
	it.each([
		'token',
		'GITHUB_TOKEN',
		'apiKey',
		'API_KEY',
		'ssh_key',
		'key',
		'password',
		'DB_PASSWD',
		'Authorization',
		'client_secret',
		'credentials',
	])('treats %s as secret', name => {
		expect(isSecretName(name)).toBe(true);
	});

	it.each(['monkey', 'keyboard', 'author', 'branch', 'prompt', 'env.PATH'])('does not treat %s as secret', name => {
		expect(isSecretName(name)).toBe(false);
	});
});

describe('redactSecretValue', () => {
	it('hides the value of a secret-named input and keeps the others', () => {
		expect(redactSecretValue('env.API_TOKEN', 'abc')).toBe(REDACTED_TEXT);
		expect(redactSecretValue('env.REGION', 'eu')).toBe('eu');
	});
});

describe('redactSecrets', () => {
	it('redacts KEY=value and key: value assignments of secret-named keys', () => {
		const text = 'start\nGITHUB_TOKEN=ghp_abcdefghijklmnop1234\npassword: hunter2\nregion=eu';
		const out = redactSecrets(text);
		expect(out).not.toContain('ghp_abcdefghijklmnop1234');
		expect(out).not.toContain('hunter2');
		expect(out).toContain('GITHUB_TOKEN=' + REDACTED_TEXT);
		expect(out).toContain('region=eu');
	});

	it('redacts quoted JSON values and Authorization headers with their scheme', () => {
		const out = redactSecrets('{"client_secret": "s3cr3t value", "ok": 1}\nAuthorization: Bearer abc.def.ghi');
		expect(out).not.toContain('s3cr3t');
		expect(out).not.toContain('abc.def.ghi');
		expect(out).toContain('"ok": 1');
	});

	it('redacts bare bearer tokens and well-known token prefixes', () => {
		const out = redactSecrets('curl -H "x: Bearer abcdefghijklmnop" and ghp_0123456789abcdefghij0123');
		expect(out).not.toContain('abcdefghijklmnop');
		expect(out).not.toContain('ghp_0123456789abcdefghij0123');
	});

	it('leaves a text without secrets unchanged', () => {
		const text = 'exit 1: 3 tests failed\nat src/a.ts:12';
		expect(redactSecrets(text)).toBe(text);
	});
});
