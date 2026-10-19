import { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerWorkerSourceCommand } from './WorkerSourceCommand';

// The registry rules (tokens hashed, duplicate ids, liveness...) are covered by WorkerSourceRegistry.test.ts; this
// file covers what the command adds: argument parsing, the output the user reads and the exit codes. It runs against
// a real registry in a throwaway XDG_CONFIG_HOME, so the file it writes is the one `flow` would read.

describe('flow worker source command', () => {
	let xdgHome: string;
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		xdgHome = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-worker-source-cmd-'));
		vi.stubEnv('XDG_CONFIG_HOME', xdgHome);
		logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(process, 'exit').mockImplementation(code => {
			throw new Error(`exit ${String(code)}`);
		});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		fs.rmSync(xdgHome, { recursive: true, force: true });
	});

	const run = (...args: string[]): void => {
		const program = new Command();
		program.exitOverride();
		registerWorkerSourceCommand(program);
		program.parse(['node', 'test', 'worker', 'source', ...args]);
	};
	const printed = (): string => logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
	const errors = (): string => errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
	const registryFile = (): string => path.join(xdgHome, 'flow', 'worker-sources.json');
	const storedSources = (): Record<string, unknown>[] =>
		(JSON.parse(fs.readFileSync(registryFile(), 'utf8')) as { sources: Record<string, unknown>[] }).sources;

	describe('add', () => {
		it('declares the source, prints both tokens once and persists only hashes', () => {
			run(
				'add',
				'gpu-box',
				'--provider',
				'built-in:command',
				'--command',
				'flow',
				'--arg',
				'worker',
				'--labels',
				'gpu, linux',
				'--max-workers',
				'2'
			);
			const out = printed();
			expect(out).toContain("[ok] Declared worker source 'gpu-box'");
			expect(out).toContain('labels     : gpu, linux');
			expect(out).toContain('maxWorkers : 2');
			expect(out).toContain('command    : flow');
			expect(out).toContain('Worker token (shown once, store it now)');
			expect(out).toContain('Source token (shown once, store it now)');

			// The token is the long line printed right after its "shown once" caption.
			const lines = logSpy.mock.calls.map((c: unknown[]) => String(c[0]));
			const captionIndex = lines.findIndex((l: string) => l.includes('Worker token (shown once'));
			const token = lines[captionIndex + 1]!.trim();
			expect(token.length).toBeGreaterThan(20);
			expect(fs.readFileSync(registryFile(), 'utf8')).not.toContain(token);
			expect(storedSources()[0]).toMatchObject({
				sourceId: 'gpu-box',
				labels: ['gpu', 'linux'],
				maxWorkers: 2,
				options: { command: 'flow', args: ['worker'] },
			});
		});

		it('stores no options key when no launch detail was given', () => {
			run('add', 'inbound-1', '--provider', 'built-in:inbound');
			expect(storedSources()[0]).not.toHaveProperty('options');
		});

		it('fails with the offending value for a --max-workers that is not a positive integer', () => {
			expect(() => run('add', 'x', '--provider', 'built-in:inbound', '--max-workers', '0')).toThrow('exit 1');
			expect(errors()).toContain('[fail] --max-workers must be a positive integer, got "0"');
			expect(fs.existsSync(registryFile())).toBe(false);
		});

		it('fails with the registry message when the id is already declared', () => {
			run('add', 'dup', '--provider', 'built-in:inbound');
			errorSpy.mockClear();
			expect(() => run('add', 'dup', '--provider', 'built-in:inbound')).toThrow('exit 1');
			expect(errors()).toMatch(/^\[fail\] .*dup/);
		});
	});

	describe('list', () => {
		it('points at the add command when nothing is declared', () => {
			run('list');
			expect(printed()).toContain('No worker sources declared. Add one with: flow worker source add');
		});

		it('prints one tab-separated line per source and reminds that declared is not live', () => {
			run('add', 'gpu-box', '--provider', 'built-in:inbound', '--labels', 'gpu');
			logSpy.mockClear();
			run('list');
			expect(printed()).toContain('gpu-box\tbuilt-in:inbound\tmax=1\tlabels=gpu');
			expect(printed()).toContain('Use "flow worker list" to see live workers.');
		});

		it('--json prints the entries', () => {
			run('add', 'gpu-box', '--provider', 'built-in:inbound');
			logSpy.mockClear();
			run('list', '--json');
			expect(JSON.parse(printed())).toEqual([expect.objectContaining({ sourceId: 'gpu-box' })]);
		});

		it('--validate adds the liveness of each entry and explains the values', () => {
			run('add', 'gpu-box', '--provider', 'built-in:inbound');
			logSpy.mockClear();
			run('list', '--validate');
			expect(printed()).toMatch(/gpu-box\t.*\tliveness=\w+/);
			expect(printed()).toContain('liveness=dead means');
		});
	});

	describe('remove', () => {
		it('removes a declared source', () => {
			run('add', 'gpu-box', '--provider', 'built-in:inbound');
			logSpy.mockClear();
			run('remove', 'gpu-box');
			expect(printed()).toContain("[ok] Removed worker source 'gpu-box'");
			expect(storedSources()).toEqual([]);
		});

		it('exits 1 naming the id when it is not declared', () => {
			expect(() => run('remove', 'ghost')).toThrow('exit 1');
			expect(errors()).toContain("[fail] No worker source declared with id 'ghost'");
		});
	});

	describe('prune and repair', () => {
		it('prune reports that no dead source was found', () => {
			run('prune');
			expect(printed()).toContain('[ok] No dead worker sources found.');
		});

		it('repair leaves a healthy registry alone', () => {
			run('repair');
			expect(printed()).toContain('nothing to repair');
		});

		it('repair backs up a registry that does not parse and says how to continue', () => {
			fs.mkdirSync(path.dirname(registryFile()), { recursive: true });
			fs.writeFileSync(registryFile(), '{ broken');
			run('repair');
			expect(printed()).toContain('Worker source registry was corrupt -- backed up to');
			expect(printed()).toContain('Re-declare any sources you need');
		});

		it('a corrupt registry makes list fail with an exit code instead of a stack trace', () => {
			fs.mkdirSync(path.dirname(registryFile()), { recursive: true });
			fs.writeFileSync(registryFile(), '{ broken');
			expect(() => run('list')).toThrow('exit 1');
			expect(errors()).toMatch(/^\[fail\] /);
		});
	});

	it('returns the worker command group so `flow worker start` can be attached to it', () => {
		const program = new Command();
		const worker = registerWorkerSourceCommand(program);
		expect(worker.name()).toBe('worker');
	});
});
