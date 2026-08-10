import { Command } from 'commander';
import * as fs from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerDocsCommand } from './DocsCommand.js';

const mockGenerate = vi.fn().mockReturnValue('# Flow Capabilities\n\nSome docs.');
vi.mock('flow-engine', () => ({
	FlowCapabilitiesGenerator: vi.fn(function () {
		return { generate: mockGenerate };
	}),
}));
vi.mock('fs');

const mockedFs = vi.mocked(fs);

function makeProgram(): Command {
	const program = new Command();
	program.exitOverride();
	registerDocsCommand(program);
	return program;
}

describe('DocsCommand', () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	let stdoutSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		// mockReset: true (vitest config) resets mockReturnValue between tests — restore it here
		mockGenerate.mockReturnValue('# Flow Capabilities\n\nSome docs.');
		exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
			throw new Error('process.exit');
		});
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
	});

	afterEach(() => {
		vi.clearAllMocks();
		exitSpy.mockRestore();
		consoleLogSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		stdoutSpy.mockRestore();
	});

	it('writes docs to stdout when no --output flag', async () => {
		const program = makeProgram();
		await program.parseAsync(['docs'], { from: 'user' });

		expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Flow Capabilities'));
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('writes docs to file and prints confirmation when --output is given', async () => {
		mockedFs.writeFileSync = vi.fn();
		const program = makeProgram();
		await program.parseAsync(['docs', '-o', 'output.md'], { from: 'user' });

		expect(mockedFs.writeFileSync).toHaveBeenCalledWith('output.md', expect.stringContaining('Flow Capabilities'), 'utf-8');
		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✓ Docs written to output.md'));
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('exits 1 and prints error when writeFileSync throws', async () => {
		mockedFs.writeFileSync = vi.fn().mockImplementation(() => {
			throw new Error('EACCES: permission denied');
		});
		const program = makeProgram();

		await expect(program.parseAsync(['docs', '-o', '/root/output.md'], { from: 'user' })).rejects.toThrow('process.exit');

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('EACCES'));
	});
});
