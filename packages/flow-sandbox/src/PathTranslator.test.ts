import { describe, expect, it } from 'vitest';

import { PathTranslator } from './PathTranslator';
import { failure } from './testing/ExpectedFailures';

// Explicit Windows fixtures: these tests run the same on Linux CI because the platform is injected.
const WORKSPACE = 'C:\\Users\\me\\flow\\ws one';
const META = 'C:\\Users\\me\\flow\\ws one.meta';

function windows(): PathTranslator {
	return new PathTranslator({ workspaceDir: WORKSPACE, workspaceMetaDir: META, platform: 'win32' });
}

function posix(): PathTranslator {
	return new PathTranslator({ workspaceDir: '/work/ws', workspaceMetaDir: '/work/ws.meta', platform: 'linux' });
}

/** Every case must be refused as path-outside-mounts with the given text. The label names the case on failure. */
function expectRefused(
	translate: (path: string) => unknown,
	cases: readonly (readonly [label: string, path: string, message: string])[]
): void {
	for (const [label, path, message] of cases) {
		const error = failure(() => translate(path), label);
		expect(error.kind, label).toBe('path-outside-mounts');
		expect(error.message, label).toContain(message);
	}
}

describe('PathTranslator spellings (the mounted directory is the resolved one, the engine keeps its own spelling)', () => {
	// The translator is pure (the platform is a parameter): these rows run on every host.
	const posixOnly = it;
	const make = (): PathTranslator =>
		new PathTranslator({
			workspaceDir: '/real/slots/slot-1',
			workspaceMetaDir: '/real/runs/r1.meta',
			workspaceDirSpelling: '/links/slot-1',
			workspaceMetaDirSpelling: '/links/r1.meta',
			platform: 'linux',
		});

	posixOnly('translates both spellings of a mount to the sandbox form of the mounted directory', () => {
		const translator = make();

		expect(translator.toSandbox('/links/slot-1/a/b.txt', 'p')).toBe('/real/slots/slot-1/a/b.txt');
		expect(translator.toSandbox('/real/slots/slot-1/a/b.txt', 'p')).toBe('/real/slots/slot-1/a/b.txt');
		expect(translator.toSandbox('/links/r1.meta/outputs', 'p')).toBe('/real/runs/r1.meta/outputs');
	});

	posixOnly('maps a sandbox path back to the mounted (resolved) host spelling', () => {
		expect(make().toHost('/real/slots/slot-1/a.txt', 'p')).toBe('/real/slots/slot-1/a.txt');
	});

	posixOnly('accepts either spelling as the mounted directory in an execution context', () => {
		const translated = make().translateExecutionContext({
			workspaceDir: '/links/slot-1',
			outputsDir: '/links/r1.meta/outputs',
			workspaceMetaDir: '/real/runs/r1.meta',
			cwd: '/links/slot-1/sub',
		});

		expect(translated).toEqual({
			workspaceDir: '/real/slots/slot-1',
			outputsDir: '/real/runs/r1.meta/outputs',
			workspaceMetaDir: '/real/runs/r1.meta',
			cwd: '/real/slots/slot-1/sub',
		});
	});

	posixOnly('still refuses anything outside both spellings, a path next to the link, and a .. segment', () => {
		const translator = make();

		expect(() => translator.toSandbox('/links/other/a.txt', 'p')).toThrow(/is outside the/);
		expect(() => translator.toSandbox('/links/slot-1x/a.txt', 'p')).toThrow(/is outside the/);
		expect(() => translator.toSandbox('/links/slot-1/../x', 'p')).toThrow();
	});
});

