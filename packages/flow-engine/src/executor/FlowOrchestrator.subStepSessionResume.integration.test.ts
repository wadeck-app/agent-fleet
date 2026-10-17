/**
 * Sub-step failure feedback is delivered into the parent's EXISTING session.
 *
 * Real FlowOrchestrator + StepRunner + OpenCodeModelProvider + real script children; only the
 * opencode CLI is replaced (OPENCODE_MOCK_PATH) by a recording mock that logs the `--session`
 * argument and the prompt of every call, so the assertions look at what the CLI would have received.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OpenCodeModelProvider } from '../processing/OpenCodeModelProvider';
import type { TemplateContext } from '../processing/TemplateRenderer';
import type { FlowDefinition, ModelFlowStep, Workspace } from '../types';
import { FlowOrchestrator } from './FlowOrchestrator';
import { StepRunner } from './StepRunner';

const TIMEOUT = 60_000;

/** Logs {n, session, prompt} per call; echoes the resumed session id, else mints ses_run<n>. */
function buildRecordingMock(logFile: string, counterFile: string): string {
	return `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
const LOG = ${JSON.stringify(logFile.replace(/\\/g, '/'))};
const COUNTER = ${JSON.stringify(counterFile.replace(/\\/g, '/'))};
const argv = process.argv.slice(2);
const n = (existsSync(COUNTER) ? parseInt(readFileSync(COUNTER, 'utf8') || '0', 10) : 0) + 1;
writeFileSync(COUNTER, String(n));
const sIdx = argv.indexOf('--session');
const session = sIdx >= 0 ? argv[sIdx + 1] : undefined;
const consumed = new Set();
for (let i = 0; i < argv.length; i++) {
  if (['--format', '-m', '--session', '--attach'].includes(argv[i])) { consumed.add(i); consumed.add(i + 1); }
  else if (argv[i].startsWith('-')) consumed.add(i);
}
const positional = argv.filter((_, i) => !consumed.has(i) && argv[i] !== 'run');
const prompt = positional[positional.length - 1] ?? '';
appendFileSync(LOG, JSON.stringify({ n, session, prompt }) + '\\n');
const sid = session ?? 'ses_run' + n;
const now = Date.now();
const emit = o => process.stdout.write(JSON.stringify(o) + '\\n');
emit({ type: 'step_start', timestamp: now, sessionID: sid, part: { type: 'step-start', messageID: 'm' + n, sessionID: sid, snapshot: 'mock' } });
emit({ type: 'text', timestamp: now + 10, sessionID: sid, part: { type: 'text', text: 'answer-' + n, time: { start: now + 10, end: now + 20 } } });
emit({ type: 'step_finish', timestamp: now + 30, sessionID: sid, part: { type: 'step-finish', reason: 'stop', messageID: 'm' + n, sessionID: sid, tokens: { total: 10, input: 5, output: 5, reasoning: 0, cache: { write: 0, read: 0 } }, cost: 0.001 } });
process.exit(0);
`;
}

interface Call {
	n: number;
	session?: string;
	prompt: string;
}

let tmpDir: string;
let logFile: string;
let prevMockPath: string | undefined;

beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), 'flow-substep-resume-'));
	logFile = join(tmpDir, 'calls.jsonl');
	writeFileSync(logFile, '');
	const mockPath = join(tmpDir, 'recording-mock.mjs');
	writeFileSync(mockPath, buildRecordingMock(logFile, join(tmpDir, 'counter.txt')));
	prevMockPath = process.env['OPENCODE_MOCK_PATH'];
	process.env['OPENCODE_MOCK_PATH'] = mockPath;
});

afterEach(() => {
	if (prevMockPath === undefined) delete process.env['OPENCODE_MOCK_PATH'];
	else process.env['OPENCODE_MOCK_PATH'] = prevMockPath;
	rmSync(tmpDir, { recursive: true, force: true });
});

function calls(): Call[] {
	return readFileSync(logFile, 'utf8')
		.split('\n')
		.filter(line => line.trim() !== '')
		.map(line => JSON.parse(line) as Call);
}

function workspace(): Workspace {
	return {
		id: 'resume-ws',
		path: tmpDir,
		metaDir: tmpDir,
		mode: 'shared',
		concurrency: { key: 'resume', activeTasks: new Set(), locked: false },
		createdAt: new Date().toISOString(),
		lastUsedAt: new Date().toISOString(),
		usageCount: 0,
	};
}

function orchestrator(): FlowOrchestrator {
	const runner = new StepRunner({
		interactive: false,
		providers: new Map([['opencode', new OpenCodeModelProvider()]]),
	});
	return new FlowOrchestrator(runner);
}

function context(): TemplateContext {
	return { inputs: { task: 'T1' }, stepOutputs: new Map(), taskMetadata: {} };
}

