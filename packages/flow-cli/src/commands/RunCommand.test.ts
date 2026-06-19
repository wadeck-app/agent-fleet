import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlowCliRunner } from '../FlowCliRunner.js';
import { registerRunCommand } from './RunCommand.js';

const mockRun = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
vi.mock('../FlowCliRunner.js', () => ({
	// Must use `function` keyword so Vitest treats this as a constructable mock
	FlowCliRunner: vi.fn(function () {
		return { run: mockRun };
	}),
}));

const MockedFlowCliRunner = vi.mocked(FlowCliRunner);

function makeProgram(): Command {
	const program = new Command();
	program.exitOverride();
	registerRunCommand(program);
	return program;
}

describe('RunCommand', () => {
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

	it("prints '✓ Flow completed' and does not exit on successful run", async () => {
		mockRun.mockResolvedValue({ success: true, outputs: {}, error: undefined });

		const program = makeProgram();
		await program.parseAsync(['run', 'my-flow'], { from: 'user' });

		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("✓ Flow 'my-flow' completed"));
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('prints outputs when the flow produces them', async () => {
		mockRun.mockResolvedValue({
			success: true,
			outputs: { step1: { result: 'hello', count: 42 } },
			error: undefined,
		});

		const program = makeProgram();
		await program.parseAsync(['run', 'my-flow'], { from: 'user' });

		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Outputs:'));
		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('step1.result: hello'));
		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('step1.count: 42'));
	});

	it('exits 1 when result.success is false', async () => {
		mockRun.mockResolvedValue({ success: false, outputs: {}, error: 'Step failed' });

		const program = makeProgram();

		await expect(program.parseAsync(['run', 'my-flow'], { from: 'user' })).rejects.toThrow('process.exit');

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Step failed'));
	});

	it('exits 1 when flow execution throws', async () => {
		mockRun.mockRejectedValue(new Error('Flow not found: no-such-flow'));

		const program = makeProgram();

		await expect(program.parseAsync(['run', 'no-such-flow'], { from: 'user' })).rejects.toThrow('process.exit');

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Flow execution failed'));
	});

	it('parses --inputs key=value pairs into a record', async () => {
		let capturedOptions: Record<string, unknown> | undefined;

		mockRun.mockImplementation((opts: Record<string, unknown>) => {
			capturedOptions = opts;
			return Promise.resolve({ success: true, outputs: {}, error: undefined });
		});

		const program = makeProgram();
		await program.parseAsync(['run', 'my-flow', '--inputs', 'foo=bar', '--inputs', 'baz=qux'], { from: 'user' });

		expect(capturedOptions?.inputs).toEqual({ foo: 'bar', baz: 'qux' });
	});

	it('supports values containing "=" in --inputs', async () => {
		let capturedOptions: Record<string, unknown> | undefined;

		mockRun.mockImplementation((opts: Record<string, unknown>) => {
			capturedOptions = opts;
			return Promise.resolve({ success: true, outputs: {}, error: undefined });
		});

		const program = makeProgram();
		await program.parseAsync(['run', 'my-flow', '--inputs', 'url=http://x.com?a=1'], {
			from: 'user',
		});

		expect(capturedOptions?.inputs).toEqual({ url: 'http://x.com?a=1' });
	});

	it('exits 1 when an --inputs entry has no "=" separator', async () => {
		const program = makeProgram();

		await expect(program.parseAsync(['run', 'my-flow', '--inputs', 'badformat'], { from: 'user' })).rejects.toThrow(
			'process.exit'
		);

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid input format'));
	});

	it('passes --cwd option to FlowCliRunner constructor', async () => {
		mockRun.mockResolvedValue({ success: true, outputs: {} });

		const program = makeProgram();
		await program.parseAsync(['run', 'my-flow', '--cwd', '/tmp/my-project'], { from: 'user' });

		expect(MockedFlowCliRunner).toHaveBeenCalledWith('/tmp/my-project');
	});
});