describe('PathTranslator toSandbox (Windows host)', () => {
	it('maps every accepted spelling of a path inside a mount', () => {
		const cases: [string, string, string][] = [
			['the workspace itself', WORKSPACE, '/c/Users/me/flow/ws one'],
			['a file in the workspace', `${WORKSPACE}\\src\\a.ts`, '/c/Users/me/flow/ws one/src/a.ts'],
			['the meta directory', META, '/c/Users/me/flow/ws one.meta'],
			['the outputs directory', `${META}\\outputs`, '/c/Users/me/flow/ws one.meta/outputs'],
			['forward slashes', 'C:/Users/me/flow/ws one/src/a.ts', '/c/Users/me/flow/ws one/src/a.ts'],
			['a trailing backslash', `${WORKSPACE}\\`, '/c/Users/me/flow/ws one'],
			[
				'names that only start like a device name',
				`${WORKSPACE}\\console\\com10.txt`,
				'/c/Users/me/flow/ws one/console/com10.txt',
			],
			['a trailing slash after a subdirectory', `${WORKSPACE}/src/`, '/c/Users/me/flow/ws one/src'],
			[
				'duplicate separators and dot segments',
				`C:\\Users\\\\me\\flow\\.\\ws one\\\\src\\.\\a.ts`,
				'/c/Users/me/flow/ws one/src/a.ts',
			],
			['a lowercase drive letter', 'c:\\Users\\me\\flow\\ws one\\a.ts', '/c/Users/me/flow/ws one/a.ts'],
			['spaces inside names', `${WORKSPACE}\\my docs\\read me.md`, '/c/Users/me/flow/ws one/my docs/read me.md'],
			[
				'a differently cased mount part (rebuilt from the mount spelling, the rest kept as given)',
				'c:\\USERS\\ME\\FLOW\\WS ONE\\Sub\\File.TXT',
				'/c/Users/me/flow/ws one/Sub/File.TXT',
			],
		];
		for (const [label, host, expected] of cases) expect(windows().toSandbox(host, 'cwd'), label).toBe(expected);
	});

	it('names the label and both mounts when a sibling sharing the mount name as a prefix or a parent is refused', () => {
		const sibling = failure(() => windows().toSandbox('C:\\Users\\me\\flow\\ws one2\\x', 'cwd'));
		expect(sibling.kind).toBe('path-outside-mounts');
		expect(sibling.message).toContain('cwd "C:\\Users\\me\\flow\\ws one2\\x" is outside the sandbox mounts');

		const parent = failure(() => windows().toSandbox('C:\\Users\\me\\flow', 'outputsDir'));
		expect(parent.message).toContain(
			'workspaceDir (C:\\Users\\me\\flow\\ws one) and workspaceMetaDir (C:\\Users\\me\\flow\\ws one.meta)'
		);
	});

	it('refuses every path outside the mounts, with parent segments, UNC and device paths, and Windows-special names', () => {
		expectRefused(
			path => windows().toSandbox(path, 'cwd'),
			[
				['a parent directory', 'C:\\Users\\me\\flow', 'is outside the sandbox mounts'],
				['the drive root', 'C:\\', 'is outside the sandbox mounts'],
				['another drive', 'D:\\Users\\me\\flow\\ws one\\a', 'is outside the sandbox mounts'],
				['a .. segment staying inside', `${WORKSPACE}\\src\\..\\a.ts`, 'contains ".."'],
				['a .. segment leaving the mount', `${WORKSPACE}\\..\\..\\secret`, 'contains ".."'],
				['a .. segment in forward-slash form', 'C:/Users/me/flow/ws one/../x', 'contains ".."'],
				['a UNC path', '\\\\server\\share\\ws one', 'UNC and device paths'],
				['a UNC path with forward slashes', '//server/share/ws one', 'UNC and device paths'],
				['a long-path prefix', '\\\\?\\C:\\Users\\me\\flow\\ws one', 'UNC and device paths'],
				['a device path', '\\\\.\\C:\\x', 'UNC and device paths'],
				['a relative path', 'ws one\\a.ts', 'only absolute drive-letter paths'],
				['a drive-relative path', 'C:ws one\\a.ts', 'only absolute drive-letter paths'],
				['a drive without a directory', 'C:', 'only absolute drive-letter paths'],
				['an alternate data stream', `${WORKSPACE}\\a.txt:hidden`, 'has a character Windows treats specially'],
				['a trailing dot segment', `${WORKSPACE}\\dir.\\a`, 'has a character Windows treats specially'],
				['a wildcard segment', `${WORKSPACE}\\*`, 'has a character Windows treats specially'],
				['a reserved device name', `${WORKSPACE}\\NUL`, 'reserved Windows device name'],
				[
					'a reserved name with an extension, any case',
					`${WORKSPACE}\\src\\Com1.txt`,
					'reserved Windows device name',
				],
				[
					'a reserved name with several extensions',
					`${WORKSPACE}\\out\\con.tar.gz`,
					'reserved Windows device name',
				],
				['the highest LPT port', `${WORKSPACE}\\lpt9`, 'reserved Windows device name'],
				['a POSIX style host path', '/c/Users/me/flow/ws one', 'only absolute drive-letter paths'],
				['an empty string', '', 'it is empty'],
				['a NUL character', `${WORKSPACE}\\a\0b`, 'it contains a NUL character'],
			]
		);
	});
});

