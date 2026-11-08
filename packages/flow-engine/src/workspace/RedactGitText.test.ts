import { describe, expect, it } from 'vitest';

import { redactGitText } from './RedactGitText';

describe('redactGitText', () => {
	it.each([
		["fatal: unable to access 'https://user:s3cret@github.com/o/r.git/': 403", 's3cret'],
		[
			'fatal: could not read from https://ghp_abcdefghijklmnopqrstuvwxyz0123456789@github.com/o/r',
			'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
		],
		['remote: token ghp_abcdefghijklmnopqrstuvwxyz0123456789 rejected', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
		[
			'using github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz',
			'github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz',
		],
		['http.extraheader: Authorization: Basic dXNlcjpwYXNzd29yZA==', 'dXNlcjpwYXNzd29yZA=='],
		['Authorization: Bearer abc.def.ghi-123456', 'abc.def.ghi-123456'],
		['password=hunter22 failed', 'hunter22'],
		['key AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEf used', 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEf'],
		['ssh://me:p@ss@host.example/repo.git', 'p@ss'],
	])('removes the secret from %j', (input, secret) => {
		const out = redactGitText(input);
		expect(out).not.toContain(secret);
		expect(out).toContain('***');
	});

	it('keeps host, path and the text git wrote around the secret', () => {
		expect(redactGitText("fatal: unable to access 'https://user:pw@github.com/o/r.git/': 403")).toBe(
			"fatal: unable to access 'https://***@github.com/o/r.git/': 403"
		);
	});

	it('keeps commit hashes, which are not secrets', () => {
		const sha = 'a'.repeat(40);
		expect(redactGitText(`HEAD is now at ${sha} init`)).toContain(sha);
	});

	it('caps the number of lines and their length and says how many were dropped', () => {
		const lines = Array.from({ length: 9 }, (_, i) => `line ${String(i)} ${'x '.repeat(400)}`).join('\n');
		const out = redactGitText(lines);
		expect(out.split('\n')).toHaveLength(6);
		expect(out).toContain('(4 more lines omitted)');
		expect(out.split('\n')[0]!.length).toBeLessThanOrEqual(301);
	});

	it('drops blank lines', () => {
		expect(redactGitText('\n\nfatal: x\n\n')).toBe('fatal: x');
	});
});
