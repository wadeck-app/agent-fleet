import type { HostTool } from 'flow-engine';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HostToolExecutableError, HostToolExecutableResolver } from './HostToolExecutableResolver';

const tool = (command0: string): HostTool => ({
	id: 'show-task',
	description: 'd',
	sideEffect: 'read',
	command: [command0],
});

describe('HostToolExecutableResolver', () => {
	let directory: string;
	let binDir: string;

	const write = (name: string, content = 'x', mode = 0o755): string => {
		const file = path.join(binDir, name);
		fs.writeFileSync(file, content, { mode });
		return file;
	};
	const resolverFor = (platform: NodeJS.Platform, extra: Record<string, string> = {}): HostToolExecutableResolver =>
		new HostToolExecutableResolver({
			platform,
			environment: { PATH: [path.join(directory, 'missing'), binDir].join(path.delimiter), ...extra },
		});

	beforeEach(() => {
		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-hosttool-resolver-'));
		binDir = path.join(directory, 'bin');
		fs.mkdirSync(binDir);
	});
	afterEach(() => {
		fs.rmSync(directory, { recursive: true, force: true });
	});

	it('resolves a bare name through PATH to an absolute path and records its identity', () => {
		const file = write('taskcli', 'abc');
		const resolved = resolverFor('linux').resolve('triage', tool('taskcli'));
		expect(resolved.absolutePath).toBe(file);
		expect(resolved.size).toBe(3);
		expect(resolved.mtimeMs).toBe(fs.statSync(file).mtimeMs);
		expect(resolved.toolId).toBe('show-task');
	});

	it('accepts an absolute path as given', () => {
		const file = write('taskcli');
		expect(resolverFor('linux').resolve('s', tool(file)).absolutePath).toBe(file);
	});

	it.each([['./taskcli'], ['bin/taskcli'], ['..\\taskcli']])(
		'refuses the relative path %s in slice 1 with an actionable error',
		command => {
			expect(() => resolverFor('linux').resolve('triage', tool(command))).toThrow(
				new RegExp(`Step 'triage' tool 'show-task': .*relative path.*Fix: .*absolute path or a bare name`)
			);
		}
	);

	it('names the step, the tool, the executable and the PATH searched when nothing is found', () => {
		const error = (() => {
			try {
				resolverFor('linux').resolve('triage', tool('nope'));
			} catch (caught) {
				return caught as Error;
			}
			throw new Error('expected resolve to throw');
		})();
		expect(error).toBeInstanceOf(HostToolExecutableError);
		expect(error.message).toContain("Step 'triage' tool 'show-task'");
		expect(error.message).toContain("'nope'");
		expect(error.message).toContain(binDir);
		expect(error.message).toMatch(/Fix:/);
	});

	it('says so when PATH is not set at all', () => {
		const resolver = new HostToolExecutableResolver({ platform: 'linux', environment: {} });
		expect(() => resolver.resolve('s', tool('x'))).toThrow(/PATH is not set/);
	});

	it('refuses a directory and (on POSIX) a file that is not executable', () => {
		fs.mkdirSync(path.join(binDir, 'adir'));
		expect(() => resolverFor('linux').resolve('s', tool('adir'))).toThrow(/not found/);
		if (process.platform !== 'win32') {
			write('plain', 'x', 0o644);
			expect(() => resolverFor('linux').resolve('s', tool('plain'))).toThrow(/not found/);
		}
	});

	describe('Windows rules (platform injected, so the same assertions run everywhere)', () => {
		it('honours PATHEXT: a bare name finds name.exe', () => {
			const file = write('taskcli.EXE');
			const resolved = resolverFor('win32', { PATHEXT: '.COM;.EXE;.CMD' }).resolve('s', tool('taskcli'));
			expect(resolved.absolutePath.toLowerCase()).toBe(file.toLowerCase());
		});

		it.each([['.cmd'], ['.bat'], ['.CMD']])(
			'refuses a %s target with a named error (cmd.exe would re-parse the arguments)',
			extension => {
				write(`taskcli${extension}`);
				// Both cases are listed so that the lookup also finds the file on a case-sensitive file system.
				expect(() =>
					resolverFor('win32', { PATHEXT: '.COM;.EXE;.BAT;.CMD;.bat;.cmd' }).resolve(
						'triage',
						tool('taskcli')
					)
				).toThrow(new RegExp(`Step 'triage' tool 'show-task': .*taskcli\\${extension}.*cmd.exe.*Fix: `, 'i'));
			}
		);

		it('refuses an explicit .cmd path too', () => {
			const file = write('taskcli.cmd');
			expect(() => resolverFor('win32').resolve('s', tool(file))).toThrow(/cmd\.exe/);
		});
	});

	describe('verify (TOCTOU, F-16)', () => {
		it('passes while path and identity are unchanged', () => {
			write('taskcli', 'abc');
			const resolver = resolverFor('linux');
			expect(() => resolver.verify('s', resolver.resolve('s', tool('taskcli')))).not.toThrow();
		});

		it.each([
			{ name: 'the content size changes', change: (file: string) => fs.writeFileSync(file, 'abcdef') },
			{
				name: 'the modification time changes',
				change: (file: string) => fs.utimesSync(file, new Date(2001, 1, 1), new Date(2001, 1, 1)),
			},
			{ name: 'the file is removed', change: (file: string) => fs.rmSync(file) },
		])('refuses with a named error when $name', ({ change }) => {
			const file = write('taskcli', 'abc');
			const resolver = resolverFor('linux');
			const resolved = resolver.resolve('triage', tool('taskcli'));
			change(file);
			expect(() => resolver.verify('triage', resolved)).toThrow(
				new RegExp(`Step 'triage' tool 'show-task': .*changed.*Fix: `)
			);
		});
	});

	it('resolveAll fails on the first tool that cannot be resolved, naming it', () => {
		write('ok');
		const resolver = resolverFor('linux');
		expect(() => resolver.resolveAll('s', [tool('ok'), { ...tool('missing'), id: 'second' }])).toThrow(
			/tool 'second'/
		);
	});
});