describe('PathTranslator toHost (Windows host)', () => {
	it('maps sandbox paths back to host paths, spaces and trailing slashes included', () => {
		const cases: [string, string, string][] = [
			['the workspace', '/c/Users/me/flow/ws one', WORKSPACE],
			['a file in the workspace', '/c/Users/me/flow/ws one/out/a.txt', `${WORKSPACE}\\out\\a.txt`],
			['a file in the meta directory', '/c/Users/me/flow/ws one.meta/outputs/r.json', `${META}\\outputs\\r.json`],
			['a trailing slash', '/c/Users/me/flow/ws one/out/', `${WORKSPACE}\\out`],
			['spaces', '/c/Users/me/flow/ws one/my docs/read me.md', `${WORKSPACE}\\my docs\\read me.md`],
		];
		for (const [label, sandboxPath, expected] of cases) {
			expect(windows().toHost(sandboxPath, 'result'), label).toBe(expected);
		}
	});

	it('refuses every sandbox path that leaves the mounts or would turn into another host path', () => {
		expectRefused(
			path => windows().toHost(path, 'result'),
			[
				['a .. segment', '/c/Users/me/flow/ws one/../other', 'contains ".."'],
				[
					'a .. segment leaving through the meta mount',
					'/c/Users/me/flow/ws one.meta/../../x',
					'contains ".."',
				],
				['a system path', '/etc/passwd', 'starts with a lowercase drive letter'],
				['another drive', '/d/Users/me/flow/ws one/a', 'is outside the sandbox mounts'],
				['an uppercase drive letter', '/C/Users/me/flow/ws one/a', 'starts with a lowercase drive letter'],
				[
					'a differently cased directory (the sandbox is case-sensitive)',
					'/c/users/me/flow/ws one/a',
					'is outside the sandbox mounts',
				],
				[
					'a sibling sharing the mount name as a prefix',
					'/c/Users/me/flow/ws one2/a',
					'is outside the sandbox mounts',
				],
				['the parent of the mounts', '/c/Users/me/flow', 'is outside the sandbox mounts'],
				[
					'a backslash that would become a separator',
					'/c/Users/me/flow/ws one/a\\..\\..\\b',
					'contains a backslash',
				],
				['a relative path', 'c/Users/me/flow/ws one/a', 'must be absolute'],
				['a colon in a name', '/c/Users/me/flow/ws one/a:b', 'cannot be a Windows file name'],
				['a trailing space segment', '/c/Users/me/flow/ws one/a /b', 'cannot be a Windows file name'],
				['a reserved device name', '/c/Users/me/flow/ws one/Aux.log', 'reserved Windows device name'],
				['a reserved name in a subdirectory', '/c/Users/me/flow/ws one/lpt1/a', 'reserved Windows device name'],
				['the root', '/', 'starts with a lowercase drive letter'],
			]
		);
	});

	it('round-trips every accepted host path', () => {
		const translator = windows();
		for (const host of [
			WORKSPACE,
			`${WORKSPACE}\\a b\\c.txt`,
			`${META}\\outputs`,
			`${META}\\sessions\\claude\\x.jsonl`,
		]) {
			expect(translator.toHost(translator.toSandbox(host, 'x'), 'x')).toBe(host);
		}
	});
});

describe('PathTranslator translateExecutionContext', () => {
	const context = {
		workspaceDir: WORKSPACE,
		outputsDir: `${META}\\outputs`,
		workspaceMetaDir: META,
	};

	it('translates the four paths of a context, omits cwd when there is none, and accepts a mount spelled in another case', () => {
		expect(windows().translateExecutionContext({ ...context, cwd: `${WORKSPACE}\\packages\\app` })).toEqual({
			workspaceDir: '/c/Users/me/flow/ws one',
			outputsDir: '/c/Users/me/flow/ws one.meta/outputs',
			workspaceMetaDir: '/c/Users/me/flow/ws one.meta',
			cwd: '/c/Users/me/flow/ws one/packages/app',
		});
		expect('cwd' in windows().translateExecutionContext(context)).toBe(false);
		expect(
			windows().translateExecutionContext({ ...context, workspaceDir: `${WORKSPACE.toUpperCase()}\\` })
				.workspaceDir
		).toBe('/c/Users/me/flow/ws one');
	});

	it('names the offending path of a context that is not the mounts or leaves them', () => {
		const cases: [string, Partial<typeof context & { cwd: string }>, string][] = [
			['a workspaceDir that is not the mount', { workspaceDir: `${WORKSPACE}\\sub` }, 'workspaceDir'],
			['a workspaceMetaDir that is not the mount', { workspaceMetaDir: `${META}\\outputs` }, 'workspaceMetaDir'],
			['an outputsDir outside the mounts', { outputsDir: 'C:\\Users\\me\\elsewhere' }, 'outputsDir'],
			['a cwd outside the mounts', { cwd: 'C:\\Users\\me' }, 'cwd'],
			['a cwd with ..', { cwd: `${WORKSPACE}\\..` }, 'cwd'],
		];
		for (const [label, override, name] of cases) {
			const error = failure(() => windows().translateExecutionContext({ ...context, ...override }), label);
			expect(error.kind, label).toBe('path-outside-mounts');
			expect(error.message, label).toContain(name);
		}
	});
});

