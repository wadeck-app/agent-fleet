import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { CommandHandler } from './CommandHandler';
import {
	INVALID_DEPS_FLOW_YAML,
	TrackedCommandHandler,
	USER_INTERVENTION_FLOW_YAML,
	VALID_FLOW_YAML,
	createMockWorkerPool,
	daemonDir,
	makeHandler,
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

vi.mock('flow-engine', async importOriginal => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		WorkspaceManager: class MockWorkspaceManager {
			allocate = mockAllocate;
			release = mockRelease;
		},
	};
});

registerCommandHandlerHooks({ mockAllocate, mockRelease, hoistedState });

describe('CommandHandler draining', () => {
	it('refuses a new run with an actionable DAEMON_DRAINING error while draining', async () => {
		const handler = makeHandler();
		handler.setDraining(true);

		const result = await handler.handleRun({ type: 'run', flowFile: '/any/flow.yml', cwd: tmpDir } as never);

		if (result.type !== 'error') throw new Error('Expected error response');
		expect(result.code).toBe('DAEMON_DRAINING');
		expect(result.message).toContain('flow cli update --cancel-drain');
	});

	it('accepts runs again once draining is cancelled', async () => {
		const handler = makeHandler();
		handler.setDraining(true);
		handler.setDraining(false);

		const result = await handler.handleRun({ type: 'run', flowFile: '/no/such/flow.yml', cwd: tmpDir } as never);

		if (result.type !== 'error') throw new Error('Expected error response');
		expect(result.code).toBe('FLOW_NOT_FOUND');
	});

	it('reports whether it is draining', () => {
		const handler = makeHandler();
		expect(handler.isDraining()).toBe(false);
		handler.setDraining(true);
		expect(handler.isDraining()).toBe(true);
	});
});

describe('CommandHandler.handleRun', () => {
	it('returns FLOW_NOT_FOUND error when the flow file does not exist', async () => {
		const handler = makeHandler();
		const result = await handler.handleRun({
			type: 'run',
			flowFile: '/no/such/flow.yml',
			cwd: tmpDir,
		} as never);

		expect(result.type).toBe('error');
		if (result.type !== 'error') throw new Error('Expected error response');
		expect((result as { code: string }).code).toBe('FLOW_NOT_FOUND');
	});

	it('returns PARSE_ERROR when the flow file contains invalid YAML', async () => {
		const flowFile = path.join(tmpDir, 'bad.yml');
		fs.writeFileSync(flowFile, 'key: [invalid: yaml');

		const handler = makeHandler();
		const result = await handler.handleRun({
			type: 'run',
			flowFile,
			cwd: tmpDir,
		} as never);

		expect(result.type).toBe('error');
		if (result.type !== 'error') throw new Error('Expected error response');
		expect((result as { code: string }).code).toBe('PARSE_ERROR');
	});

	it('returns VALIDATION_FAILED when the flow has invalid step dependencies', async () => {
		const flowFile = path.join(tmpDir, 'invalid-deps.yml');
		fs.writeFileSync(flowFile, INVALID_DEPS_FLOW_YAML);

		const handler = makeHandler();
		const result = await handler.handleRun({
			type: 'run',
			flowFile,
			cwd: tmpDir,
		} as never);

		expect(result.type).toBe('error');
		if (result.type !== 'error') throw new Error('Expected error response');
		expect((result as { code: string }).code).toBe('VALIDATION_FAILED');
	});

	// The v1 refusal is gone (D#37): such a flow now starts, and the step is routed to a
	// worker that declared a user interface. What happens when none is connected is S9's
	// call -- see the interactive-steps suite below.
	it('accepts a flow containing a user_intervention step', async () => {
		const flowFile = path.join(tmpDir, 'intervention.yml');
		fs.writeFileSync(flowFile, USER_INTERVENTION_FLOW_YAML);

		const handler = makeHandler();
		const result = await handler.handleRun({
			type: 'run',
			flowFile,
			cwd: tmpDir,
		} as never);

		expect(result.type).toBe('execution_started');
	});

	it('returns execution_started with a valid executionId for a successful flow', async () => {
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const handler = makeHandler();
		const result = await handler.handleRun({
			type: 'run',
			flowFile,
			cwd: tmpDir,
		} as never);

		expect(result.type).toBe('execution_started');
		if (result.type !== 'execution_started') throw new Error('Expected execution_started response');
		expect((result as { executionId: string }).executionId).toMatch(/^[a-z0-9]{8}$/);
	});
});

