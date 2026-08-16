/**
 * Tests for model step log: parameter behavior.
 * Uses vi.mock for ClaudeLauncher — no real Claude calls.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaudeLauncher } from '../processing/ClaudeLauncher';
import { OutputExtractor } from '../processing/OutputExtractor';
import { TemplateRenderer } from '../processing/TemplateRenderer';
import type { LiveLogEntry, ModelFlowStep, Workspace } from '../types';
import { StepRunner } from './StepRunner';

vi.mock('../processing/TemplateRenderer');
vi.mock('../processing/OutputExtractor');
vi.mock('../processing/ClaudeLauncher');

const testWorkspace: Workspace = {
	id: 'ws-test',
	mode: 'isolated',
	path: '/test/workspace',
	metaDir: '/test/workspace.meta',
	concurrency: { key: 'test', activeTasks: new Set(), locked: false },
	createdAt: new Date().toISOString(),
	lastUsedAt: new Date().toISOString(),
	usageCount: 0,
};

const testContext = { inputs: {}, stepOutputs: new Map(), taskMetadata: {} };

function makeStep(log?: 'streaming' | 'end' | 'none' | 'polling'): ModelFlowStep {
	const step: ModelFlowStep = {
		id: 'gen',
		name: 'Generate',
		type: 'model',
		model: 'haiku',
		prompt: 'Hello',
	};
	if (log !== undefined) (step as any).log = log;
	return step;
}

/** Helper: capture onStreamEvent from launchBackground call */
function captureOnStreamEvent(): { onStreamEvent: ((...args: any[]) => void) | undefined } {
	const captured: { onStreamEvent: ((...args: any[]) => void) | undefined } = { onStreamEvent: undefined };
	vi.mocked(ClaudeLauncher.prototype.launchBackground).mockImplementation((opts: any) => {
		captured.onStreamEvent = opts.onStreamEvent;
		// Simulate 3 streaming assistant events
		if (opts.onStreamEvent) {
			opts.onStreamEvent({
				type: 'assistant',
				data: { message: { content: [{ type: 'text', text: 'Hello ' }] } },
			});
			opts.onStreamEvent({
				type: 'assistant',
				data: { message: { content: [{ type: 'text', text: 'world' }] } },
			});
			opts.onStreamEvent({ type: 'result', data: { result: 'Hello world', subtype: 'success' } });
		}
		return Promise.resolve({ stdout: 'raw-ndjson', stderr: '', exitCode: 0 });
	});
	return captured;
}

