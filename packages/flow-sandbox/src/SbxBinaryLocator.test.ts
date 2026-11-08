import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { SbxBinaryLocator, type SbxBinaryLocatorOptions } from './SbxBinaryLocator';
import { eachRow } from './testing/EachRow';
import { failure } from './testing/ExpectedFailures';

const NODE = 'node-for-tests';

function locator(existing: string[], options: Partial<SbxBinaryLocatorOptions> = {}): SbxBinaryLocator {
	return new SbxBinaryLocator({
		env: {},
		platform: 'win32',
		nodeExecutable: NODE,
		fileExists: candidate => existing.includes(candidate),
		...options,
	});
}

const WINDOWS_DEFAULT = 'C:\\Users\\me\\AppData\\Local\\DockerSandboxes\\bin\\sbx.exe';

describe('SbxBinaryLocator explicit configuration', () => {
	it('runs an executable directly', () => {
		const binary = locator(['C:\\tools\\sbx.exe'], { binaryPath: 'C:\\tools\\sbx.exe' }).locate();

		expect(binary).toEqual({ command: 'C:\\tools\\sbx.exe', prefixArgs: [], displayPath: 'C:\\tools\\sbx.exe' });
	});

	it('runs the script (each case) through node', () =>
		eachRow([['mock.mjs'], ['mock.js'], ['mock.cjs'], ['MOCK.MJS']], script => {
			const full = `/tmp/${script}`;

			const binary = locator([full], { binaryPath: full, platform: 'linux' }).locate();

			expect(binary).toEqual({ command: NODE, prefixArgs: [full], displayPath: full });
		}));

	it('prefers the option over SBX_MOCK_PATH over SBX_PATH', () => {
		const existing = ['/a/option', '/b/mock', '/c/path'];
		const env = { SBX_MOCK_PATH: '/b/mock', SBX_PATH: '/c/path' };

		expect(locator(existing, { binaryPath: '/a/option', env, platform: 'linux' }).locate().displayPath).toBe(
			'/a/option'
		);
		expect(locator(existing, { env, platform: 'linux' }).locate().displayPath).toBe('/b/mock');
		expect(locator(existing, { env: { SBX_PATH: '/c/path' }, platform: 'linux' }).locate().displayPath).toBe(
			'/c/path'
		);
	});

	it('ignores empty settings', () => {
		const binary = locator([WINDOWS_DEFAULT], {
			binaryPath: '',
			env: { SBX_MOCK_PATH: '', SBX_PATH: '', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' },
		}).locate();

		expect(binary.displayPath).toBe(WINDOWS_DEFAULT);
	});

	it('fails when the file configured through (each case) does not exist, and does not fall back to another sbx', () =>
		eachRow(
			[
				['the "binaryPath" option', { binaryPath: '/nope/sbx' }],
				['SBX_MOCK_PATH', { env: { SBX_MOCK_PATH: '/nope/sbx' } }],
				['SBX_PATH', { env: { SBX_PATH: '/nope/sbx' } }],
			],
			(source, options) => {
				const error = failure(() =>
					locator([WINDOWS_DEFAULT, '/usr/bin/sbx'], { ...options, platform: 'linux' }).locate()
				);

				expect(error.kind).toBe('binary-missing');
				expect(error.message).toBe(
					`The sbx executable configured through ${source} does not exist: "/nope/sbx". Fix the path or remove the setting to use the default location.`
				);
			}
		));

	it('treats a directory as missing with the real file system check', () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'locator-dir-'));
		afterEachCleanup.push(directory);

		const error = failure(() =>
			new SbxBinaryLocator({
				binaryPath: directory,
				env: {},
				platform: process.platform,
				nodeExecutable: NODE,
			}).locate()
		);

		expect(error.message).toContain(`does not exist: "${directory}"`);
	});

	it('accepts a real file with the real file system check', () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'locator-file-'));
		afterEachCleanup.push(directory);
		const file = path.join(directory, 'sbx-real.mjs');
		fs.writeFileSync(file, '');

		const binary = new SbxBinaryLocator({
			binaryPath: file,
			env: {},
			platform: process.platform,
			nodeExecutable: NODE,
		}).locate();

		expect(binary.prefixArgs).toEqual([file]);
	});
});

const afterEachCleanup: string[] = [];
afterEach(() => {
	for (const directory of afterEachCleanup.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('SbxBinaryLocator default locations', () => {
	it('finds the Windows install directory first', () => {
		const binary = locator([WINDOWS_DEFAULT, 'C:\\tools\\sbx.exe'], {
			env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', PATH: 'C:\\tools' },
		}).locate();

		expect(binary.displayPath).toBe(WINDOWS_DEFAULT);
	});

	it('then searches PATH with the Windows executable names, accepting the Path spelling', () => {
		const viaPath = locator(['C:\\tools\\sbx.exe'], { env: { PATH: 'C:\\a;C:\\tools' } }).locate();
		const viaCmd = locator(['C:\\tools\\sbx.cmd'], { env: { Path: 'C:\\a;C:\\tools' } }).locate();

		expect(viaPath.displayPath).toBe('C:\\tools\\sbx.exe');
		expect(viaCmd.displayPath).toBe('C:\\tools\\sbx.cmd');
	});

	it('searches PATH on POSIX without the Windows directory', () => {
		const binary = locator(['/opt/sbx/sbx', WINDOWS_DEFAULT], {
			platform: 'linux',
			env: { PATH: '/usr/bin:/opt/sbx', LOCALAPPDATA: 'C:\\x' },
		}).locate();

		expect(binary.displayPath).toBe('/opt/sbx/sbx');
	});

	it('lists where it looked and how to fix, when nothing is found on Windows', () => {
		const error = failure(() =>
			locator([], { env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', PATH: 'C:\\a' } }).locate()
		);

		expect(error.kind).toBe('binary-missing');
		expect(error.message).toBe(
			`The sbx executable (Docker Sandboxes) was not found. Looked in: ${WINDOWS_DEFAULT}, PATH. ` +
				'Install sbx 0.51.0 (https://github.com/docker/sbx-releases/releases/tag/v0.51.0), then either add it to PATH, ' +
				'set the SBX_PATH environment variable to the executable, or pass the "binaryPath" option.'
		);
	});

	it('looks only in PATH when there is no Windows install directory to try', () => {
		const withoutAppData = failure(() => locator([], { env: { PATH: '' } }).locate());
		const onLinux = failure(() =>
			locator([], { platform: 'linux', env: { PATH: '/usr/bin', LOCALAPPDATA: 'C:\\x' } }).locate()
		);

		expect(withoutAppData.message).toContain('Looked in: PATH.');
		expect(onLinux.message).toContain('Looked in: PATH.');
	});
});
