import * as fs from 'node:fs';
import * as path from 'node:path';

import { FixedWorkspaceProviders } from '../workspace/FixedWorkspaceProviders';
import type { CommandHandler } from './CommandHandler';
import {
	TrackedCommandHandler,
	VALID_FLOW_YAML,
	createMockWorkerPool,
	daemonDir,
	mockExecStore,
	mockLogWriter,
	registerCommandHandlerHooks,
	tmpDir,
} from './CommandHandlerTestHarness';

const { mockAllocate, mockRelease, hoistedState } = vi.hoisted(() => ({
	mockAllocate: vi.fn().mockResolvedValue({ path: '/tmp/test-workspace', id: 'ws-test-id' }),
	mockRelease: vi.fn().mockResolvedValue(undefined),
	hoistedState: { actualHomedir: '' as string },
}));

vi.mock('node:os', async importOriginal => {
	const actual = (await importOriginal()) as typeof import('node:os');
	hoistedState.actualHomedir = actual.homedir();
	return {
		...actual,
		homedir: vi.fn().mockImplementation(() => actual.homedir()),
	};
});

registerCommandHandlerHooks({ mockAllocate, mockRelease, hoistedState });

describe('CommandHandler — per-flow workspace override', () => {
	const FLOW_WITH_USE = `\
id: override-flow
version: "1.0.0"
name: Override Flow
description: test
inputs: {}
plugins:
  workspace:
    use: my-instance
steps:
  - id: s1
    name: S1
    type: script
    script: echo hello
`;

	const FLOW_WITH_NAMED_INSTANCE = `id: named-flow
version: "1.0.0"
name: Named Flow
description: test
workspace: my-instance
inputs: {}
steps:
  - id: s1
    name: S1
    type: script
    script: echo hello
`;

	const FLOW_WITH_INSTANCE = `\
id: inline-flow
version: "1.0.0"
name: Inline Flow
description: test
inputs: {}
plugins:
  workspace:
    instance:
      type: plugins.none.default
steps:
  - id: s1
    name: S1
    type: script
    script: echo hello
`;

	function makeHandlerWithPerFlowResolver(
		resolveWorkspaceProvider: (config: unknown) => Promise<unknown>
	): CommandHandler {
		return new TrackedCommandHandler(
			daemonDir,
			createMockWorkerPool() as never,
			createMockWorkerPool() as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never,
			false,
			20,
			50,
			undefined,
			undefined,
			resolveWorkspaceProvider as never
		);
	}

	it('does not call the resolver when the flow declares a built-in provider', async () => {
		const flowFile = path.join(tmpDir, 'no-override.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);
		const resolveCb = vi.fn();

		const handler = makeHandlerWithPerFlowResolver(resolveCb);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(result.type).toBe('execution_started');
		expect(resolveCb).not.toHaveBeenCalled();
	});

	it('resolves a workspace named after a config instance through the callback', async () => {
		const flowFile = path.join(tmpDir, 'named-instance.yml');
		fs.writeFileSync(flowFile, FLOW_WITH_NAMED_INSTANCE);
		const perFlowAllocate = vi.fn().mockResolvedValue({ id: 'named-ws', path: tmpDir });
		const perFlowProvider = { allocate: perFlowAllocate, release: vi.fn().mockResolvedValue(undefined) };
		const resolveCb = vi.fn().mockResolvedValue(perFlowProvider);

		const handler = makeHandlerWithPerFlowResolver(resolveCb);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(result.type).toBe('execution_started');
		expect(resolveCb).toHaveBeenCalledOnce();
		expect(resolveCb).toHaveBeenCalledWith(expect.objectContaining({ use: 'my-instance' }));
		expect(perFlowAllocate).toHaveBeenCalledOnce();
	});

	it('calls resolveWorkspaceProvider callback for the deprecated plugins.workspace.use, with a warning in the log', async () => {
		const flowFile = path.join(tmpDir, 'use-override.yml');
		fs.writeFileSync(flowFile, FLOW_WITH_USE);
		const perFlowAllocate = vi.fn().mockResolvedValue({ id: 'per-flow-ws', path: tmpDir });
		const perFlowProvider = { allocate: perFlowAllocate, release: vi.fn().mockResolvedValue(undefined) };
		const resolveCb = vi.fn().mockResolvedValue(perFlowProvider);

		const handler = makeHandlerWithPerFlowResolver(resolveCb);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(result.type).toBe('execution_started');
		expect(resolveCb).toHaveBeenCalledOnce();
		expect(resolveCb).toHaveBeenCalledWith(expect.objectContaining({ use: 'my-instance' }));
		expect(perFlowAllocate).toHaveBeenCalledOnce();
		expect(mockLogWriter.writeExecution).toHaveBeenCalledWith(
			expect.any(String),
			expect.stringContaining('"plugins.workspace" is deprecated'),
			'warning'
		);
	});

	it('calls resolveWorkspaceProvider callback for the deprecated plugins.workspace.instance', async () => {
		const flowFile = path.join(tmpDir, 'instance-override.yml');
		fs.writeFileSync(flowFile, FLOW_WITH_INSTANCE);
		const perFlowAllocate = vi.fn().mockResolvedValue({ id: 'inline-ws', path: tmpDir });
		const perFlowProvider = { allocate: perFlowAllocate, release: vi.fn().mockResolvedValue(undefined) };
		const resolveCb = vi.fn().mockResolvedValue(perFlowProvider);

		const handler = makeHandlerWithPerFlowResolver(resolveCb);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(result.type).toBe('execution_started');
		expect(resolveCb).toHaveBeenCalledOnce();
		expect(resolveCb).toHaveBeenCalledWith(
			expect.objectContaining({ instance: expect.objectContaining({ type: 'plugins.none.default' }) })
		);
		expect(perFlowAllocate).toHaveBeenCalledOnce();
	});

	it('returns WORKSPACE_ERROR naming the cause when the resolver callback throws', async () => {
		const flowFile = path.join(tmpDir, 'fail-resolve.yml');
		fs.writeFileSync(flowFile, FLOW_WITH_USE);
		const resolveCb = vi.fn().mockRejectedValue(new Error('instance not found'));

		const handler = makeHandlerWithPerFlowResolver(resolveCb);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(result.type).toBe('error');
		expect((result as { code: string }).code).toBe('WORKSPACE_ERROR');
		expect((result as { message: string }).message).toContain('plugins.workspace');
		expect((result as { message: string }).message).toContain('instance not found');
	});
});

describe('CommandHandler — plugin workspace provider', () => {
	function makeHandlerWithProvider(provider: {
		allocate: ReturnType<typeof vi.fn>;
		release: ReturnType<typeof vi.fn>;
	}): CommandHandler {
		return new TrackedCommandHandler(
			daemonDir,
			createMockWorkerPool() as never,
			createMockWorkerPool() as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never,
			false,
			20,
			50,
			new FixedWorkspaceProviders(provider as never)
		);
	}

	it('Fix A: releases workspace handle when post-allocate setup throws', async () => {
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const mockRelease = vi.fn().mockResolvedValue(undefined);
		const mockProvider = {
			allocate: vi.fn().mockResolvedValue({ id: 'ws-1', path: tmpDir }),
			release: mockRelease,
		};

		mockExecStore.create.mockImplementationOnce(() => {
			throw new Error('storage failure');
		});

		const handler = makeHandlerWithProvider(mockProvider);

		await expect(handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never)).rejects.toThrow(
			'storage failure'
		);

		expect(mockRelease).toHaveBeenCalledOnce();
	});

	it('Fix A: releases handle and refuses the run when the metadata folder cannot be prepared', async () => {
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const mockRelease = vi.fn().mockResolvedValue(undefined);
		const wsPath = path.join(tmpDir, 'fake-ws');
		// Create .meta as a FILE so mkdirSync('.meta/outputs') fails with ENOTDIR
		fs.writeFileSync(wsPath + '.meta', '');
		const mockProvider = {
			allocate: vi.fn().mockResolvedValue({ id: 'ws-2', path: wsPath }),
			release: mockRelease,
		};

		const handler = makeHandlerWithProvider(mockProvider);

		// Refused with the folder and the fix, instead of an anonymous failure of the request.
		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(response).toMatchObject({ type: 'error', code: 'WORKSPACE_ERROR' });
		expect((response as { message: string }).message).toContain('metadata folder');
		expect(mockRelease).toHaveBeenCalledOnce();
	});

	it('Fix B: uses releaseWorkspace dual-error contract on step failure', async () => {
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const mockRelease = vi.fn().mockRejectedValue(new Error('release failed'));
		const mockProvider = {
			allocate: vi.fn().mockResolvedValue({ id: 'ws-3', path: tmpDir }),
			release: mockRelease,
		};

		const handler = makeHandlerWithProvider(mockProvider);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		expect(result.type).toBe('execution_started');
		const { executionId } = result as { executionId: string };

		handler.onStepFailed(executionId, 's1', 'step error');

		// releaseWorkspace uses console.warn when prior error exists (not process.stderr)
		await vi.waitFor(() => expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('release failed')));

		warnSpy.mockRestore();
	});
});
