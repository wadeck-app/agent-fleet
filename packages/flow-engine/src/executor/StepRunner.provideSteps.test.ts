/**
 * Tests for provideSteps XML tool_call parsing in StepRunner.
 *
 * provideSteps allows Claude to dynamically inject workflow steps by outputting:
 *   <tool_call>{"tool_call":"provideSteps","input":{"steps":[...]}}</tool_call>
 */
import { describe, expect, it, vi } from 'vitest';

import { StepRunner } from './StepRunner';

// Access processToolCalls via setOnInjectSteps + a mock runner
// We test processToolCalls indirectly by stubbing executeModelStep via StepRunner internals.
// Since processToolCalls is private, we test it via the public surface.

describe('StepRunner.processToolCalls (via setOnInjectSteps)', () => {
	/**
	 * Call the private processToolCalls method via a test-only accessor.
	 * We expose it as protected/private — use ts-ignore for testing.
	 */
	function makeRunner(onInjectSteps: (steps: unknown[]) => Promise<void>): StepRunner {
		const runner = new StepRunner({ interactive: false });
		runner.setOnInjectSteps(onInjectSteps);
		return runner;
	}

	async function processText(
		runner: StepRunner,
		text: string,
		onInjectSteps: (steps: unknown[]) => Promise<void>
	): Promise<string> {
		// Access private method for unit testing
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (runner as any).processToolCalls(text, onInjectSteps);
	}

	it('calls onInjectSteps with valid steps and strips XML from response', async () => {
		const onInjectSteps = vi.fn().mockResolvedValue(undefined);
		const runner = makeRunner(onInjectSteps);

		const input =
			'Some preamble.\n' +
			'<tool_call>{"tool_call":"provideSteps","input":{"steps":[{"id":"greet","type":"script","script":"echo hi"}]}}</tool_call>\n' +
			'Some postamble.';

		const output = await processText(runner, input, onInjectSteps);

		expect(onInjectSteps).toHaveBeenCalledOnce();
		expect(onInjectSteps).toHaveBeenCalledWith([{ id: 'greet', type: 'script', script: 'echo hi' }]);
		expect(output).toContain('Some preamble.');
		expect(output).toContain('Some postamble.');
		expect(output).not.toContain('<tool_call>');
	});

	it('skips injection and logs warning when steps missing id or type', async () => {
		const onInjectSteps = vi.fn().mockResolvedValue(undefined);
		const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		const runner = makeRunner(onInjectSteps);

		const input = '<tool_call>{"tool_call":"provideSteps","input":{"steps":[{"script":"echo hi"}]}}</tool_call>';

		const output = await processText(runner, input, onInjectSteps);

		expect(onInjectSteps).not.toHaveBeenCalled();
		expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('missing id or type'));
		expect(output).not.toContain('<tool_call>');
		stderrSpy.mockRestore();
	});

	it('strips invalid JSON tool_call without calling onInjectSteps', async () => {
		const onInjectSteps = vi.fn().mockResolvedValue(undefined);
		const runner = makeRunner(onInjectSteps);

		const input = 'Before <tool_call>not json</tool_call> after.';
		const output = await processText(runner, input, onInjectSteps);

		expect(onInjectSteps).not.toHaveBeenCalled();
		expect(output).not.toContain('<tool_call>');
	});

	it('ignores unknown tool_call names', async () => {
		const onInjectSteps = vi.fn().mockResolvedValue(undefined);
		const runner = makeRunner(onInjectSteps);

		const input = '<tool_call>{"tool_call":"unknownTool","input":{}}</tool_call>';
		const output = await processText(runner, input, onInjectSteps);

		expect(onInjectSteps).not.toHaveBeenCalled();
		expect(output).not.toContain('<tool_call>');
	});

	it('handles multiple tool_call blocks in one response', async () => {
		const onInjectSteps = vi.fn().mockResolvedValue(undefined);
		const runner = makeRunner(onInjectSteps);

		const input =
			'First:\n' +
			'<tool_call>{"tool_call":"provideSteps","input":{"steps":[{"id":"a","type":"script","script":"echo a"}]}}</tool_call>\n' +
			'Second:\n' +
			'<tool_call>{"tool_call":"provideSteps","input":{"steps":[{"id":"b","type":"script","script":"echo b"}]}}</tool_call>';

		const output = await processText(runner, input, onInjectSteps);

		expect(onInjectSteps).toHaveBeenCalledTimes(2);
		expect(output).not.toContain('<tool_call>');
	});

	it('setOnInjectSteps sets config correctly', () => {
		const onInjectSteps = vi.fn().mockResolvedValue(undefined);
		const runner = new StepRunner({ interactive: false });
		runner.setOnInjectSteps(onInjectSteps);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((runner as any).config.onInjectSteps).toBe(onInjectSteps);
	});
});
