import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RunMounts } from '../RunMounts';
import type { JsonObject } from '../harness/HarnessMessages';
import { failure } from '../testing/ExpectedFailures';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { ExecAssignment } from './ExecAssignment';

let root: string;
let workspace: string;
let meta: string;
let elsewhere: string;
let log: RecordingSandboxLog;
let assignment: ExecAssignment;

beforeEach(() => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-exec-assignment-')));
	workspace = path.join(root, 'ws');
	meta = path.join(root, 'ws.meta');
	elsewhere = path.join(root, 'elsewhere');
	for (const directory of [workspace, path.join(meta, 'outputs'), elsewhere])
		fs.mkdirSync(directory, { recursive: true });
	log = new RecordingSandboxLog();
	assignment = new ExecAssignment({
		mounts: new RunMounts({ workspaceDir: workspace, workspaceMetaDir: meta, platform: process.platform, log }),
		injectedEnv: (type): Record<string, string> => (type === 'model' ? { CLAUDE_CODE_USE_BEDROCK: '1' } : {}),
		log,
	});
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

function assign(overrides: { step?: JsonObject; context?: JsonObject } = {}): JsonObject {
	return {
		type: 'assign',
		assignmentId: 'a1',
		stepId: 's1',
		stepConfig: { id: 's1', type: 'script', script: 'echo hi', ...overrides.step },
		executionContext: {
			executionId: 'run1',
			workspaceDir: workspace,
			outputsDir: path.join(meta, 'outputs'),
			cwd: workspace,
			...overrides.context,
		},
	};
}

const refusal = failure;

describe('ExecAssignment', () => {
	it('keeps host paths and the step as is for a script step, and declares the env names (wrapper values included) and the secrets of a model step', () => {
		const prepared = assignment.prepare(assign());
		expect(prepared).toMatchObject({ assignmentId: 'a1', stepId: 's1', executionId: 'run1', stepType: 'script' });
		expect(prepared.executionContext['workspaceDir']).toBe(workspace);
		expect(prepared.stepConfig['env']).toEqual({});
		expect([...prepared.declaredEnvironmentNames]).toEqual([]);

		const model = assignment.prepare(
			assign({ step: { type: 'model', env: { OWN: 'x' }, secrets: ['API_TOKEN', 3] } })
		);
		expect([...model.declaredEnvironmentNames].sort()).toEqual(['API_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'OWN']);
	});

	it('adds the wrapper environment to a model step and ignores a conflicting flow value with a warning', () => {
		const prepared = assignment.prepare(
			assign({ step: { type: 'model', env: { CLAUDE_CODE_USE_BEDROCK: '0', OWN: 'x', NUMBER: 3 } } })
		);
		expect(prepared.stepConfig['env']).toEqual({ OWN: 'x', CLAUDE_CODE_USE_BEDROCK: '1' });
		expect(log.text()).toMatch(/CLAUDE_CODE_USE_BEDROCK is set by the sandbox wrapper/);
	});

	it('replaces a cwd outside the mounts by the workspace and says so', () => {
		const prepared = assignment.prepare(assign({ context: { cwd: elsewhere } }));
		expect(prepared.executionContext['cwd']).toBe(workspace);
		expect(log.text()).toMatch(/is outside the sandbox mounts; the step sees the workspace/);
	});

	it('refuses paths that leave the mounts, and accepts a working directory inside them', () => {
		const cases: [string, JsonObject][] = [
			['a workspaceDir outside', assign({ context: { workspaceDir: elsewhere } })],
			['an outputsDir outside', assign({ context: { outputsDir: elsewhere } })],
			['a workingDir outside', assign({ step: { workingDir: path.join(elsewhere, 'sub') } })],
			['a flowWorkingDir outside', assign({ context: { flowWorkingDir: path.join(elsewhere, 'sub') } })],
		];
		for (const [label, raw] of cases) {
			expect(refusal(() => assignment.prepare(raw), label).kind, label).toBe('path-outside-mounts');
		}

		const prepared = assignment.prepare(assign({ step: { workingDir: path.join(workspace, 'sub') } }));
		expect(prepared.stepConfig['workingDir']).toBe(path.join(workspace, 'sub'));
	});

	it('refuses a step type a sandbox cannot run, saying where to route it', () => {
		expect(refusal(() => assignment.prepare(assign({ step: { type: 'user_intervention' } }))).message).toMatch(
			/only "model" and "script" steps are supported.*without the "sandbox" label/
		);
		expect(refusal(() => assignment.prepare(assign({ step: { type: 'subflow' } }))).kind).toBe('invalid-argument');
	});

	it('refuses an incomplete assign naming the missing field', () => {
		expect(refusal(() => assignment.prepare({ type: 'ready' })).message).toMatch(/only prepare an "assign"/);
		expect(refusal(() => assignment.prepare({ ...assign(), assignmentId: '' })).message).toMatch(
			/no assignmentId or stepId/
		);
		expect(refusal(() => assignment.prepare({ ...assign(), stepConfig: 3 })).message).toMatch(
			/no stepConfig or executionContext/
		);
		expect(refusal(() => assignment.prepare(assign({ context: { outputsDir: '' } }))).message).toMatch(
			/has no outputsDir/
		);
	});

	it('warns about Windows paths in env values and in the script text, without rewriting them', () => {
		const prepared = assignment.prepare(
			assign({ step: { env: { OUT: 'C:\\somewhere' }, script: 'cat C:\\other\\file' } })
		);
		expect(prepared.stepConfig['script']).toBe('cat C:\\other\\file');
		expect(log.text()).toMatch(/warn: step "s1": .*OUT/);
		expect(log.text()).toMatch(/warn: step "s1": .*C:\\other\\file/);
	});
});