describe('PathTranslator construction', () => {
	it('refuses mounts nested in each other and an invalid mount', () => {
		const nested = failure(
			() =>
				new PathTranslator({
					workspaceDir: WORKSPACE,
					workspaceMetaDir: `${WORKSPACE}\\.meta`,
					platform: 'win32',
				})
		);
		expect(nested.message).toContain('two separate directories');

		const invalid = failure(
			() => new PathTranslator({ workspaceDir: '\\\\server\\share', workspaceMetaDir: META, platform: 'win32' })
		);
		expect(invalid.message).toContain('workspaceDir');
		expect(invalid.message).toContain('UNC');
	});
});

describe('PathTranslator on a POSIX host', () => {
	it('keeps the same path on both sides', () => {
		const translator = posix();

		expect(translator.toSandbox('/work/ws/src/a.ts', 'cwd')).toBe('/work/ws/src/a.ts');
		expect(translator.toSandbox('/work/ws.meta/outputs/', 'cwd')).toBe('/work/ws.meta/outputs');
		expect(translator.toHost('/work/ws/src//a.ts', 'result')).toBe('/work/ws/src/a.ts');
	});

	it('refuses relative paths, parent segments, other mounts, other case and prefix siblings, on both sides', () => {
		expectRefused(
			path => posix().toSandbox(path, 'cwd'),
			[
				['a relative path (host side)', 'work/ws/a', 'not an absolute path'],
				['a .. segment (host side)', '/work/ws/../x', 'contains ".."'],
				['a path outside the mounts (host side)', '/work/other', 'is outside the sandbox mounts'],
				['another case, POSIX is case-sensitive (host side)', '/Work/ws/a', 'is outside the sandbox mounts'],
				['a sibling sharing a prefix (host side)', '/work/ws2/a', 'is outside the sandbox mounts'],
			]
		);
		expectRefused(
			path => posix().toHost(path, 'result'),
			[
				['a relative path (sandbox side)', 'work/ws/a', 'must be absolute'],
				['a backslash (sandbox side)', '/work/ws/a\\b', 'contains a backslash'],
				['a .. segment (sandbox side)', '/work/ws/../x', 'contains ".."'],
				['a path outside the mounts (sandbox side)', '/etc/passwd', 'is outside the sandbox mounts'],
			]
		);
	});
});

describe('PathTranslator warnings for untranslated Windows paths', () => {
	it('reports Windows paths in env values with the variable name and does not change them', () => {
		const env = {
			REPORT: 'C:\\Users\\me\\flow\\ws one\\out.txt',
			PATH_LIST: 'c:/tools;D:\\more tools\\bin',
			PLAIN: '/c/Users/me/x',
			URL: 'https://example.com/path',
		};

		const warnings = windows().findWindowsPathsInEnv(env);

		expect(warnings.map(w => [w.location, w.match])).toEqual([
			['env REPORT', 'C:\\Users\\me\\flow\\ws'],
			['env PATH_LIST', 'c:/tools'],
			['env PATH_LIST', 'D:\\more'],
		]);
		expect(warnings[0]?.message).toContain('NOT translated');
		expect(warnings[0]?.message).toContain('/c/...');
		expect(env.REPORT).toBe('C:\\Users\\me\\flow\\ws one\\out.txt');
	});

	it('reports Windows and UNC paths in script text with line numbers, CRLF included, and nothing for POSIX paths', () => {
		const script = [
			'#!/usr/bin/env bash',
			'cd "C:\\Users\\me\\flow"',
			'cp a.txt c:/tmp/b.txt',
			'echo "http://example.com/x and s3://bucket/key"',
			'ls \\\\server\\share\\dir',
			'file:///C:/Temp/x',
		].join('\r\n');

		const warnings = windows().findWindowsPathsInScript(script);

		expect(warnings.map(w => [w.location, w.match])).toEqual([
			['script line 2', 'C:\\Users\\me\\flow'],
			['script line 3', 'c:/tmp/b.txt'],
			['script line 5', '\\\\server\\share\\dir'],
			['script line 6', 'C:/Temp/x'],
		]);
		expect(windows().findWindowsPathsInScript('copy C:\\a D:\\b')).toHaveLength(2);
		expect(windows().findWindowsPathsInScript('cd /c/Users/me && ls /work/ws')).toEqual([]);
		expect(windows().findWindowsPathsInEnv({})).toEqual([]);
	});
});
