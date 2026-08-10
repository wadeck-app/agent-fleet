import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SecretProvider, SecretResolutionError } from './SecretProvider.js';

describe('SecretProvider', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	describe('env://', () => {
		it('resolves env var', () => {
			process.env['TEST_SECRET_VAR'] = 'env-value';
			try {
				const provider = new SecretProvider(tmpDir, {});
				const secret = provider.resolve('env://TEST_SECRET_VAR');
				expect(secret.use()).toBe('env-value');
			} finally {
				delete process.env['TEST_SECRET_VAR'];
			}
		});

		it('throws if env var is not set', () => {
			delete process.env['MISSING_ENV_VAR'];
			const provider = new SecretProvider(tmpDir, {});
			expect(() => provider.resolve('env://MISSING_ENV_VAR')).toThrow(SecretResolutionError);
		});
	});

	describe('file://', () => {
		it('resolves relative file', () => {
			const secretFile = path.join(tmpDir, 'secret.txt');
			fs.writeFileSync(secretFile, 'file-secret\n');
			const provider = new SecretProvider(tmpDir, {});
			const secret = provider.resolve('file://./secret.txt');
			expect(secret.use()).toBe('file-secret');
		});

		it('trims whitespace from file content', () => {
			const secretFile = path.join(tmpDir, 'secret.txt');
			fs.writeFileSync(secretFile, '  trimmed  \n');
			const provider = new SecretProvider(tmpDir, {});
			const secret = provider.resolve('file://./secret.txt');
			expect(secret.use()).toBe('trimmed');
		});

		it('throws for absolute paths', () => {
			const provider = new SecretProvider(tmpDir, {});
			const absolutePath = path.isAbsolute('/etc/passwd') ? '/etc/passwd' : 'C:\\Windows\\system32';
			expect(() => provider.resolve(`file://${absolutePath}`)).toThrow(SecretResolutionError);
		});

		it('throws if file does not exist', () => {
			const provider = new SecretProvider(tmpDir, {});
			expect(() => provider.resolve('file://./nonexistent.txt')).toThrow(SecretResolutionError);
		});

		it('throws for path traversal attempt (../../etc/passwd)', () => {
			const provider = new SecretProvider(tmpDir, {});
			expect(() => provider.resolve('file://../../etc/passwd')).toThrow(SecretResolutionError);
		});

		it('throws for path traversal with nested relative (../sibling/secret)', () => {
			const provider = new SecretProvider(tmpDir, {});
			expect(() => provider.resolve('file://../sibling/secret.txt')).toThrow(SecretResolutionError);
		});

		it('throws for symlink pointing outside workspaceDir', () => {
			if (process.platform === 'win32') return;
			const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-outside-'));
			try {
				const outsideFile = path.join(outsideDir, 'outside-secret.txt');
				fs.writeFileSync(outsideFile, 'leaked-secret');
				const linkPath = path.join(tmpDir, 'evil-link.txt');
				try {
					fs.symlinkSync(outsideFile, linkPath);
				} catch {
					// Symlink creation failed (e.g. insufficient privileges) — skip
					return;
				}
				const provider = new SecretProvider(tmpDir, {});
				expect(() => provider.resolve('file://./evil-link.txt')).toThrow(SecretResolutionError);
			} finally {
				fs.rmSync(outsideDir, { recursive: true, force: true });
			}
		});
	});

	describe('input://', () => {
		it('resolves from inputs', () => {
			const provider = new SecretProvider(tmpDir, { myInput: 'input-value' });
			const secret = provider.resolve('input://myInput');
			expect(secret.use()).toBe('input-value');
		});

		it('throws if input not provided', () => {
			const provider = new SecretProvider(tmpDir, {});
			expect(() => provider.resolve('input://missing')).toThrow(SecretResolutionError);
		});
	});

	describe('value://', () => {
		it('always throws', () => {
			const provider = new SecretProvider(tmpDir, {});
			expect(() => provider.resolve('value://plaintext')).toThrow(SecretResolutionError);
		});
	});

	describe('unknown scheme', () => {
		it('throws for unknown URI scheme', () => {
			const provider = new SecretProvider(tmpDir, {});
			expect(() => provider.resolve('unknown://something')).toThrow(SecretResolutionError);
		});
	});
});
