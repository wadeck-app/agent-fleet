import { describe, expect, it } from 'vitest';

import type { ExecutionState } from '../execution/ExecutionState.js';
import { makeExec } from '../testing/makeExec.js';
import { buildHistoryTable } from './HistoryTable.js';

describe('buildHistoryTable', () => {
	const execs: ExecutionState[] = [
		makeExec({
			executionId: 'aaa',
			flowId: 'task-retry',
			status: 'completed',
			startedAt: '2026-08-16T12:00:00.000Z',
			completedAt: '2026-08-16T12:00:01.244Z',
		}),
		makeExec({
			executionId: 'bbb',
			flowId: 'task-loop',
			status: 'failed',
			startedAt: '2026-08-16T11:00:00.000Z',
			completedAt: '2026-08-16T11:00:05.000Z',
		}),
		makeExec({
			executionId: 'ccc',
			flowId: 'task-retry',
			status: 'completed',
			startedAt: '2026-08-16T10:00:00.000Z',
			completedAt: '2026-08-16T10:00:02.000Z',
		}),
	];

	it('returns "No executions found" for empty list', () => {
		expect(buildHistoryTable([], {})).toBe('No executions found.');
	});

	it('renders header + rows', () => {
		const out = buildHistoryTable(execs, {});
		expect(out).toContain('EXECUTION');
		expect(out).toContain('aaa');
		expect(out).toContain('task-retry');
		expect(out).toContain('completed');
	});

	it('respects --limit', () => {
		const out = buildHistoryTable(execs, { limit: 1 });
		expect(out).toContain('aaa');
		expect(out).not.toContain('bbb');
	});

	it('filters by --status', () => {
		const out = buildHistoryTable(execs, { status: 'failed' });
		expect(out).toContain('bbb');
		expect(out).not.toContain('aaa');
	});

	it('filters by --flow', () => {
		const out = buildHistoryTable(execs, { flow: 'task-loop' });
		expect(out).toContain('bbb');
		expect(out).not.toContain('aaa');
	});

	it('returns "No executions found" when filter matches nothing', () => {
		const out = buildHistoryTable(execs, { status: 'running' });
		expect(out).toBe('No executions found.');
	});
});

