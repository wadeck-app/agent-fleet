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

	describe('relative or empty PATH entries are ignored, never searched (the model can plant a file there)', () => {
		const originalCwd = process.cwd();
		afterEach(() => {
			process.chdir(originalCwd);
		});

		// A fixture executable of the tool's name planted where a relative entry would resolve (the worker's cwd).
		const plant = (relativeDirectory: string): string => {
			const planted = path.join(directory, relativeDirectory);
			fs.mkdirSync(planted, { recursive: true });
			fs.writeFileSync(path.join(planted, 'taskcli'), 'PLANTED', { mode: 0o755 });
			process.chdir(directory);
			return planted;
		};
		const resolverWithPath = (entries: string[]): HostToolExecutableResolver =>
			new HostToolExecutableResolver({
				platform: 'linux',
				environment: { PATH: entries.join(path.delimiter) },
			});

		const relativeEntries = [
			['a dot entry', '.', '.'],
			['a node_modules/.bin entry', 'node_modules/.bin', 'node_modules/.bin'],
			['a dot-slash entry', './tools', 'tools'],
			['an empty entry (current directory)', '', '.'],
			['a literal C entry (Git Bash PATH)', 'C', 'C'],
		] as const;

		it.each(relativeEntries)(
			'ignores %s even before an absolute entry holding the real tool: the planted file does not run',
			(_label, entry, where) => {
				const real = write('taskcli', 'REAL');
				plant(where);
				const resolved = resolverWithPath([entry, binDir]).resolve('triage', tool('taskcli'));
				expect(resolved.absolutePath).toBe(real);
				expect(resolved.size).toBe(4);
			}
		);

		it.each(relativeEntries)(
			'refuses a command found only through %s, naming the entry and the fix',
			(_label, entry, where) => {
				plant(where);
				const resolver = resolverWithPath([entry, path.join(directory, 'missing')]);
				const expected = `Step 'triage' tool 'show-task': command 'taskcli' resolves only through relative PATH entry '${entry}'; use an absolute command (set command[0] to its absolute path) or add its directory to PATH as an absolute entry.`;
				expect(() => resolver.resolve('triage', tool('taskcli'))).toThrow(HostToolExecutableError);
				expect(() => resolver.resolve('triage', tool('taskcli'))).toThrow(expected);
			}
		);

		it('refuses when the relative entry comes after the absolute one that lacks the tool', () => {
			plant('.');
			expect(() => resolverWithPath([binDir, '.']).resolve('s', tool('taskcli'))).toThrow(
				/resolves only through relative PATH entry '\.'/
			);
		});

		it('resolves normally with literal C entries and a trailing empty entry, and reports the ignored entries', () => {
			const real = write('taskcli', 'REAL');
			const resolver = resolverWithPath(['C', binDir, 'C', '']);
			expect(resolver.resolve('s', tool('taskcli')).absolutePath).toBe(real);
			expect(resolver.ignoredPathEntries()).toEqual(['C', 'C', '']);
		});

		it('reports no ignored entry for an absolute-only PATH', () => {
			expect(resolverWithPath([binDir]).ignoredPathEntries()).toEqual([]);
		});

		it('says in the not-found error that relative entries were ignored', () => {
			expect(() => resolverWithPath(['C', binDir]).resolve('triage', tool('nope'))).toThrow(
				/not found on PATH.*Ignored relative or empty PATH entries: 'C'/
			);
		});

		it('still resolves through absolute PATH entries only', () => {
			const file = write('taskcli', 'REAL');
			expect(
				resolverWithPath([path.join(directory, 'missing'), binDir]).resolve('s', tool('taskcli')).absolutePath
			).toBe(file);
		});

		it('an absolute command ignores PATH, so a bad entry does not matter for it', () => {
			const file = write('taskcli');
			expect(resolverWithPath(['.']).resolve('s', tool(file)).absolutePath).toBe(file);
		});
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
