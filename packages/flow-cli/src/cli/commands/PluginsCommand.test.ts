import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerPluginsCommand } from './PluginsCommand.js';

function makeProgram(): Command {
	const program = new Command();
	program.exitOverride();
	registerPluginsCommand(program);
	return program;
}

function captureStdout(fn: () => void | Promise<void>): Promise<string> {
	return new Promise((resolve, reject) => {
		let output = '';
		const original = process.stdout.write.bind(process.stdout);
		vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
			output += String(chunk);
			return true;
		});
		Promise.resolve(fn())
			.then(() => {
				vi.restoreAllMocks();
				resolve(output);
			})
			.catch(err => {
				vi.restoreAllMocks();
				reject(err);
			});
		void original;
	});
}

describe('flow plugins list', () => {
	it('prints the four built-in plugins in table format', async () => {
		const output = await captureStdout(() => {
			makeProgram().parse(['plugins', 'list'], { from: 'user' });
		});
		expect(output).toContain('none');
		expect(output).toContain('worktree');
		expect(output).toContain('cli-approval');
		expect(output).toContain('file-approval');
		expect(output).toContain('plugins.none.default');
		expect(output).toContain('workspace');
		expect(output).toContain('approval');
	});

	it('outputs valid JSON with required fields when --json', async () => {
		const output = await captureStdout(() => {
			makeProgram().parse(['plugins', 'list', '--json'], { from: 'user' });
		});
		const parsed = JSON.parse(output) as Array<{ id: string; extensionPoint: string; typeString: string }>;
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed.length).toBeGreaterThanOrEqual(4);
		const ids = parsed.map(p => p.id);
		expect(ids).toContain('none');
		expect(ids).toContain('file-approval');
		for (const entry of parsed) {
			expect(typeof entry.id).toBe('string');
			expect(typeof entry.extensionPoint).toBe('string');
			expect(typeof entry.typeString).toBe('string');
			expect(entry.typeString).toMatch(/^plugins\./);
		}
	});
});

describe('flow plugins config', () => {
	it('prints snippet for none containing the type string', async () => {
		const output = await captureStdout(() => {
			makeProgram().parse(['plugins', 'config', 'none'], { from: 'user' });
		});
		expect(output).toContain('plugins.none.default');
		expect(output).toContain('workspace');
	});

	it('prints snippet for worktree with baseDir option', async () => {
		const output = await captureStdout(() => {
			makeProgram().parse(['plugins', 'config', 'worktree'], { from: 'user' });
		});
		expect(output).toContain('plugins.worktree.default');
		expect(output).toContain('baseDir');
	});

	it('prints snippet for cli-approval with TTY fallback note', async () => {
		const output = await captureStdout(() => {
			makeProgram().parse(['plugins', 'config', 'cli-approval'], { from: 'user' });
		});
		expect(output).toContain('plugins.cli-approval.default');
		expect(output).toContain('TTY');
	});

	it('prints snippet for file-approval with file protocol details', async () => {
		const output = await captureStdout(() => {
			makeProgram().parse(['plugins', 'config', 'file-approval'], { from: 'user' });
		});
		expect(output).toContain('plugins.file-approval.default');
		expect(output).toContain('dir');
		expect(output).toContain('request.json');
		expect(output).toContain('response.json');
	});

	it('outputs JSON with snippet and options fields when --json', async () => {
		const output = await captureStdout(() => {
			makeProgram().parse(['plugins', 'config', 'file-approval', '--json'], { from: 'user' });
		});
		const parsed = JSON.parse(output) as {
			id: string;
			extensionPoint: string;
			typeString: string;
			snippet: string;
			options: Record<string, string>;
		};
		expect(parsed.id).toBe('file-approval');
		expect(parsed.extensionPoint).toBe('approval');
		expect(parsed.typeString).toBe('plugins.file-approval.default');
		expect(typeof parsed.snippet).toBe('string');
		expect(typeof parsed.options).toBe('object');
		expect(Object.keys(parsed.options).length).toBeGreaterThan(0);
	});

	it('exits with an error for an unknown plugin', () => {
		const program = makeProgram();
		const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
			throw new Error('process.exit called');
		});
		expect(() => program.parse(['plugins', 'config', 'totally-unknown-xyz'], { from: 'user' })).toThrow();
		expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('unknown plugin'));
		stderrSpy.mockRestore();
		exitSpy.mockRestore();
	});
});