describe('buildHistoryTable --id detail view', () => {
	const exec = makeExec({
		executionId: 'abc',
		flowId: 'task-retry',
		steps: {
			'step-a': {
				status: 'completed',
				startedAt: '2026-08-16T12:00:00.000Z',
				completedAt: '2026-08-16T12:00:01.000Z',
			},
			'step-b': {
				status: 'failed',
				startedAt: '2026-08-16T12:00:01.000Z',
				completedAt: '2026-08-16T12:00:02.000Z',
			},
		},
	});

	it('shows step detail when id matches', () => {
		const out = buildHistoryTable([exec], { id: 'abc' });
		expect(out).toContain('step-a');
		expect(out).toContain('step-b');
		expect(out).toContain('completed');
		expect(out).toContain('failed');
	});

	it('shows "Execution not found" for unknown id', () => {
		const out = buildHistoryTable([exec], { id: 'zzz' });
		expect(out).toContain('not found');
	});

	it('renders cost/token meta for a completed model step', () => {
		const execWithMeta = makeExec({
			executionId: 'withmeta',
			steps: {
				'model-step': {
					status: 'completed',
					startedAt: '2026-08-16T12:00:00.000Z',
					completedAt: '2026-08-16T12:00:03.000Z',
					meta: {
						model: 'claude-sonnet',
						session_id: 'sess-1',
						session_file: '/tmp/sess-1.jsonl',
						ttft_ms: 120,
						duration_ms: 3000,
						cost: {
							input_tokens: 100,
							output_tokens: 50,
							cache_read_tokens: 0,
							cache_write_tokens: 0,
							usd: 0.0123,
						},
					},
				},
			},
		});
		const out = buildHistoryTable([execWithMeta], { id: 'withmeta' });
		expect(out).toContain('cost: $0.0123 (100 in / 50 out tokens, 3000ms)');
	});

	it('renders cache tokens as an additional, separate figure when non-zero', () => {
		const execWithMeta = makeExec({
			executionId: 'withcache',
			steps: {
				'model-step': {
					status: 'completed',
					startedAt: '2026-08-16T12:00:00.000Z',
					completedAt: '2026-08-16T12:06:06.531Z',
					meta: {
						model: 'opencode/some-model',
						session_id: 'sess-2',
						session_file: '/tmp/sess-2.jsonl',
						ttft_ms: 120,
						duration_ms: 366531,
						cost: {
							input_tokens: 46,
							output_tokens: 11335,
							cache_read_tokens: 1239000,
							cache_write_tokens: 43,
							usd: 0.1704,
						},
					},
				},
			},
		});
		const out = buildHistoryTable([execWithMeta], { id: 'withcache' });
		expect(out).toContain('cost: $0.1704 (46 in / 11335 out + 1239043 cache tokens, 366531ms)');
	});

	it('does not render a cost line for a completed script step', () => {
		const execWithMeta = makeExec({
			executionId: 'scriptmeta',
			steps: {
				'script-step': {
					status: 'completed',
					startedAt: '2026-08-16T12:00:00.000Z',
					completedAt: '2026-08-16T12:00:01.000Z',
					meta: { duration_ms: 500, exit_code: 0 },
				},
			},
		});
		const out = buildHistoryTable([execWithMeta], { id: 'scriptmeta' });
		expect(out).not.toContain('cost:');
	});

	it('marks injected steps with * in detail view', () => {
		const execWithInjected = makeExec({
			executionId: 'inj',
			steps: {
				'static-step': { status: 'completed' },
				'dynamic-step': { status: 'completed', injected: true },
			},
		});
		const out = buildHistoryTable([execWithInjected], { id: 'inj' });
		expect(out).toContain('dynamic-step*');
		expect(out).not.toContain('static-step*');
		expect(out).toContain('* = dynamically injected step');
	});

	it('omits the injected-step legend when no step was injected', () => {
		const execNoInjected = makeExec({
			executionId: 'noinj',
			steps: {
				'static-step': { status: 'completed' },
			},
		});
		const out = buildHistoryTable([execNoInjected], { id: 'noinj' });
		expect(out).not.toContain('dynamically injected step');
	});

	it('prints a total cost line summing all model steps', () => {
		const execWithMeta = makeExec({
			executionId: 'totalcost',
			steps: {
				haiku: {
					status: 'completed',
					meta: {
						model: 'haiku',
						session_id: 's1',
						session_file: '/tmp/s1.jsonl',
						ttft_ms: 50,
						duration_ms: 1000,
						cost: {
							input_tokens: 10,
							output_tokens: 20,
							cache_read_tokens: 0,
							cache_write_tokens: 0,
							usd: 0.01,
						},
					},
				},
				sonnet: {
					status: 'completed',
					meta: {
						model: 'sonnet',
						session_id: 's2',
						session_file: '/tmp/s2.jsonl',
						ttft_ms: 50,
						duration_ms: 2000,
						cost: {
							input_tokens: 30,
							output_tokens: 40,
							cache_read_tokens: 0,
							cache_write_tokens: 0,
							usd: 0.5,
						},
					},
				},
			},
		});
		const out = buildHistoryTable([execWithMeta], { id: 'totalcost' });
		expect(out).toContain('Total cost: $0.5100');
	});

	it('omits the total cost line when no step has cost meta', () => {
		const execNoCost = makeExec({
			executionId: 'nocost',
			steps: {
				'script-step': { status: 'completed', meta: { duration_ms: 500, exit_code: 0 } },
			},
		});
		const out = buildHistoryTable([execNoCost], { id: 'nocost' });
		expect(out).not.toContain('Total cost');
	});
});

