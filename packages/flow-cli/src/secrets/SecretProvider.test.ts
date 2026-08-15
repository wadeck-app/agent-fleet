import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { SecretProvider, SecretResolutionError } from './SecretProvider';

describe('SecretProvider', () => {
	let tmpDir: string;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterAll(() => {
		if (tmpDir) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	describe('env:// scheme', () => {
		it('returns a Secret with the env var value when the variable is set', () => {
			process.env['TEST_SECRET_XYZ'] = 'myvalue';
			try {
				const provider = new SecretProvider('/tmp', {});
				const secret = provider.resolve('env://TEST_SECRET_XYZ');
				expect(secret.use()).toBe('myvalue');
			} finally {
				delete process.env['TEST_SECRET_XYZ'];
			}
		});

		it('throws SecretResolutionError containing the env var name when variable is not set', () => {
			delete process.env['TEST_SECRET_MISSING_XYZ'];
			const provider = new SecretProvider('/tmp', {});
			expect(() => provider.resolve('env://TEST_SECRET_MISSING_XYZ')).toThrow(SecretResolutionError);
			expect(() => provider.resolve('env://TEST_SECRET_MISSING_XYZ')).toThrow('TEST_SECRET_MISSING_XYZ');
		});
	});

	describe('file:// scheme', () => {
		it('reads file content from a relative path within the workspace', () => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-provider-'));
			const secretFile = path.join(tmpDir, 'secret.txt');
			fs.writeFileSync(secretFile, 's3cr3t-value', 'utf8');

			const provider = new SecretProvider(tmpDir, {});
			const secret = provider.resolve('file://./secret.txt');
			expect(secret.use()).toBe('s3cr3t-value');
		});

		it('throws SecretResolutionError for absolute file paths', () => {
			const provider = new SecretProvider('/tmp', {});
			expect(() => provider.resolve('file:///absolute-path/secret.txt')).toThrow(SecretResolutionError);
			expect(() => provider.resolve('file:///absolute-path/secret.txt')).toThrow(/[Aa]bsolute/);
		});

		it('throws SecretResolutionError on path traversal attempts', () => {
			tmpDir = tmpDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'secret-provider-'));
			const provider = new SecretProvider(tmpDir, {});
			expect(() => provider.resolve('file://./traversal/../../etc/passwd')).toThrow(SecretResolutionError);
			expect(() => provider.resolve('file://./traversal/../../etc/passwd')).toThrow(/[Tt]raversal/);
		});
	});

	describe('input:// scheme', () => {
		it('returns a Secret with the input value when the input is provided', () => {
			const provider = new SecretProvider('/tmp', { myToken: 'abc123' });
			const secret = provider.resolve('input://myToken');
			expect(secret.use()).toBe('abc123');
		});

		it('throws SecretResolutionError when the input name is not provided', () => {
			const provider = new SecretProvider('/tmp', {});
			expect(() => provider.resolve('input://missingInput')).toThrow(SecretResolutionError);
			expect(() => provider.resolve('input://missingInput')).toThrow('missingInput');
		});
	});

	describe('value:// scheme', () => {
		it('throws SecretResolutionError because value:// is forbidden in secrets', () => {
			const provider = new SecretProvider('/tmp', {});
			expect(() => provider.resolve('value://literal')).toThrow(SecretResolutionError);
			expect(() => provider.resolve('value://literal')).toThrow(/value:\/\//);
		});
	});

	describe('unknown schemes', () => {
		it('throws SecretResolutionError for unrecognised URI schemes', () => {
			const provider = new SecretProvider('/tmp', {});
			expect(() => provider.resolve('ftp://foo')).toThrow(SecretResolutionError);
			expect(() => provider.resolve('ftp://foo')).toThrow(/[Uu]nknown/);
		});
	});
});
