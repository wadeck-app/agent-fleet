/**
 * A read-only workspace (`workspace: readonly`, or any provider whose handle says `readOnly: true`) is advisory: a flow
 * whose model steps declare tools able to modify the folder is refused before anything runs, and the steps of a flow
 * that is accepted run narrowed (default tools, prompt note, git without index locks).
 *
 * Two layers refuse: the validator for `workspace: readonly` (VALIDATION_FAILED carrying WORKSPACE_READONLY_CONFLICT),
 * and the start of the run for a provider that only decides at allocation time (WORKSPACE_READONLY_CONFLICT).
 *
 * REAL CommandHandler, validator and built-in providers; only the worker pool, execution store and log writer are stubs.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FixedWorkspaceProviders } from '../workspace/FixedWorkspaceProviders';
import type { CommandHandler } from './CommandHandler';
import { TrackedCommandHandler, createMockWorkerPool, registerFolderAsProject } from './CommandHandlerTestHarness';

const FLOW_HEADER = `\
id: readonly-flow
version: "1.0.0"
name: Readonly Flow
description: x
inputs: {}
`;

const WRITING_MODEL_STEP = `\
steps:
  - id: edit-it
    name: Edit it
    type: model
    provider: opencode
    prompt: change the code
    tools: [read, edit]
`;

const NARROWABLE_STEPS = `\
steps:
  - id: ask
    name: Ask
    type: model
    provider: opencode
    prompt: look around
  - id: check
    name: Check
    type: script
    script: git status
    depends: [ask]
`;

/** Assignment sent to a worker, as far as these tests read it. */
interface Assign {
	type: string;
	stepId: string;
	executionContext: Record<string, unknown>;
	stepConfig: { prompt?: string; tools?: string[]; env?: Record<string, string> };
}

describe('RunRequestHandler -- read-only workspace', () => {
	let tmpDir: string;
	let disposeProject: () => void;
	let handler: CommandHandler;
	let pool: ReturnType<typeof createMockWorkerPool>;
	let store: { create: ReturnType<typeof vi.fn> } & Record<string, ReturnType<typeof vi.fn>>;
	let logWriter: { write: ReturnType<typeof vi.fn>; writeExecution: ReturnType<typeof vi.fn> };

	function newHandler(workspaceProviders?: FixedWorkspaceProviders): CommandHandler {
		return new TrackedCommandHandler(
			path.join(tmpDir, 'daemon'),
			pool as never,
			pool as never,
			undefined,
			store as never,
			logWriter as never,
			false,
			undefined,
			undefined,
			workspaceProviders
		);
	}

	function writeFlow(workspace: string, steps: string): string {
		const flowFile = path.join(tmpDir, 'readonly-flow.yml');
		fs.writeFileSync(flowFile, `${FLOW_HEADER}workspace: ${workspace}\n${steps}`);
		return flowFile;
	}

	function assignsSent(): Assign[] {
		return pool.send.mock.calls.map(call => call[1] as Assign).filter(message => message.type === 'assign');
	}

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-readonly-'));
		({ dispose: disposeProject } = await registerFolderAsProject(tmpDir));
		fs.mkdirSync(path.join(tmpDir, 'daemon'), { recursive: true });
		pool = createMockWorkerPool();
		pool.send.mockReturnValue(true);
		store = {
			create: vi.fn(),
			read: vi.fn().mockReturnValue({ steps: {} }),
			exists: vi.fn().mockReturnValue(false),
			markStepRunning: vi.fn(),
			markStepCompleted: vi.fn(),
			markStepFailed: vi.fn(),
			markStepSkipped: vi.fn(),
			markStepsPending: vi.fn(),
			markExecutionCompleted: vi.fn(),
			markExecutionFailed: vi.fn(),
			markExecutionResumed: vi.fn(),
			pruneOldExecutions: vi.fn(),
			update: vi.fn(),
		};
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

	it('refuses "workspace: readonly" with a model step that declares edit, before any record or step', async () => {
		const flowFile = writeFlow('readonly', WRITING_MODEL_STEP);

		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(response.type).toBe('error');
		const failure = response as { code: string; message: string };
		expect(failure.code).toBe('VALIDATION_FAILED');
		expect(failure.message).toContain('WORKSPACE_READONLY_CONFLICT');
		expect(failure.message).toContain('edit-it');
		expect(store.create).not.toHaveBeenCalled();
		expect(handler.hasActiveExecutions()).toBe(false);
		expect(pool.send).not.toHaveBeenCalled();
	});

	it('refuses a read-only handle of another provider with WORKSPACE_READONLY_CONFLICT naming the step and the fix, and releases it', async () => {
		const handle = { id: 'third-party', path: path.join(tmpDir, 'third-party-ws'), readOnly: true };
		const provider = { allocate: vi.fn().mockResolvedValue(handle), release: vi.fn().mockResolvedValue(undefined) };
		handler.stopBackgroundWork();
		handler = newHandler(new FixedWorkspaceProviders(provider as never));
		const flowFile = writeFlow('in-place', WRITING_MODEL_STEP);

		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir, requestId: 'req-1' } as never);

		expect(response.type).toBe('error');
		const failure = response as { code: string; message: string };
		expect(failure.code).toBe('WORKSPACE_READONLY_CONFLICT');
		expect(failure.message).toContain("'edit-it' (edit)");
		expect(failure.message).toContain('Remove write, edit and bash from the "tools"');
		expect(provider.allocate).toHaveBeenCalledOnce();
		await vi.waitFor(() => expect(provider.release).toHaveBeenCalledExactlyOnceWith(handle));
		expect(store.create).not.toHaveBeenCalled();
		expect(handler.hasActiveExecutions()).toBe(false);
		expect(pool.send).not.toHaveBeenCalled();
		expect(logWriter.writeExecution).toHaveBeenCalledWith(
			'__workspace',
			expect.stringContaining('WORKSPACE_READONLY_CONFLICT'),
			'error'
		);
	});

	it('starts "workspace: readonly" with steps narrowed: default tools, prompt note, no git locks, and the context says read-only', async () => {
		pool.getIdle.mockReturnValue({});
		const flowFile = writeFlow('readonly', NARROWABLE_STEPS);

		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(response.type).toBe('execution_started');
		handler.tryDispatch();
		const [first] = assignsSent();
		expect(first).toBeDefined();
		expect(first!.stepId).toBe('ask');
		expect(first!.executionContext['workspaceReadOnly']).toBe(true);
		expect(first!.stepConfig.tools).toEqual(['read', 'glob', 'grep']);
		expect(first!.stepConfig.prompt).toContain('look around');
		expect(first!.stepConfig.prompt).toContain('this workspace is shared and read-only');
		expect(first!.stepConfig.env).toMatchObject({ GIT_OPTIONAL_LOCKS: '0' });
	});

	it('gives the script step of a read-only workspace GIT_OPTIONAL_LOCKS=0 and leaves its command alone', async () => {
		pool.getIdle.mockReturnValue({});
		const flowFile = writeFlow('readonly', NARROWABLE_STEPS);
		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		const executionId = (response as { executionId: string }).executionId;
		handler.tryDispatch();
		handler.onStepCompleted(executionId, 'ask', {});
		handler.tryDispatch();

		const script = assignsSent().find(assign => assign.stepId === 'check');

		expect(script).toBeDefined();
		expect(script!.executionContext['workspaceReadOnly']).toBe(true);
		expect(script!.stepConfig.env).toMatchObject({ GIT_OPTIONAL_LOCKS: '0' });
		expect(script!.stepConfig.tools).toBeUndefined();
	});
});