describe('buildHistoryTable --id edge cases', () => {
	it('lists the candidates when the prefix is ambiguous', () => {
		const out = buildHistoryTable([makeExec({ executionId: 'abc1' }), makeExec({ executionId: 'abc2' })], {
			id: 'abc',
		});
		expect(out).toBe('Ambiguous execution ID prefix "abc" -- matches: abc1, abc2');
	});

	it('prints error, stdout and stderr of a failed step, indented', () => {
		const exec = makeExec({
			executionId: 'failed01',
			steps: {
				build: {
					status: 'failed',
					error: 'Script exited with code 2',
					stdout: 'line1\nline2',
					stderr: 'oops',
				},
				quiet: { status: 'failed' },
			},
		});
		const out = buildHistoryTable([exec], { id: 'failed01' });
		expect(out).toContain("Step 'build' failed:");
		expect(out).toContain('  Error:  Script exited with code 2');
		expect(out).toContain('  Stdout:\n    line1\n    line2');
		expect(out).toContain('  Stderr:\n    oops');
		// A failed step without any output adds no section.
		expect(out).not.toContain("Step 'quiet' failed:");
	});

	it('applies status/flow filters to the id lookup too', () => {
		const out = buildHistoryTable([makeExec({ executionId: 'abc', status: 'completed' })], {
			id: 'abc',
			status: 'failed',
		});
		expect(out).toBe("Execution 'abc' not found.");
	});
});

describe('buildHistoryTable pagination', () => {
	const many = Array.from({ length: 5 }, (_, i) => makeExec({ executionId: `id${i}` }));

	it('points at the next page when more rows remain', () => {
		const out = buildHistoryTable(many, { limit: 2 });
		expect(out).toContain('Showing 1-2 of 5. Use --offset 2 for next page.');
	});

	it('shows the range without a next-page hint on the last page', () => {
		const out = buildHistoryTable(many, { limit: 2, offset: 4 });
		expect(out).toContain('Showing 5-5 of 5.');
		expect(out).not.toContain('--offset');
	});

	it('says there is nothing past the end', () => {
		expect(buildHistoryTable(many, { offset: 10 })).toBe('No more executions (showing 10+).');
	});
});

describe('buildHistoryTable versions', () => {
	const versioned = makeExec({
		executionId: 'v1',
		flowVersion: '1.2.0',
		definitionHash: 'a'.repeat(64),
		definitionSnapshot: 'test-flow/1.2.0-aaaaaaaaaaaa.yml',
		versionChoice: 'pinned',
	});
	const legacy = makeExec({ executionId: 'old1' });

	it('adds a VERSION column: the recorded version, or a dash for a record without one', () => {
		const lines = buildHistoryTable([versioned, legacy], {}).split('\n');
		expect(lines[0]).toMatch(/FLOW\s+VERSION\s+STATUS/);
		expect(lines.find(line => line.startsWith('v1'))).toMatch(/test-flow\s+1\.2\.0\s+completed/);
		expect(lines.find(line => line.startsWith('old1'))).toMatch(/test-flow\s+-\s+completed/);
	});

	it('shows how the version was chosen in the detail view, and says when it was not recorded', () => {
		expect(buildHistoryTable([versioned], { id: 'v1' })).toContain(
			'Version:   1.2.0 (pinned by the request, definition aaaaaaaaaaaa)'
		);
		expect(buildHistoryTable([legacy], { id: 'old1' })).toContain('Version:   not recorded');
	});
});

describe('renderDetailView project line', () => {
	it('prints a Project line right after Flow when the record has a project', () => {
		const out = buildHistoryTable([makeExec({ executionId: 'p1', projectId: 'a1b2c3d4' })], { id: 'p1' });
		const lines = out.split('\n');
		expect(lines[1]).toMatch(/^Flow:/);
		expect(lines[2]).toBe('Project:   a1b2c3d4');
	});

	it('uses the lookup for the name and prints no Project line for a record without a project', () => {
		const withName = buildHistoryTable(
			[makeExec({ executionId: 'p1', projectId: 'a1b2c3d4' })],
			{ id: 'p1' },
			() => ({
				kind: 'known',
				name: 'app',
			})
		);
		expect(withName).toContain('Project:   app (a1b2c3d4)');
		expect(buildHistoryTable([makeExec({ executionId: 'p2' })], { id: 'p2' })).not.toContain('Project:');
	});
});