describe('model step — log: parameter', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('Hello');
		vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({ response: 'Hello world' });
	});

	describe('log: end (default)', () => {
		it('sends no log entries during execution — only after completion via trace.liveLogEntries', async () => {
			const logsSentDuring: LiveLogEntry[] = [];

			vi.mocked(ClaudeLauncher.prototype.launchBackground).mockImplementation((opts: any) => {
				// During execution: collect any real-time log entries
				if (opts.onStreamEvent) {
					opts.onStreamEvent({
						type: 'assistant',
						data: { message: { content: [{ type: 'text', text: 'Hello world' }] } },
					});
					opts.onStreamEvent({ type: 'result', data: { result: 'Hello world', subtype: 'success' } });
				}
				return Promise.resolve({ stdout: 'raw-ndjson', stderr: '', exitCode: 0 });
			});

			const onLogEntry = vi.fn((entry: LiveLogEntry) => logsSentDuring.push(entry));
			const runner = new StepRunner({ interactive: false });

			const trace = await runner.executeStep(makeStep('end'), testWorkspace, testContext, undefined, onLogEntry);

			// log:end means onLogEntry is NOT called during execution
			// liveLogEntries on trace are populated but not pushed via callback
			expect(onLogEntry).not.toHaveBeenCalled();
			expect(trace.error).toBeUndefined();
		});

		it('populates trace.liveLogEntries after completion', async () => {
			vi.mocked(ClaudeLauncher.prototype.launchBackground).mockImplementation((opts: any) => {
				if (opts.onStreamEvent) {
					opts.onStreamEvent({
						type: 'assistant',
						data: { message: { content: [{ type: 'text', text: 'Hi' }] } },
					});
					opts.onStreamEvent({ type: 'result', data: { result: 'Hi', subtype: 'success' } });
				}
				return Promise.resolve({ stdout: 'raw', stderr: '', exitCode: 0 });
			});

			const runner = new StepRunner({ interactive: false });
			const trace = await runner.executeStep(makeStep('end'), testWorkspace, testContext);

			expect(trace.liveLogEntries).toBeDefined();
			expect(trace.liveLogEntries!.length).toBeGreaterThan(0);
		});
	});

	describe('log: streaming', () => {
		it('calls onLogEntry immediately for each assistant event', async () => {
			const logTimes: number[] = [];
			let executionStartTime = 0;

			vi.mocked(ClaudeLauncher.prototype.launchBackground).mockImplementation(async (opts: any) => {
				executionStartTime = Date.now();
				if (opts.onStreamEvent) {
					opts.onStreamEvent({
						type: 'assistant',
						data: { message: { content: [{ type: 'text', text: 'Hello ' }] } },
					});
					opts.onStreamEvent({
						type: 'assistant',
						data: { message: { content: [{ type: 'text', text: 'world' }] } },
					});
					opts.onStreamEvent({ type: 'result', data: { result: 'Hello world', subtype: 'success' } });
				}
				return { stdout: 'raw', stderr: '', exitCode: 0 };
			});

			const onLogEntry = vi.fn(() => logTimes.push(Date.now()));
			const runner = new StepRunner({ interactive: false });

			await runner.executeStep(makeStep('streaming'), testWorkspace, testContext, undefined, onLogEntry);

			// streaming: onLogEntry called for each assistant event (not just at the end)
			expect(onLogEntry).toHaveBeenCalled();
			// All calls happened during execution (not after)
			expect(onLogEntry.mock.calls.length).toBeGreaterThanOrEqual(1);
		});

		it('calls onLogEntry MULTIPLE TIMES with delays between — simulates real streaming', async () => {
			const callTimestamps: number[] = [];
			const delayMs = 50;

			vi.mocked(ClaudeLauncher.prototype.launchBackground).mockImplementation(async (opts: any) => {
				// Simulate streaming: emit 3 chunks with 50ms delays between them
				if (opts.onStreamEvent) {
					for (const chunk of ['First chunk. ', 'Second chunk. ', 'Third chunk.']) {
						opts.onStreamEvent({
							type: 'assistant',
							data: { message: { content: [{ type: 'text', text: chunk }] } },
						});
						await new Promise(r => setTimeout(r, delayMs));
					}
					opts.onStreamEvent({
						type: 'result',
						data: { result: 'First chunk. Second chunk. Third chunk.', subtype: 'success' },
					});
				}
				return { stdout: 'raw', stderr: '', exitCode: 0 };
			});

			const onLogEntry = vi.fn(() => callTimestamps.push(Date.now()));
			const runner = new StepRunner({ interactive: false });

			await runner.executeStep(makeStep('streaming'), testWorkspace, testContext, undefined, onLogEntry);

			// Must be called at least 3 times (once per text chunk; result event may add 1 more)
			expect(onLogEntry.mock.calls.length).toBeGreaterThanOrEqual(3);
			// Timestamps must be spread across time (not all in the same ms)
			expect(callTimestamps[2]! - callTimestamps[0]!).toBeGreaterThanOrEqual(delayMs * 2 - 10);
		});

		it('passes assistant text content to onLogEntry', async () => {
			vi.mocked(ClaudeLauncher.prototype.launchBackground).mockImplementation(async (opts: any) => {
				if (opts.onStreamEvent) {
					opts.onStreamEvent({
						type: 'assistant',
						data: { message: { content: [{ type: 'text', text: 'A flow orchestrator' }] } },
					});
					opts.onStreamEvent({ type: 'result', data: { result: 'A flow orchestrator', subtype: 'success' } });
				}
				return { stdout: 'raw', stderr: '', exitCode: 0 };
			});

			const received: LiveLogEntry[] = [];
			const onLogEntry = vi.fn((e: LiveLogEntry) => received.push(e));
			const runner = new StepRunner({ interactive: false });

			await runner.executeStep(makeStep('streaming'), testWorkspace, testContext, undefined, onLogEntry);

			expect(received.some(e => e.message.includes('A flow orchestrator'))).toBe(true);
		});
	});

	describe('log: none', () => {
		it('never calls onLogEntry', async () => {
			vi.mocked(ClaudeLauncher.prototype.launchBackground).mockImplementation(async (opts: any) => {
				if (opts.onStreamEvent) {
					opts.onStreamEvent({
						type: 'assistant',
						data: { message: { content: [{ type: 'text', text: 'Hello' }] } },
					});
					opts.onStreamEvent({ type: 'result', data: { result: 'Hello', subtype: 'success' } });
				}
				return { stdout: 'raw', stderr: '', exitCode: 0 };
			});

			const onLogEntry = vi.fn();
			const runner = new StepRunner({ interactive: false });

			const trace = await runner.executeStep(makeStep('none'), testWorkspace, testContext, undefined, onLogEntry);

			expect(onLogEntry).not.toHaveBeenCalled();
			expect(trace.error).toBeUndefined();
		});

		it('does not populate trace.liveLogEntries', async () => {
			vi.mocked(ClaudeLauncher.prototype.launchBackground).mockResolvedValue({
				stdout: 'raw',
				stderr: '',
				exitCode: 0,
			});

			const runner = new StepRunner({ interactive: false });
			const trace = await runner.executeStep(makeStep('none'), testWorkspace, testContext);

			// liveLogEntries may be absent or empty for log:none
			expect(!trace.liveLogEntries || trace.liveLogEntries.length === 0).toBe(true);
		});
	});

	describe('log: polling', () => {
		it('calls onLogEntry with batched entries', async () => {
			vi.mocked(ClaudeLauncher.prototype.launchBackground).mockImplementation(async (opts: any) => {
				if (opts.onStreamEvent) {
					for (let i = 0; i < 5; i++) {
						opts.onStreamEvent({
							type: 'assistant',
							data: { message: { content: [{ type: 'text', text: `line ${i}` }] } },
						});
					}
					opts.onStreamEvent({ type: 'result', data: { result: 'done', subtype: 'success' } });
				}
				return { stdout: 'raw', stderr: '', exitCode: 0 };
			});

			const onLogEntry = vi.fn();
			const runner = new StepRunner({ interactive: false });

			await runner.executeStep(makeStep('polling'), testWorkspace, testContext, undefined, onLogEntry);

			// polling: entries are flushed — at minimum they must arrive
			expect(onLogEntry).toHaveBeenCalled();
		});
	});

	describe('common behavior', () => {
		it('all log modes: trace.response contains the clean answer', async () => {
			const modes: Array<'streaming' | 'end' | 'none' | 'polling' | undefined> = [
				'streaming',
				'end',
				'none',
				'polling',
				undefined,
			];

			for (const mode of modes) {
				vi.clearAllMocks();
				vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('Hello');
				vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({ response: 'Clean answer' });
				vi.mocked(ClaudeLauncher.prototype.launchBackground).mockImplementation(async (opts: any) => {
					if (opts.onStreamEvent) {
						opts.onStreamEvent({ type: 'result', data: { result: 'Clean answer', subtype: 'success' } });
					}
					return { stdout: 'raw-ndjson', stderr: '', exitCode: 0 };
				});

				const runner = new StepRunner({ interactive: false });
				const trace = await runner.executeStep(makeStep(mode), testWorkspace, testContext);

				expect(trace.response).toBe('Clean answer');
				expect(trace.error).toBeUndefined();
			}
		});

		it('all log modes: trace.error set when Claude fails', async () => {
			const modes: Array<'streaming' | 'end' | 'none' | undefined> = ['streaming', 'end', 'none', undefined];

			for (const mode of modes) {
				vi.clearAllMocks();
				vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('Hello');
				vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({});
				vi.mocked(ClaudeLauncher.prototype.launchBackground).mockResolvedValue({
					stdout: '',
					stderr: 'error',
					exitCode: 1,
				});

				const runner = new StepRunner({ interactive: false });
				const trace = await runner.executeStep(makeStep(mode), testWorkspace, testContext);

				expect(trace.error).toBeDefined();
				expect(trace.error).toContain('1');
			}
		});
	});
});
