/**
 * A workspace that cannot be provided refuses the run at start: the client gets the reason (the validation issue of a
 * removed legacy block, or the message of the provider that failed to allocate), nothing is recorded or left on disk,
 * and no step starts. A project folder without git is only a warning, and it lands in the log of the execution.
 *
 * REAL built-in providers, ExecutionStore (temp dir) and CommandHandler; only the worker pool and log writer are stubs.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ExecutionStore } from '../storage/ExecutionStore';
import { FixedWorkspaceProviders } from '../workspace/FixedWorkspaceProviders';
import type { CommandHandler } from './CommandHandler';
import { TrackedCommandHandler, registerFolderAsProject } from './CommandHandlerTestHarness';

function flowYaml(workspace: string): string {
	return `\
id: git-flow
version: "1.0.0"
name: Git Flow
description: x
workspace: ${workspace}
inputs: {}
steps:
  - id: a
    name: A
    type: script
    script: echo a
`;
}

const pool = {
	describe: vi.fn().mockReturnValue({ workerId: 'w-test', sourceId: 'built-in:fork' }),
	remove: vi.fn(),
	getIdle: vi.fn().mockReturnValue(undefined),
	listIdle: vi.fn(() => []),
	markBusy: vi.fn(),
	markIdle: vi.fn(),
	hasBusyWorkers: vi.fn().mockReturnValue(false),
	send: vi.fn().mockReturnValue(true),
	broadcast: vi.fn(),
	register: vi.fn(),
	canProvision: vi.fn().mockReturnValue(false),
	planProvisioning: vi.fn().mockReturnValue({ fork: 0 }),
	provision: vi.fn().mockResolvedValue(undefined),
	registerWorker: vi.fn().mockReturnValue(true),
	listConnected: vi.fn((): unknown[] => []),
};

describe('RunRequestHandler -- a workspace that cannot be provided', () => {
	let tmpDir: string;
	let disposeProject: () => void;
	let store: ExecutionStore;
	let handler: CommandHandler;
	let logWriter: { write: ReturnType<typeof vi.fn>; writeExecution: ReturnType<typeof vi.fn> };

	function recordIds(): string[] {
		const dir = path.join(tmpDir, 'executions');
		return fs.readdirSync(dir).filter(f => f.endsWith('.json'));
	}

	function leftovers(): string[] {
		const base = path.join(tmpDir, '.flow', 'workspaces');
		return fs.existsSync(base) ? fs.readdirSync(base) : [];
	}

	function writeFlow(workspace: string): string {
		const flowFile = path.join(tmpDir, 'git-flow.yml');
		fs.writeFileSync(flowFile, flowYaml(workspace));
		return flowFile;
	}

	function newHandler(workspaceProviders?: FixedWorkspaceProviders): CommandHandler {
		return new TrackedCommandHandler(
			path.join(tmpDir, 'daemon'),
			pool as never,
			pool as never,
			undefined,
			store,
			logWriter as never,
			false,
			undefined,
			undefined,
			workspaceProviders
		);
	}

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-git-failure-'));
		({ dispose: disposeProject } = await registerFolderAsProject(tmpDir));
		fs.mkdirSync(path.join(tmpDir, 'daemon'), { recursive: true });
		vi.clearAllMocks();
		fs.mkdirSync(path.join(tmpDir, 'executions'), { recursive: true });
		store = new ExecutionStore(path.join(tmpDir, 'executions'));
		logWriter = { write: vi.fn(), writeExecution: vi.fn() };
		handler = newHandler();
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	});

	afterEach(() => {
		handler.stopBackgroundWork();
		disposeProject();
		vi.restoreAllMocks();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it.each([
		[
			'{ mode: isolated, gitStrategy: main-only, reusePolicy: if-available }',
			'clone strategies are no longer supported',
		],
		['{ mode: isolated, gitStrategy: any, reusePolicy: if-available }', 'clone strategies are no longer supported'],
		[
			'{ mode: isolated, gitStrategy: feature-branch, reusePolicy: if-available }',
			'clone strategies are no longer supported',
		],
		['{ mode: isolated, gitStrategy: worktree, reusePolicy: if-available }', 'provider: worktree'],
		['{ mode: isolated, gitStrategy: none, reusePolicy: if-available }', 'workspace: in-place'],
		['{ mode: shared, gitStrategy: any, reusePolicy: if-available }', 'provider: pool'],
	])(
		'refuses the removed legacy block %s with VALIDATION_FAILED naming the fix, and leaves nothing behind',
		async (block, fix) => {
			const flowFile = writeFlow(block);

			const response = await handler.handleRun({
				type: 'run',
				flowFile,
				cwd: tmpDir,
				requestId: 'req-1',
			} as never);

			expect(response.type).toBe('error');
			const failure = response as { code: string; message: string };
			expect(failure.code).toBe('VALIDATION_FAILED');
			expect(failure.message).toContain('was removed');
			expect(failure.message).toContain(fix);
			expect(recordIds()).toEqual([]);
			expect(leftovers()).toEqual([]);
			expect(handler.hasActiveExecutions()).toBe(false);
			expect(pool.send).not.toHaveBeenCalled();
		}
	);

	it('refuses a flow without workspace with VALIDATION_FAILED, and leaves nothing behind', async () => {
		const flowFile = path.join(tmpDir, 'git-flow.yml');
		fs.writeFileSync(flowFile, flowYaml('in-place').replace('workspace: in-place\n', ''));

		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(response.type).toBe('error');
		const failure = response as { code: string; message: string };
		expect(failure.code).toBe('VALIDATION_FAILED');
		expect(failure.message).toContain('does not declare a workspace');
		expect(recordIds()).toEqual([]);
		expect(pool.send).not.toHaveBeenCalled();
	});

	it('refuses the run with WORKSPACE_ERROR carrying the message of the provider that cannot allocate, and leaves nothing behind', async () => {
		const provider = { allocate: vi.fn().mockRejectedValue(new Error('disk full')), release: vi.fn() };
		handler.stopBackgroundWork();
		handler = newHandler(new FixedWorkspaceProviders(provider as never));
		const flowFile = writeFlow('in-place');

		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir, requestId: 'req-1' } as never);

		expect(response).toEqual({
			type: 'error',
			code: 'WORKSPACE_ERROR',
			message: 'Failed to allocate the workspace: disk full',
		});
		expect(provider.allocate).toHaveBeenCalledOnce();
		expect(recordIds()).toEqual([]);
		expect(leftovers()).toEqual([]);
		expect(handler.hasActiveExecutions()).toBe(false);
		expect(pool.send).not.toHaveBeenCalled();
		expect(logWriter.writeExecution).toHaveBeenCalledWith(
			'__workspace',
			expect.stringContaining('WORKSPACE_ERROR detail: Error: disk full'),
			'error'
		);
	});

	it('refuses a worktree run outside a git repository with WORKSPACE_GIT_FAILED and the cause, and leaves nothing behind', async () => {
		const flowFile = writeFlow('{ provider: worktree, baseDir: ../worktrees }');

		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir, requestId: 'req-1' } as never);

		expect(response.type).toBe('error');
		expect((response as { code: string }).code).toBe('WORKSPACE_GIT_FAILED');
		expect((response as { message: string }).message).toContain('is not a git repository');
		expect(recordIds()).toEqual([]);
		expect(leftovers()).toEqual([]);
		expect(handler.hasActiveExecutions()).toBe(false);
		expect(pool.send).not.toHaveBeenCalled();
	});

	it('answers a retry with the same request id with the same refusal', async () => {
		const provider = { allocate: vi.fn().mockRejectedValue(new Error('disk full')), release: vi.fn() };
		handler.stopBackgroundWork();
		handler = newHandler(new FixedWorkspaceProviders(provider as never));
		const flowFile = writeFlow('in-place');
		const cmd = { type: 'run', flowFile, cwd: tmpDir, requestId: 'req-1' } as never;

		const first = await handler.handleRun(cmd);
		const second = await handler.handleRun(cmd);

		expect(first.type).toBe('error');
		expect(second).toEqual(first);
	});

	it('starts an in-place run in a directory that is not a git repository, with the warning in the execution log', async () => {
		const flowFile = writeFlow('in-place');

		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(response.type).toBe('execution_started');
		const executionId = (response as { executionId: string }).executionId;
		expect(logWriter.writeExecution).toHaveBeenCalledWith(
			executionId,
			expect.stringContaining('is not a git repository'),
			'warning'
		);
	});

	it('still starts a legacy "mode: manual" run, with the deprecation in the execution log', async () => {
		const flowFile = writeFlow('{ mode: manual, gitStrategy: any, reusePolicy: if-available }');

		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(response.type).toBe('execution_started');
		const executionId = (response as { executionId: string }).executionId;
		expect(logWriter.writeExecution).toHaveBeenCalledWith(
			executionId,
			expect.stringContaining('"mode: manual" is deprecated'),
			'warning'
		);
	});
});
