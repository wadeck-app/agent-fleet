import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerShowCommand } from './ShowCommand.js';

vi.mock('../utils/loadYaml.js', () => ({
	loadYaml: vi.fn(),
}));

import { loadYaml } from '../utils/loadYaml.js';
const mockLoadYaml = vi.mocked(loadYaml);

function makeProgram(): Command {
	const program = new Command();
	program.exitOverride();
	registerShowCommand(program);
	return program;
}

const MINIMAL_FLOW = {
	id: 'my-flow',
	version: '1.0.0',
	name: 'My Flow',
	workspace: { mode: 'manual' },
	inputs: {},
	steps: [
		{ id: 'step1', type: 'model', model: 'sonnet', prompt: 'Do something' },
	],
};

describe('ShowCommand', () => {
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

	it('renders flow header and step table for a valid flow', async () => {
		mockLoadYaml.mockReturnValue(MINIMAL_FLOW);
		const program = makeProgram();
		await program.parseAsync(['show', 'flow.yml'], { from: 'user' });

		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('my-flow'));
		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('My Flow'));
		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('step1'));
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('renders workspace info in header', async () => {
		mockLoadYaml.mockReturnValue(MINIMAL_FLOW);
		const program = makeProgram();
		await program.parseAsync(['show', 'flow.yml'], { from: 'user' });

		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('workspace:'));
		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('manual'));
	});

	it('exits 1 when flow is missing steps field', async () => {
		mockLoadYaml.mockReturnValue({ id: 'x', workspace: { mode: 'manual' } });
		const program = makeProgram();

		await expect(program.parseAsync(['show', 'flow.yml'], { from: 'user' })).rejects.toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("missing required fields"));
	});

	it('exits 1 when flow is missing workspace field', async () => {
		mockLoadYaml.mockReturnValue({ id: 'x', steps: [] });
		const program = makeProgram();

		await expect(program.parseAsync(['show', 'flow.yml'], { from: 'user' })).rejects.toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("missing required fields"));
	});

	it('renders description only when it differs from name', async () => {
		mockLoadYaml.mockReturnValue({
			...MINIMAL_FLOW,
			description: 'A more detailed description',
		});
		const program = makeProgram();
		await program.parseAsync(['show', 'flow.yml'], { from: 'user' });

		expect(consoleLogSpy).toHaveBeenCalledWith('A more detailed description');
	});

	it('renders footer step count', async () => {
		mockLoadYaml.mockReturnValue({
			...MINIMAL_FLOW,
			steps: [
				{ id: 'step1', type: 'model', model: 'sonnet', prompt: 'A' },
				{ id: 'step2', type: 'script', script: 'echo hi' },
			],
		});
		const program = makeProgram();
		await program.parseAsync(['show', 'flow.yml'], { from: 'user' });

		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('2 steps'));
	});

	it('marks blocking user_intervention step with (!)', async () => {
		mockLoadYaml.mockReturnValue({
			...MINIMAL_FLOW,
			steps: [
				{ id: 'approve', type: 'user_intervention', interventionType: 'approval', blocking: true },
			],
		});
		const program = makeProgram();
		await program.parseAsync(['show', 'flow.yml'], { from: 'user' });

		const calls = consoleLogSpy.mock.calls.flat().join('\n');
		expect(calls).toContain('(!)');
	});

	it('throws on unknown step type (fail-fast per project convention)', async () => {
		mockLoadYaml.mockReturnValue({
			...MINIMAL_FLOW,
			steps: [
				{ id: 'step1', type: 'unknown_future_type' },
			],
		});
		const program = makeProgram();
		await expect(program.parseAsync(['show', 'flow.yml'], { from: 'user' })).rejects.toThrow('Unknown step type');
	});
});
