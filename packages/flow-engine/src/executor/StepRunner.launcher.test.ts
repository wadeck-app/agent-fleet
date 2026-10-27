/**
 * StepRunner is the single injection point of the ProcessLauncher (C4 seam): the same launcher reaches
 * the script executor, the three default providers and the model step executor.
 * Real child_process functions throw, so a direct use fails the test.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeProcessLauncher, createFakeChild } from '../test-utils/FakeProcessLauncher';
import type { ModelFlowStep, ScriptFlowStep, Workspace } from '../types';
import { StepRunner } from './StepRunner';

vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	const forbidden = (): never => {
		throw new Error('direct child_process use bypasses the ProcessLauncher seam');
	};
	return { ...actual, spawn: forbidden, spawnSync: forbidden, execSync: forbidden };
});

const workspace: Workspace = {
	id: 'ws-test',
	mode: 'isolated',
	path: process.cwd(),
	metaDir: `${process.cwd()}.meta`,
	concurrency: { key: 'test', activeTasks: new Set(), locked: false },
	createdAt: new Date().toISOString(),
	lastUsedAt: new Date().toISOString(),
	usageCount: 0,
};
const context = { inputs: {}, stepOutputs: new Map(), taskMetadata: {} };

const MOCK_ENV_VARS = ['CLAUDE_MOCK_PATH', 'OPENCODE_MOCK_PATH', 'CODEX_MOCK_PATH'] as const;

describe('StepRunner -- ProcessLauncher seam', () => {
	afterEach(() => {
		for (const name of MOCK_ENV_VARS) delete process.env[name];
		vi.restoreAllMocks();
	});

	async function runWithFakeChild(
		runner: StepRunner,
		fake: FakeProcessLauncher,
		step: ScriptFlowStep | ModelFlowStep
	): Promise<void> {
		const child = createFakeChild(2468);
		fake.queueChild(child);
		const done = runner.executeStep(step, workspace, context);
		await vi.waitFor(() => expect(fake.callsOf('spawn')).toHaveLength(1));
		child.emit('exit', 0);
		child.emit('close', 0);
		await done;
	}

	it('runs a script step through the launcher', async () => {
		const fake = new FakeProcessLauncher();
		const step: ScriptFlowStep = { id: 's', name: 'S', type: 'script', script: 'echo hi' };

		await runWithFakeChild(new StepRunner({ interactive: false, processLauncher: fake }), fake, step);

		expect(fake.callsOf('spawn').map(call => call.command)).toEqual(['echo hi']);
	});

	it.each([
		['claude', 'CLAUDE_MOCK_PATH', '/mock/claude'],
		['opencode', 'OPENCODE_MOCK_PATH', '/mock/opencode'],
		['codex', 'CODEX_MOCK_PATH', '/mock/codex'],
	] as const)('runs a %s model step through the launcher', async (provider, envVar, mockPath) => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		process.env[envVar] = mockPath;
		const fake = new FakeProcessLauncher();
		const step: ModelFlowStep = {
			id: 'm',
			name: 'M',
			type: 'model',
			provider,
			model: 'haiku',
			prompt: 'Hello',
		};

		await runWithFakeChild(new StepRunner({ interactive: false, processLauncher: fake }), fake, step);

		expect(fake.callsOf('spawn').map(call => call.command)).toEqual([mockPath]);
	});
});
