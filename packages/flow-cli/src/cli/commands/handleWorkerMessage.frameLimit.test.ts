import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorkerToDaemon } from '../../ipc/Protocol';
import { MAX_WORKER_FRAME_BYTES } from '../../ipc/WorkerFrameLimit';
import { handleWorkerMessage } from './handleWorkerMessage';

const LIMIT = MAX_WORKER_FRAME_BYTES;

// What a worker reports for a finished model step: the cost is known at this point.
const META = { model: 'claude-sonnet-5-5', cost: { usd: 0.42, reported: true }, end_reason: 'completed' };

async function runStep(
	result: { output: Record<string, unknown>; io?: unknown },
	stepConfig: Record<string, unknown> = { id: 'implement', type: 'model' }
): Promise<WorkerToDaemon[]> {
	const sent: WorkerToDaemon[] = [];
	await handleWorkerMessage(
		{
			type: 'assign',
			assignmentId: 'a1',
			stepId: 'implement',
			stepConfig,
			executionContext: { executionId: 'e1' },
		} as never,
		{ execute: vi.fn().mockResolvedValue({ meta: META, io: { inputs: {} }, ...result }) } as never,
		message => sent.push(message),
		{ pid: 1 },
		{ stepStarted: vi.fn(), stepCompleted: vi.fn(), stepFailed: vi.fn(), stepLog: vi.fn() } as never,
		{ busy: false, onIdle: vi.fn() } as never
	);
	return sent;
}

const outcomeOf = (sent: WorkerToDaemon[]): WorkerToDaemon =>
	sent.find(m => m.type === 'step_completed' || m.type === 'step_failed')!;

describe('handleWorkerMessage -- a result larger than one frame', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('sends a normal result untouched, with nothing marked as truncated', async () => {
		const sent = await runStep({ output: { stdout: 'ok', rawOutput: 'ok' } });

		const outcome = outcomeOf(sent);
		expect(outcome.type).toBe('step_completed');
		expect(outcome).not.toHaveProperty('truncated');
		expect((outcome as { output: unknown }).output).toEqual({ stdout: 'ok', rawOutput: 'ok' });
	});

	// The reported case: a streamJson model step whose transcript (output.stdout) passed 1 MiB after 6 minutes of work.
	it('still completes the step, cutting the transcript and saying so, when only undeclared output is large', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const sent = await runStep({
			output: { stdout: 'e'.repeat(1_370_000), rawOutput: 'final', response: 'final' },
		});

		const outcome = outcomeOf(sent) as Extract<WorkerToDaemon, { type: 'step_completed' }>;
		expect(outcome.type).toBe('step_completed');
		expect(outcome.meta).toEqual(META);
		expect(outcome.output['rawOutput']).toBe('final');
		expect(outcome.truncated).toEqual([
			expect.objectContaining({ field: 'output.stdout', originalBytes: 1_370_000 }),
		]);
		expect(Buffer.byteLength(JSON.stringify(outcome), 'utf8')).toBeLessThanOrEqual(LIMIT);
	});

	it('says in the worker log which fields were cut', async () => {
		const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await runStep({ output: { stdout: 'e'.repeat(LIMIT + 1) } });

		expect(warn).toHaveBeenCalledWith(expect.stringContaining('output.stdout'));
	});

	it('fails a declared output that alone exceeds the limit: engine-origin, with the cost, and no step_completed', async () => {
		const sent = await runStep(
			{ output: { stdout: 'x', report: 'r'.repeat(LIMIT + 1) } },
			{ id: 'implement', type: 'model', output: { report: { type: 'string' } } }
		);

		expect(sent.some(m => m.type === 'step_completed')).toBe(false);
		const failure = outcomeOf(sent) as Extract<WorkerToDaemon, { type: 'step_failed' }>;
		expect(failure.type).toBe('step_failed');
		expect(failure.origin).toBe('engine');
		expect(failure.meta).toEqual(META);
		expect(failure.error).toContain(`Output variable 'report' is ${String(LIMIT + 1 + 2)} bytes`);
		expect(failure.error).toContain('Write large data to a file in the workspace and output its path');
		expect(Buffer.byteLength(JSON.stringify(failure), 'utf8')).toBeLessThan(LIMIT);
	});

	it('leaves an ordinary failure without an origin, so it keeps being retried by the step rules', async () => {
		const sent: WorkerToDaemon[] = [];
		await handleWorkerMessage(
			{
				type: 'assign',
				assignmentId: 'a1',
				stepId: 's',
				stepConfig: { id: 's', type: 'script' },
				executionContext: { executionId: 'e1' },
			} as never,
			{ execute: vi.fn().mockRejectedValue(new Error('exit 1')) } as never,
			message => sent.push(message),
			{ pid: 1 },
			{ stepStarted: vi.fn(), stepCompleted: vi.fn(), stepFailed: vi.fn(), stepLog: vi.fn() } as never,
			{ busy: false, onIdle: vi.fn() } as never
		);

		const failure = outcomeOf(sent);
		expect(failure.type).toBe('step_failed');
		expect(failure).not.toHaveProperty('origin');
	});
});
