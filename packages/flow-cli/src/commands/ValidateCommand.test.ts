import { Command } from 'commander';
import * as fs from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerValidateCommand } from './ValidateCommand.js';

const mockValidate = vi.fn();
vi.mock('flow-engine', () => ({
	FlowValidator: vi.fn(function () {
		return { validate: mockValidate };
	}),
}));
vi.mock('fs');

const mockedFs = vi.mocked(fs);

function makeProgram(): Command {
	const program = new Command();
	program.exitOverride();
	registerValidateCommand(program);
	return program;
}

describe('ValidateCommand', () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
			throw new Error('process.exit');
		});
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		exitSpy.mockRestore();
		consoleLogSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	it('prints "✓ Flow is valid" and does not exit when flow is valid', async () => {
		mockedFs.existsSync = vi.fn().mockReturnValue(true);
		mockedFs.readFileSync = vi.fn().mockReturnValue('id: my-flow\nname: My Flow\nsteps: []');
		mockValidate.mockReturnValue({ valid: true, issues: [] });

		const program = makeProgram();
		await program.parseAsync(['validate', 'flow.yml'], { from: 'user' });

		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✓ Flow is valid'));
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('prints warning count alongside valid message when there are warnings', async () => {
		mockedFs.existsSync = vi.fn().mockReturnValue(true);
		mockedFs.readFileSync = vi.fn().mockReturnValue('id: my-flow\nname: My Flow\nsteps: []');
		mockValidate.mockReturnValue({
			valid: true,
			issues: [
				{ severity: 'warning', message: 'Deprecated field used', location: {} },
				{ severity: 'warning', message: 'Consider adding description', location: {} },
			],
		});

		const program = makeProgram();
		await program.parseAsync(['validate', 'flow.yml'], { from: 'user' });

		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('2 warnings'));
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('prints error count to stderr and exits 1 when flow has errors', async () => {
		mockedFs.existsSync = vi.fn().mockReturnValue(true);
		mockedFs.readFileSync = vi.fn().mockReturnValue('id: bad-flow\nsteps: []');
		mockValidate.mockReturnValue({
			valid: false,
			issues: [
				{ severity: 'error', message: 'Missing required field: name', location: {} },
				{ severity: 'error', message: 'Invalid step type', location: { stepId: 'step1' } },
			],
		});

		const program = makeProgram();

		await expect(program.parseAsync(['validate', 'bad-flow.yml'], { from: 'user' })).rejects.toThrow(
			'process.exit'
		);

		expect(exitSpy).toHaveBeenCalledWith(1);
		// ✗ summary and error details must both be on stderr, NOT stdout
		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('2 error'));
		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Errors:'));
		expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('✗'));
		expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Errors:'));
	});

	it('prints "File not found" and exits 1 when file does not exist', async () => {
		mockedFs.existsSync = vi.fn().mockReturnValue(false);

		const program = makeProgram();

		await expect(program.parseAsync(['validate', 'missing.yml'], { from: 'user' })).rejects.toThrow('process.exit');

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('File not found'));
	});

	it('exits 1 and reports YAML parse failure when YAML is invalid', async () => {
		mockedFs.existsSync = vi.fn().mockReturnValue(true);
		mockedFs.readFileSync = vi.fn().mockReturnValue('key: [unclosed bracket');

		const program = makeProgram();

		await expect(program.parseAsync(['validate', 'bad.yml'], { from: 'user' })).rejects.toThrow('process.exit');

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse YAML'));
	});

	it('exits 1 when YAML file is empty', async () => {
		mockedFs.existsSync = vi.fn().mockReturnValue(true);
		mockedFs.readFileSync = vi.fn().mockReturnValue('');

		const program = makeProgram();

		await expect(program.parseAsync(['validate', 'empty.yml'], { from: 'user' })).rejects.toThrow('process.exit');

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('empty'));
	});
});
