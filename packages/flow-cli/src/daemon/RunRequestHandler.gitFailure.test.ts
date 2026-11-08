/**
 * A native workspace whose git setup fails refuses the run at start: the client gets WORKSPACE_GIT_FAILED with the
 * attempted strategy, git's words and the fix, nothing is recorded or left on disk, and the run never goes on in an empty
 * directory. A manual directory without git is only a warning, but it lands in the log of the execution.
 *
 * REAL WorkspaceManager, git, ExecutionStore (temp dir) and CommandHandler; only the worker pool and log writer are stubs.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ExecutionStore } from '../storage/ExecutionStore';
import type { CommandHandler } from './CommandHandler';
import { TrackedCommandHandler, registerFolderAsProject } from './CommandHandlerTestHarness';

function flowYaml(mode: string, gitStrategy: string): string {
	return `\
id: git-flow
version: "1.0.0"
name: Git Flow
description: x
workspace:
  mode: ${mode}
  gitStrategy: ${gitStrategy}
  reusePolicy: if-available
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

describe('RunRequestHandler -- native workspace git setup', () => {
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

	function writeFlow(mode: string, gitStrategy: string): string {
		const flowFile = path.join(tmpDir, 'git-flow.yml');
		fs.writeFileSync(flowFile, flowYaml(mode, gitStrategy));
		return flowFile;
	}

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-git-failure-'));
		({ dispose: disposeProject } = await registerFolderAsProject(tmpDir));
		fs.mkdirSync(path.join(tmpDir, 'daemon'), { recursive: true });
		vi.clearAllMocks();
		fs.mkdirSync(path.join(tmpDir, 'executions'), { recursive: true });
		store = new ExecutionStore(path.join(tmpDir, 'executions'));
		logWriter = { write: vi.fn(), writeExecution: vi.fn() };
		handler = new TrackedCommandHandler(
			path.join(tmpDir, 'daemon'),
			pool as never,
			pool as never,
			undefined,
			store,
			logWriter as never,
			false
		);
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	});

	afterEach(() => {
		handler.stopBackgroundWork();
		disposeProject();
		vi.restoreAllMocks();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it.each(['main-only', 'any', 'feature-branch', 'worktree'])(
		'refuses a %s run outside a git repository with WORKSPACE_GIT_FAILED and leaves nothing behind',
		async strategy => {
			const flowFile = writeFlow('isolated', strategy);

			const response = await handler.handleRun({
				type: 'run',
				flowFile,
				cwd: tmpDir,
				requestId: 'req-1',
			} as never);

			expect(response.type).toBe('error');
			const failure = response as { code: string; message: string };
			expect(failure.code).toBe('WORKSPACE_GIT_FAILED');
			expect(failure.message).toContain(`gitStrategy "${strategy}"`);
			expect(failure.message).toContain('not a git repository');
			expect(failure.message).toContain('run flow from inside the repository');
			expect(failure.message).toContain('gitStrategy "none"');
			// The allocation comes before the record, as for every other refusal at this stage: no record, no workspace, nothing running.
			expect(recordIds()).toEqual([]);
			expect(leftovers()).toEqual([]);
			expect(handler.hasActiveExecutions()).toBe(false);
			expect(pool.send).not.toHaveBeenCalled();
			expect(logWriter.writeExecution).toHaveBeenCalledWith(
				'__workspace',
				expect.stringContaining('WORKSPACE_GIT_FAILED'),
				'error'
			);
		}
	);

	it('answers a retry with the same request id with the same refusal', async () => {
		const flowFile = writeFlow('isolated', 'main-only');
		const cmd = { type: 'run', flowFile, cwd: tmpDir, requestId: 'req-1' } as never;

		const first = await handler.handleRun(cmd);
		const second = await handler.handleRun(cmd);

		expect(second).toEqual(first);
	});

	it('still starts a run with gitStrategy none outside a git repository', async () => {
		const flowFile = writeFlow('isolated', 'none');

		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(response.type).toBe('execution_started');
	});

	it('starts a manual run in a directory that is not a git repository, with the warning in the execution log', async () => {
		const flowFile = writeFlow('manual', 'any');

		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(response.type).toBe('execution_started');
		const executionId = (response as { executionId: string }).executionId;
		expect(logWriter.writeExecution).toHaveBeenCalledWith(
			executionId,
			expect.stringContaining('is not a git repository'),
			'warning'
		);
		expect(logWriter.writeExecution).toHaveBeenCalledWith(
			executionId,
			expect.stringContaining('git init'),
			'warning'
		);
	});
});