/** A script that writes `message` to stderr and exits 1 the first `failTimes` runs, then passes. */
function flakyScript(name: string, message: string, failTimes: number): string {
	const counter = join(tmpDir, `${name}.count`).replace(/\\/g, '/');
	return [
		`N=$(cat "${counter}" 2>/dev/null || echo 0)`,
		`echo $((N + 1)) > "${counter}"`,
		`if [ "$N" -lt ${String(failTimes)} ]; then printf "%s" "${message}" >&2; exit 1; fi`,
		'echo ok',
	].join('\n');
}

function parentStep(extra: Record<string, unknown> = {}): ModelFlowStep {
	return {
		id: 'phase',
		name: 'Phase',
		type: 'model',
		provider: 'opencode',
		prompt: 'ORIGINAL-PROMPT task=${{ inputs.task }}{% if subSteps.verify.status.failed %} FEEDBACK-IN-PROMPT:${{ subStepFeedback }}{% endif %}',
		...extra,
	} as ModelFlowStep;
}

function flow(steps: FlowDefinition['steps']): FlowDefinition {
	return {
		id: 'resume-flow',
		version: '1.0.0',
		name: 'Resume',
		description: 'sub-step feedback resumes the parent session',
		workspace: { mode: 'shared', gitStrategy: 'any', reusePolicy: 'always' },
		inputs: { task: 'string' },
		steps,
	};
}

describe('sub-step failure feedback resumes the parent session (in-process orchestrator)', () => {
	it(
		'relaunches the parent with --session <first run session>, sends only the feedback, and the first launch is unchanged',
		async () => {
			const result = await orchestrator().orchestrate(
				'task-resume-1',
				flow([
					parentStep(),
					{
						id: 'verify',
						name: 'Verify',
						type: 'script',
						parent: 'phase',
						script: flakyScript('verify', 'E1', 1),
					},
				]),
				workspace(),
				context()
			);

			expect(result.success).toBe(true);
			const recorded = calls();
			expect(recorded).toHaveLength(2);

			// Acceptance 3: first launch unchanged
			expect(recorded[0]?.session).toBeUndefined();
			expect(recorded[0]?.prompt).toBe('ORIGINAL-PROMPT task=T1');

			// Acceptance 1: second launch resumes the session captured on the first run
			expect(recorded[1]?.session).toBe('ses_run1');
			// Acceptance 2: feedback only
			expect(recorded[1]?.prompt).toContain('E1');
			expect(recorded[1]?.prompt).not.toContain('ORIGINAL-PROMPT');
			expect(recorded[1]?.prompt).not.toContain('FEEDBACK-IN-PROMPT');
		},
		TIMEOUT
	);

	it(
		'delivers every failing sub-step in ONE message with wait-all, stderr preferred over stdout',
		async () => {
			const result = await orchestrator().orchestrate(
				'task-resume-4',
				flow([
					parentStep({ subStepStrategy: 'wait-all' }),
					{
						id: 'check_a',
						name: 'A',
						type: 'script',
						parent: 'phase',
						script: `echo STDOUT-A\n${flakyScript('a', 'E-A', 1)}`,
					},
					{ id: 'check_b', name: 'B', type: 'script', parent: 'phase', script: flakyScript('b', 'E-B', 1) },
				]),
				workspace(),
				context()
			);

			expect(result.success).toBe(true);
			const recorded = calls();
			expect(recorded).toHaveLength(2);
			expect(recorded[1]?.session).toBe('ses_run1');
			expect(recorded[1]?.prompt).toContain('[check_a]');
			expect(recorded[1]?.prompt).toContain('E-A');
			expect(recorded[1]?.prompt).toContain('[check_b]');
			expect(recorded[1]?.prompt).toContain('E-B');
			expect(recorded[1]?.prompt).not.toContain('STDOUT-A');
			expect(recorded[1]?.prompt).not.toContain('ORIGINAL-PROMPT');
		},
		TIMEOUT
	);

	it(
		'keeps resuming the SAME conversation over several relaunches',
		async () => {
			const result = await orchestrator().orchestrate(
				'task-resume-multi',
				flow([
					parentStep({ maxSubStepIterations: 3 }),
					{
						id: 'verify',
						name: 'Verify',
						type: 'script',
						parent: 'phase',
						script: flakyScript('verify', 'E-N', 2),
					},
				]),
				workspace(),
				context()
			);

			expect(result.success).toBe(true);
			expect(calls().map(c => c.session)).toEqual([undefined, 'ses_run1', 'ses_run1']);
		},
		TIMEOUT
	);

	it(
		'still fails the parent terminally, with the same message, once maxSubStepIterations is exhausted',
		async () => {
			const result = await orchestrator().orchestrate(
				'task-resume-6',
				flow([
					parentStep({ maxSubStepIterations: 1 }),
					{
						id: 'verify',
						name: 'Verify',
						type: 'script',
						parent: 'phase',
						script: flakyScript('verify', 'E1', 99),
					},
				]),
				workspace(),
				context()
			);

			expect(result.success).toBe(false);
			// The orchestrator reports the step whose outcome ended the flow (the failing child), as before
			expect(result.error).toMatch(/^Step 'verify' failed: /);
			// initial launch + 1 relaunch
			expect(calls()).toHaveLength(2);
		},
		TIMEOUT
	);
});
