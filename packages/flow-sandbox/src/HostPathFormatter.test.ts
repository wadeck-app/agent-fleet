import { describe, expect, it } from 'vitest';

import { HostPathFormatter } from './HostPathFormatter';
import { failure } from './testing/ExpectedFailures';

describe('HostPathFormatter on Windows', () => {
	const formatter = new HostPathFormatter('win32');

	it('turns every accepted spelling into the Windows form', () => {
		const cases: [string, string, string][] = [
			['a native path', 'C:\\Users\\me\\ws', 'C:\\Users\\me\\ws'],
			['a lowercase drive', 'c:\\Users\\me', 'C:\\Users\\me'],
			['forward slashes', 'C:/Users/me/ws dir/', 'C:\\Users\\me\\ws dir\\'],
			['a Git Bash path', '/c/Users/me/ws dir', 'C:\\Users\\me\\ws dir'],
			['a Git Bash drive root', '/d', 'D:\\'],
			['a bare drive', 'C:', 'C:\\'],
			['a trailing slash', 'C:\\', 'C:\\'],
		];
		for (const [label, input, expected] of cases) {
			expect(formatter.toNative(input, 'Mount path'), label).toBe(expected);
		}
	});

	it('refuses what sbx.exe cannot open, naming the path kind and the fix', () => {
		const cases: [string, string][] = [
			['a UNC path', '\\\\server\\share\\x'],
			['a relative path', 'ws\\dir'],
			['a POSIX path that is not a drive', '/home/me'],
			['a drive-relative path', 'C:ws'],
			['an empty string', ''],
			['a newline', 'C:\\a\nb'],
		];
		for (const [label, input] of cases) {
			const error = failure(() => formatter.toNative(input, 'Mount path'), label);

			expect(error.kind, label).toBe('invalid-argument');
			expect(error.message, label).toContain('Mount path');
			expect(error.message, label).toContain('cannot be given to sbx');
			expect(error.message, label).toContain('Pass an absolute local path on a drive letter');
		}
	});
});

describe('HostPathFormatter on POSIX', () => {
	const formatter = new HostPathFormatter('linux');

	it('keeps an absolute path unchanged and refuses a relative path, a Windows path and an empty one', () => {
		expect(formatter.toNative('/home/me/ws dir/', 'Mount path')).toBe('/home/me/ws dir/');
		for (const input of ['relative/dir', 'C:\\Users\\me', '']) {
			expect(failure(() => formatter.toNative(input, 'Copy source path'), input).message, input).toContain(
				'Copy source path'
			);
		}
	});
});
