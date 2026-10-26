/**
 * Characterization tests: pin the CURRENT behavior (green on unchanged code) of project workspace pruning and of
 * where the `.meta` of a plugin-provided workspace lives. Known gap pinned here: the `.meta` of a plugin-provided
 * workspace is never pruned, because only `<project>/.flow/workspaces` is scanned.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowConfig } from '../config/FlowConfig';
import type { LogWriter } from '../storage/LogWriter';
import { ExecutionWorkspaces } from './ExecutionWorkspaces';
import { pruneProjectWorkspaces } from './pruneProjectWorkspaces';

const DAY_MS = 24 * 60 * 60 * 1000;

function age(target: string, days: number): void {
	const when = new Date(Date.now() - days * DAY_MS);
	fs.utimesSync(target, when, when);
}

describe('pruneProjectWorkspaces (characterization)', () => {
	let root: string;
	const config = { workspace: { retainDays: 30, maxWorkspaces: 50 } } as FlowConfig;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-project-char-'));
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('prunes expired built-in workspaces and their .meta under <project>/.flow/workspaces', () => {
		const project = path.join(root, 'project');
		const ws = path.join(project, '.flow', 'workspaces', 'isolated-old');
		fs.mkdirSync(ws, { recursive: true });
		fs.mkdirSync(path.join(ws + '.meta', 'sessions'), { recursive: true });
		age(ws, 40);

		pruneProjectWorkspaces(project, config);

		expect(fs.existsSync(ws)).toBe(false);
		expect(fs.existsSync(ws + '.meta')).toBe(false);
	});

	it('does not touch an expired plugin-provided workspace .meta outside <project>/.flow/workspaces (leak)', () => {
		const project = path.join(root, 'project');
		fs.mkdirSync(path.join(project, '.flow', 'workspaces'), { recursive: true });
		const pluginWs = path.join(root, 'plugin-base', 'task-1');
		fs.mkdirSync(pluginWs, { recursive: true });
		fs.mkdirSync(path.join(pluginWs + '.meta', 'sessions'), { recursive: true });
		age(pluginWs, 400);
		age(pluginWs + '.meta', 400);

		pruneProjectWorkspaces(project, config);

		expect(fs.existsSync(pluginWs)).toBe(true);
		expect(fs.existsSync(pluginWs + '.meta')).toBe(true);
	});
});

describe('ExecutionWorkspaces plugin path (characterization)', () => {
	let root: string;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-ws-char-'));
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('creates <handle.path>.meta/outputs at allocation and leaves .meta in place after release', async () => {
		const handlePath = path.join(root, 'task-1');
		const provider = {
			allocate: vi.fn().mockResolvedValue({ path: handlePath, id: 'p:1' }),
			release: vi.fn().mockResolvedValue(undefined),
		};
		const workspaces = new ExecutionWorkspaces({ writeExecution: vi.fn() } as unknown as LogWriter, provider);

		const result = await workspaces.allocate(root, { id: 'f', version: '1.0.0' } as never, 'exec-1');

		expect(result).toEqual({ ok: true, workspaceDir: handlePath, workspaceMetaDir: handlePath + '.meta' });
		expect(fs.existsSync(path.join(handlePath + '.meta', 'outputs'))).toBe(true);

		workspaces.release('exec-1');
		await vi.waitFor(() => expect(provider.release).toHaveBeenCalledTimes(1));
		expect(fs.existsSync(handlePath + '.meta')).toBe(true);
	});
});