describe('handleRun path restriction', () => {
	it('blocks flow files outside cwd and homedir by default', async () => {
		const fakeHome = path.join(tmpDir, 'fake-home');
		vi.mocked(os.homedir).mockReturnValue(fakeHome);

		const outsideDir = path.join(os.tmpdir(), `outside-${Date.now()}`);
		fs.mkdirSync(outsideDir, { recursive: true });
		const flowFile = path.join(outsideDir, 'test.yml');
		fs.writeFileSync(flowFile, 'id: test\n');

		const handler = new TrackedCommandHandler(
			tmpDir,
			createMockWorkerPool() as never,
			createMockWorkerPool() as never
		);
		const result = await handler.handleRun({
			type: 'run',
			flowFile,
			cwd: tmpDir,
			inputs: {},
		} as never);

		expect(result.type).toBe('error');
		expect((result as { code: string }).code).toBe('FLOW_NOT_FOUND');
		expect((result as { message: string }).message).not.toContain(flowFile);
		expect((result as { message: string }).message).not.toContain(outsideDir);

		fs.rmSync(outsideDir, { recursive: true });
	});

	it('allows flow files inside cwd', async () => {
		const flowFile = path.join(tmpDir, 'allowed.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const handler = new TrackedCommandHandler(
			tmpDir,
			createMockWorkerPool() as never,
			createMockWorkerPool() as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		const result = await handler.handleRun({
			type: 'run',
			flowFile,
			cwd: tmpDir,
			inputs: {},
		} as never);

		if (result.type === 'error') {
			expect((result as { code: string }).code).not.toBe('FLOW_NOT_FOUND');
		}
	});

	it('allows absolute paths when allowAbsolutePaths is true', async () => {
		const outsideDir = path.join(os.tmpdir(), `outside-${Date.now()}`);
		fs.mkdirSync(outsideDir, { recursive: true });
		const flowFile = path.join(outsideDir, 'test.yml');
		fs.writeFileSync(flowFile, 'invalid yaml: [');

		const handler = new TrackedCommandHandler(
			tmpDir,
			createMockWorkerPool() as never,
			createMockWorkerPool() as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never,
			true // allowAbsolutePaths
		);
		const result = await handler.handleRun({
			type: 'run',
			flowFile,
			cwd: tmpDir,
			inputs: {},
		} as never);

		expect((result as { code?: string }).code).not.toBe('FLOW_NOT_FOUND');
		expect(result.type).toBe('error');
		expect((result as { code: string }).code).toBe('PARSE_ERROR');
		expect((result as { message: string }).message).not.toContain(flowFile);

		fs.rmSync(outsideDir, { recursive: true });
	});
});

describe('CommandHandler.handleRun -- mockEnv (--mock-config)', () => {
	const MOCK_FLOW_YAML = `\
id: mock-flow
version: "1.0.0"
name: Mock Flow
description: Test
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: model_step
    name: Model Step
    type: model
    provider: opencode
    model: astra
    prompt: do something
    env:
      OWN_VAR: own-value
  - id: approve
    name: Approve
    type: user_intervention
    interventionType: approval
    depends:
      - model_step
    approval:
      title: Approve
      description: Please review
`;

	function dispatchCapturingHandler(): {
		handler: CommandHandler;
		dispatched: { stepId: string; env?: Record<string, string> }[];
	} {
		const workerPool = createMockWorkerPool();
		const dispatched: { stepId: string; env?: Record<string, string> }[] = [];
		workerPool.getIdle.mockReturnValue({} as never);
		workerPool.send.mockImplementation((_ws: unknown, msg: unknown) => {
			const m = msg as { stepId: string; stepConfig: { env?: Record<string, string> } };
			dispatched.push({ stepId: m.stepId, env: m.stepConfig.env });
			return true;
		});
		const handler = new TrackedCommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		return { handler, dispatched };
	}

	it("overlays mockEnv onto the targeted step with highest priority, above the step's own env", async () => {
		const flowFile = path.join(tmpDir, 'mock.yml');
		fs.writeFileSync(flowFile, MOCK_FLOW_YAML);

		const { handler, dispatched } = dispatchCapturingHandler();
		const result = await handler.handleRun({
			type: 'run',
			flowFile,
			cwd: tmpDir,
			mockEnv: {
				model_step: { OPENCODE_MOCK_RESPONSE: 'canned output', OWN_VAR: 'overridden' },
			},
			mockConfigPath: '/path/to/mock-config.yaml',
		} as never);

		expect(result.type).not.toBe('error');
		const modelStep = dispatched.find(d => d.stepId === 'model_step');
		expect(modelStep?.env).toMatchObject({
			OPENCODE_MOCK_RESPONSE: 'canned output',
			OWN_VAR: 'overridden',
		});
	});

	it('emits a visible warning banner to both the execution log and the daemon log for a mocked step', async () => {
		const flowFile = path.join(tmpDir, 'mock.yml');
		fs.writeFileSync(flowFile, MOCK_FLOW_YAML);

		const { handler } = dispatchCapturingHandler();
		const result = await handler.handleRun({
			type: 'run',
			flowFile,
			cwd: tmpDir,
			mockEnv: { model_step: { OPENCODE_MOCK_RESPONSE: 'canned output' } },
			mockConfigPath: '/path/to/mock-config.yaml',
		} as never);
		const { executionId } = result as { executionId: string };

		expect(mockLogWriter.writeExecution).toHaveBeenCalledWith(
			executionId,
			expect.stringContaining("MOCK: step 'model_step'"),
			'info'
		);

		const today = new Date().toISOString().slice(0, 10);
		const daemonLogContent = fs.readFileSync(path.join(daemonDir, 'logs', `${today}.ndjson`), 'utf8');
		expect(daemonLogContent).toContain("MOCK: step 'model_step'");
		expect(daemonLogContent).toContain('/path/to/mock-config.yaml');
	});

	it('fails loudly (VALIDATION_FAILED) when mockEnv targets a step with no env to overlay (user_intervention)', async () => {
		const flowFile = path.join(tmpDir, 'mock.yml');
		fs.writeFileSync(flowFile, MOCK_FLOW_YAML);

		const { handler } = dispatchCapturingHandler();
		const result = await handler.handleRun({
			type: 'run',
			flowFile,
			cwd: tmpDir,
			mockEnv: { approve: { SOME_VAR: 'x' } },
		} as never);

		expect(result.type).toBe('error');
		if (result.type !== 'error') throw new Error('Expected error response');
		expect((result as { code: string }).code).toBe('VALIDATION_FAILED');
		expect((result as { message: string }).message).toContain("step 'approve'");
	});
});
