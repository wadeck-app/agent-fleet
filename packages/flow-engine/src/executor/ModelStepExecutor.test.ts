/**
 * Tests for the model-step timeout mechanism (step.timeout, in minutes).
 * Uses a hand-written mock ModelProvider -- no real CLI launch, no vi.mock on a concrete provider.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { ModelProvider } from '../processing/ModelProvider';
import type { ModelFlowStep, StepTrace } from '../types';
import { executeModelStep } from './ModelStepExecutor';

function makeStep(overrides: Partial<ModelFlowStep> = {}): ModelFlowStep {
	return {
		id: 'gen',
		name: 'Generate',
		type: 'model',
		provider: 'opencode',
		model: 'terra',
		prompt: 'Hello',
		...overrides,
	};
}

function makeTrace(step: ModelFlowStep): StepTrace {
	return {
		stepId: step.id,
		stepName: step.name,
		stepType: 'model',
		startTime: Date.now(),
	};
}

const templateRenderer = { render: () => 'Hello' };
const outputExtractor = { extract: () => ({ response: 'Hello world' }) };

describe('ModelStepExecutor -- step.timeout', () => {
	it('fails the step with an actionable message and kills the provider when the timeout fires before the provider resolves', async () => {
		const kill = vi.fn();
		// Never resolves on its own -- only provider.kill() being called (asserted below) can end it.
		const provider: ModelProvider = {
			launchInteractive: () => new Promise(() => {}),
			launchBackground: () => new Promise(() => {}),
			kill,
		};

		const step = makeStep({ timeout: 1 / 60_000 }); // ~1ms in minutes
		const trace = await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider, providerName: 'opencode', resolvedModel: 'terra' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);

		expect(trace.error).toBeDefined();
		expect(trace.error).toContain("Model step 'gen'");
		expect(trace.error).toContain('provider: opencode');
		expect(trace.error).toContain('model: terra');
		expect(trace.error).toContain('timed out after');
		expect(trace.error).toContain('killed');
		expect(kill).toHaveBeenCalledTimes(1);
	});

	it('succeeds normally when the provider resolves before the timeout, and never calls kill()', async () => {
		const kill = vi.fn();
		const provider: ModelProvider = {
			launchInteractive: () => Promise.resolve({ response: 'ok', exitCode: 0 }),
			launchBackground: () => Promise.resolve({ stdout: 'ok', stderr: '', exitCode: 0 }),
			kill,
		};

		const step = makeStep({ timeout: 5 }); // 5 minutes -- resolves long before that
		const trace = await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider, providerName: 'opencode', resolvedModel: 'terra' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);

		expect(trace.error).toBeUndefined();
		expect(kill).not.toHaveBeenCalled();
	});

	it('does not race at all when step.timeout is unset (no behavior change for existing flows)', async () => {
		const kill = vi.fn();
		const provider: ModelProvider = {
			launchInteractive: () => Promise.resolve({ response: 'ok', exitCode: 0 }),
			launchBackground: () => Promise.resolve({ stdout: 'ok', stderr: '', exitCode: 0 }),
			kill,
		};

		const step = makeStep();
		const trace = await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider, providerName: 'opencode', resolvedModel: 'terra' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);

		expect(trace.error).toBeUndefined();
		expect(kill).not.toHaveBeenCalled();
	});
});

describe('ModelStepExecutor -- empty-output guard opencode hint', () => {
	// Headless opencode hangs on a permission prompt (e.g. external_directory) nothing can
	// answer, eventually exiting 0 with no output and zero metered tokens -- the empty-output
	// guard already catches this as a failure; this just makes the error say why, for the one
	// provider where it is a known, common cause.
	function emptyResultProvider(): ModelProvider {
		return {
			launchInteractive: () => Promise.resolve({ response: '', exitCode: 0 }),
			launchBackground: options => {
				options.onStreamEvent?.({
					type: 'result',
					subtype: 'result',
					data: { result: '', total_cost_usd: 0 },
				} as any);
				return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
			},
			kill: vi.fn(),
		};
	}

	it('appends a permission hint when the step provider is opencode', async () => {
		const step = makeStep();
		const trace = await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider: emptyResultProvider(), providerName: 'opencode', resolvedModel: 'terra' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);

		expect(trace.error).toContain('zero tokens');
		expect(trace.error).toContain('permission');
		expect(trace.error).toContain('external_directory');
	});

	it('does not append the opencode hint for a non-opencode provider', async () => {
		const step = makeStep({ provider: 'claude' });
		const trace = await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider: emptyResultProvider(), providerName: 'claude', resolvedModel: 'terra' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);

		expect(trace.error).toContain('zero tokens');
		expect(trace.error).not.toContain('permission');
	});
});

describe('ModelStepExecutor -- contextLimit', () => {
	function makeCapturingProvider(): {
		provider: ModelProvider;
		capturedEnv: () => Record<string, string> | undefined;
	} {
		let capturedEnv: Record<string, string> | undefined;
		const provider: ModelProvider = {
			launchInteractive: () => Promise.resolve({ response: 'ok', exitCode: 0 }),
			launchBackground: options => {
				capturedEnv = options.env;
				return Promise.resolve({ stdout: 'ok', stderr: '', exitCode: 0 });
			},
			kill: vi.fn(),
		};
		return { provider, capturedEnv: () => capturedEnv };
	}

	it('injects CLAUDE_CODE_AUTO_COMPACT_WINDOW/CLAUDE_AUTOCOMPACT_PCT_OVERRIDE for a limit at or below 100000', async () => {
		const { provider, capturedEnv } = makeCapturingProvider();
		const step = makeStep({ provider: 'claude', contextLimit: 60_000 });
		await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider, providerName: 'claude', resolvedModel: 'terra' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);

		expect(capturedEnv()).toMatchObject({
			CLAUDE_CODE_AUTO_COMPACT_WINDOW: '100000',
			CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '60',
		});
	});

	it('injects only CLAUDE_CODE_AUTO_COMPACT_WINDOW for a limit above 100000', async () => {
		const { provider, capturedEnv } = makeCapturingProvider();
		const step = makeStep({ provider: 'claude', contextLimit: 150_000 });
		await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider, providerName: 'claude', resolvedModel: 'terra' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);

		expect(capturedEnv()).toEqual({ CLAUDE_CODE_AUTO_COMPACT_WINDOW: '150000' });
	});

	it('does not set any env when contextLimit is omitted', async () => {
		const { provider, capturedEnv } = makeCapturingProvider();
		const step = makeStep({ provider: 'claude' });
		await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider, providerName: 'claude', resolvedModel: 'terra' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);

		expect(capturedEnv()).toBeUndefined();
	});

	it('fails the step (does not launch silently) when contextLimit is set on a non-claude provider', async () => {
		const { provider } = makeCapturingProvider();
		const launchSpy = vi.spyOn(provider, 'launchBackground');
		const step = makeStep({ provider: 'opencode', contextLimit: 100_000 });
		const trace = await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider, providerName: 'opencode', resolvedModel: 'terra' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);

		expect(trace.error).toContain('opencode');
		expect(launchSpy).not.toHaveBeenCalled();
	});

	it('fails the step when contextLimit conflicts with an explicit env var on the same step', async () => {
		const { provider } = makeCapturingProvider();
		const step = makeStep({
			provider: 'claude',
			contextLimit: 100_000,
			env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '50000' },
		});
		const trace = await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider, providerName: 'claude', resolvedModel: 'terra' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);

		expect(trace.error).toContain('CLAUDE_CODE_AUTO_COMPACT_WINDOW');
	});

	it('warns to stderr when the step runs Haiku 5.5 with no contextLimit set', async () => {
		const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		const { provider } = makeCapturingProvider();
		const step = makeStep({ provider: 'claude', model: 'claude-haiku-5-5' });
		await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider, providerName: 'claude', resolvedModel: 'claude-haiku-5-5' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);

		const written = stderrSpy.mock.calls.map(call => String(call[0])).join('');
		expect(written).toContain('contextLimit');
		stderrSpy.mockRestore();
	});

	it('does not warn when contextLimit is set on a Haiku 5.5 step', async () => {
		const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		const { provider } = makeCapturingProvider();
		const step = makeStep({ provider: 'claude', model: 'claude-haiku-5-5', contextLimit: 100_000 });
		await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider, providerName: 'claude', resolvedModel: 'claude-haiku-5-5' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);

		const written = stderrSpy.mock.calls.map(call => String(call[0])).join('');
		expect(written).not.toContain('contextLimit');
		stderrSpy.mockRestore();
	});
});

describe('ModelStepExecutor -- onActivity', () => {
	// The daemon's stall watchdog only hears about a step via onLogEntry, which log:'end' (the
	// default) and toolLog:'none' (the default) both suppress for whole classes of events (e.g. a
	// tool-call-only turn with no narration). onActivity exists precisely so the watchdog is told
	// a provider is doing *something*, independently of what the operator chose to have displayed.
	function streamingProvider(events: Array<Record<string, unknown>>): ModelProvider {
		return {
			launchInteractive: () => Promise.resolve({ response: 'ok', exitCode: 0 }),
			launchBackground: options => {
				for (const event of events) options.onStreamEvent?.(event as any);
				return Promise.resolve({ stdout: 'ok', stderr: '', exitCode: 0 });
			},
			kill: vi.fn(),
		};
	}

	it('fires onActivity for every stream event even when log mode is the default ("end", no onLogEntry wired)', async () => {
		const onActivity = vi.fn();
		const step = makeStep();
		const provider = streamingProvider([
			{
				type: 'tool_use',
				subtype: 'tool_use',
				data: { tool: 'read', callID: 'c1', input: {}, output: '', status: 'done' },
			},
			{
				type: 'tool_use',
				subtype: 'tool_use',
				data: { tool: 'grep', callID: 'c2', input: {}, output: '', status: 'done' },
			},
			{ type: 'result', subtype: 'result', data: { result: 'done', total_cost_usd: 0.01 } },
		]);

		await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider, providerName: 'opencode', resolvedModel: 'terra' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any },
			undefined,
			onActivity
		);

		expect(onActivity).toHaveBeenCalledTimes(3);
	});

	// Claude announces a tool call before running it: that is the only moment the daemon can learn
	// which call a later stall is waiting on.
	it('tells onActivity which tool call is in flight, flagging the events that changed it', async () => {
		const seen: Array<{ changed: boolean; tool: string | null }> = [];
		const step = makeStep();
		const provider = streamingProvider([
			{
				type: 'assistant',
				subtype: 'tool_use',
				data: {
					message: {
						content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }],
					},
				},
			},
			{ type: 'system', subtype: 'noise', data: {} },
			{
				type: 'user',
				subtype: 'tool_result',
				data: { message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } },
			},
		]);

		await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider, providerName: 'claude', resolvedModel: 'sonnet' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any },
			undefined,
			progress => seen.push({ changed: progress?.changed ?? false, tool: progress?.activity?.tool ?? null })
		);

		expect(seen).toEqual([
			{ changed: true, tool: 'Bash' },
			{ changed: false, tool: 'Bash' },
			{ changed: true, tool: null },
		]);
	});

	it('does not throw when onActivity is omitted', async () => {
		const step = makeStep();
		const provider = streamingProvider([{ type: 'result', subtype: 'result', data: { result: 'done' } }]);

		const trace = await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider, providerName: 'opencode', resolvedModel: 'terra' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);

		expect(trace.error).toBeUndefined();
	});
});

describe('ModelStepExecutor -- onCompact', () => {
	function compactingProvider(): ModelProvider {
		return {
			launchInteractive: () => Promise.resolve({ response: 'ok', exitCode: 0 }),
			launchBackground: options => {
				options.onStreamEvent?.({
					type: 'system',
					subtype: 'compact_boundary',
					data: {
						compact_metadata: { trigger: 'auto', pre_tokens: 90000, post_tokens: 1000, duration_ms: 5 },
					},
				} as any);
				options.onStreamEvent?.({ type: 'result', subtype: 'result', data: { result: 'done' } } as any);
				return Promise.resolve({ stdout: 'ok', stderr: '', exitCode: 0 });
			},
			kill: vi.fn(),
		};
	}

	async function runWith(step: ModelFlowStep, providerName: string): Promise<StepTrace> {
		return executeModelStep(
			step,
			process.cwd(),
			{ inputs: {}, stepOutputs: new Map(), taskId: 'task-9' } as any,
			makeTrace(step),
			{ interactive: false, provider: compactingProvider(), providerName, resolvedModel: 'terra' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);
	}

	it('runs the onCompact command with the compaction details before the step ends', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'on-compact-'));
		try {
			const out = join(dir, 'seen.txt');
			const script = join(dir, 'hook.cjs');
			writeFileSync(
				script,
				`require('fs').writeFileSync(${JSON.stringify(out)}, process.env.FLOW_COMPACT_EVENT + ':' + process.env.FLOW_COMPACT_PRE_TOKENS);`
			);
			const step = makeStep({ provider: 'claude', onCompact: { command: `node "${script}"` } });

			const trace = await runWith(step, 'claude');

			expect(trace.error).toBeUndefined();
			expect(readFileSync(out, 'utf8')).toBe('success:90000');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('never fails the step when the onCompact command exits non-zero', async () => {
		const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		const step = makeStep({ provider: 'claude', onCompact: { command: 'node -e "process.exit(5)"' } });

		const trace = await runWith(step, 'claude');

		expect(trace.error).toBeUndefined();
		const written = stderrSpy.mock.calls.map(c => String(c[0])).join('');
		expect(written).toContain('exited with code 5');
		stderrSpy.mockRestore();
	});

	it('fails the step with an actionable error when onCompact is set on a non-claude provider', async () => {
		const step = makeStep({ provider: 'opencode', onCompact: { command: 'echo hi' } });

		const trace = await runWith(step, 'opencode');

		expect(trace.error).toContain('onCompact');
		expect(trace.error).toContain('opencode');
	});
});
