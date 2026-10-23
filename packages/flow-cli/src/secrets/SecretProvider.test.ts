import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { SecretSourceError, SecretTooShortError, SecretUnresolvedError } from './SecretErrors';
import { SecretProvider } from './SecretProvider';

// Built at runtime from parts: a literal would trip secret scanners on the source file.
const GOOD = ['s3cr3t', '-valu', 'e-42'].join('');

describe('SecretProvider', () => {
	let workDir: string;

	beforeEach(() => {
		workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-provider-'));
	});

	afterEach(() => {
		fs.rmSync(workDir, { recursive: true, force: true });
	});

	describe('env:// scheme', () => {
		it('returns the value of the variable from the injected environment', () => {
			const provider = new SecretProvider(workDir, { MY_VAR: GOOD });
			expect(provider.resolve('TOKEN', 'env://MY_VAR').use()).toBe(GOOD);
		});

		it('fails with an actionable SecretUnresolvedError naming the secret, the variable and the daemon environment', () => {
			const provider = new SecretProvider(workDir, {});
			const attempt = (): unknown => provider.resolve('TOKEN', 'env://MY_VAR');
			expect(attempt).toThrow(SecretUnresolvedError);
			expect(attempt).toThrow(/'TOKEN'/);
			expect(attempt).toThrow(/MY_VAR/);
			expect(attempt).toThrow(/daemon/);
			expect(attempt).toThrow(/file:\/\//);
		});

		it('treats an empty variable as unresolved: an empty secret is never injected', () => {
			const provider = new SecretProvider(workDir, { MY_VAR: '' });
			expect(() => provider.resolve('TOKEN', 'env://MY_VAR')).toThrow(SecretUnresolvedError);
		});

		it('refuses a value shorter than the minimum with SecretTooShortError, without echoing it', () => {
			const provider = new SecretProvider(workDir, { MY_VAR: 'abc' });
			const attempt = (): unknown => provider.resolve('TOKEN', 'env://MY_VAR');
			expect(attempt).toThrow(SecretTooShortError);
			expect(attempt).toThrow(/at least 8/);
			expect(attempt).not.toThrow(/abc/);
		});
	});

	describe('file:// scheme', () => {
		it('reads a relative file and trims exactly one trailing newline', () => {
			fs.writeFileSync(path.join(workDir, 'secret.txt'), `${GOOD}\r\n`, 'utf8');
			const provider = new SecretProvider(workDir, {});
			expect(provider.resolve('TOKEN', 'file://./secret.txt').use()).toBe(GOOD);
		});

		it('fails with SecretUnresolvedError naming the file when it does not exist', () => {
			const provider = new SecretProvider(workDir, {});
			const attempt = (): unknown => provider.resolve('TOKEN', 'file://./missing.txt');
			expect(attempt).toThrow(SecretUnresolvedError);
			expect(attempt).toThrow(/missing\.txt/);
		});

		it('fails with SecretUnresolvedError when the file is empty', () => {
			fs.writeFileSync(path.join(workDir, 'empty.txt'), '\n', 'utf8');
			const provider = new SecretProvider(workDir, {});
			expect(() => provider.resolve('TOKEN', 'file://./empty.txt')).toThrow(SecretUnresolvedError);
		});

		it('refuses absolute paths with SecretSourceError', () => {
			const provider = new SecretProvider(workDir, {});
			const attempt = (): unknown => provider.resolve('TOKEN', 'file:///absolute-path/secret.txt');
			expect(attempt).toThrow(SecretSourceError);
			expect(attempt).toThrow(/[Aa]bsolute/);
		});

		it('refuses path traversal with SecretSourceError', () => {
			const provider = new SecretProvider(workDir, {});
			const attempt = (): unknown => provider.resolve('TOKEN', 'file://./a/../../outside.txt');
			expect(attempt).toThrow(SecretSourceError);
			expect(attempt).toThrow(/[Tt]raversal/);
		});
	});

	describe('refused references', () => {
		it.each([
			['input://other', /input:\/\//],
			['value://literal', /value:\/\//],
			['ftp://foo', /[Uu]nsupported|[Uu]nknown/],
			['literal-text', /env:\/\//],
		])('%s is refused with a SecretSourceError that tells which references are accepted', (reference, expected) => {
			const provider = new SecretProvider(workDir, {});
			const attempt = (): unknown => provider.resolve('TOKEN', reference);
			expect(attempt).toThrow(SecretSourceError);
			expect(attempt).toThrow(expected);
			expect(attempt).toThrow(/env:\/\/.*file:\/\//s);
		});

		it('never echoes a literal that was passed instead of a reference', () => {
			const provider = new SecretProvider(workDir, {});
			const attempt = (): unknown => provider.resolve('TOKEN', GOOD);
			expect(attempt).toThrow(SecretSourceError);
			expect(attempt).not.toThrow(new RegExp(GOOD));
		});
	});
});
