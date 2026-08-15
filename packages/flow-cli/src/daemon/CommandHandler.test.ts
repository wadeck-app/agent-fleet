import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CommandHandler } from './CommandHandler';

const { mockAllocate, hoistedState } = vi.hoisted(() => ({
    mockAllocate: vi.fn().mockResolvedValue({ path: '/tmp/test-workspace' }),
    // Mutable reference populated by the vi.mock factory; used to restore
    // os.homedir() after mockReset:true clears the implementation each test.
    hoistedState: { actualHomedir: '' as string },
}));

// Wrap node:os so that homedir() is a vi.fn() and can be overridden per-test.
// vi.spyOn on ESM namespace objects fails with "Cannot redefine property".
vi.mock('node:os', async (importOriginal) => {
    const actual = await importOriginal() as typeof import('node:os');
    hoistedState.actualHomedir = actual.homedir();
    return {
        ...actual,
        homedir: vi.fn().mockImplementation(() => actual.homedir()),
    };
});

vi.mock('flow-engine', async (importOriginal) => {
    const actual = await importOriginal() as Record<string, unknown>;
    return {
        ...actual,
        WorkspaceManager: class MockWorkspaceManager {
            allocate = mockAllocate;
        },
    };
});

function createMockStepQueue() {
    return {
        enqueueExecution: vi.fn(),
        dequeue: vi.fn().mockReturnValue(undefined),
        isEmpty: vi.fn().mockReturnValue(true),
        hasActiveExecutions: vi.fn().mockReturnValue(false),
        onStepCompleted: vi.fn(),
        onStepFailed: vi.fn(),
        markStepActive: vi.fn(),
        injectSteps: vi.fn(),
    };
}

function createMockWorkerPool() {
    return {
        canSpawn: vi.fn().mockReturnValue(false),
        spawnWorker: vi.fn(),
        registerWorker: vi.fn(),
        removeWorker: vi.fn(),
        getIdleWorker: vi.fn().mockReturnValue(undefined),
        markBusy: vi.fn(),
        hasActiveWorkers: vi.fn().mockReturnValue(false),
        sendToWorker: vi.fn(),
        broadcastDone: vi.fn(),
    };
}

const VALID_FLOW_YAML = `\
id: test-flow
version: "1.0.0"
name: Test Flow
description: Test
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: s1
    name: S1
    type: script
    script: echo hello
`;

const INVALID_DEPS_FLOW_YAML = `\
id: test
version: "1.0.0"
name: x
description: x
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: s1
    name: s1
    type: script
    script: echo
    depends:
      - nonexistent
`;

const USER_INTERVENTION_FLOW_YAML = `\
id: test-flow
version: "1.0.0"
name: Test Flow
description: Test
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: s1
    name: S1
    type: script
    script: echo hello
  - id: approve
    name: Approve
    type: user_intervention
    interventionType: approval
    depends:
      - s1
    approval:
      title: Approve
      description: Please review
`;

let tmpDir: string;
let daemonDir: string;

const mockExecStore = {
    create: vi.fn(),
    read: vi.fn(),
    markStepRunning: vi.fn(),
    markStepCompleted: vi.fn(),
    markStepFailed: vi.fn(),
    markExecutionCompleted: vi.fn(),
    markExecutionFailed: vi.fn(),
    pruneOldExecutions: vi.fn(),
    update: vi.fn(),
};

const mockLogWriter = {
    write: vi.fn(),
    writeExecution: vi.fn(),
};

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-handler-test-'));
    daemonDir = path.join(tmpDir, 'daemon');
    fs.mkdirSync(daemonDir, { recursive: true });
    vi.clearAllMocks();
    // mockReset:true in vitest config resets all implementations; restore them here.
    vi.mocked(os.homedir).mockReturnValue(hoistedState.actualHomedir);
    mockAllocate.mockResolvedValue({ path: '/tmp/test-workspace' });
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeHandler(): CommandHandler {
    return new CommandHandler(
        daemonDir,
        createMockStepQueue() as never,
        createMockWorkerPool() as never,
        undefined,
        mockExecStore as never,
        mockLogWriter as never,
    );
}

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

    it('returns UNSUPPORTED_STEP_TYPE when the flow contains a user_intervention step', async () => {
        const flowFile = path.join(tmpDir, 'intervention.yml');
        fs.writeFileSync(flowFile, USER_INTERVENTION_FLOW_YAML);

        const handler = makeHandler();
        const result = await handler.handleRun({
            type: 'run',
            flowFile,
            cwd: tmpDir,
        } as never);

        expect(result.type).toBe('error');
        if (result.type !== 'error') throw new Error('Expected error response');
        expect((result as { code: string }).code).toBe('UNSUPPORTED_STEP_TYPE');
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
        // On Windows, os.tmpdir() is under os.homedir() (e.g. C:\Users\foo\AppData\Local\Temp),
        // so we mock homedir to a fake path that does not cover the test's outside dir.
        const fakeHome = path.join(tmpDir, 'fake-home');
        vi.mocked(os.homedir).mockReturnValue(fakeHome);

        // outsideDir is a sibling of tmpDir — not under cwd (tmpDir) nor under fakeHome
        const outsideDir = path.join(os.tmpdir(), `outside-${Date.now()}`);
        fs.mkdirSync(outsideDir, { recursive: true });
        const flowFile = path.join(outsideDir, 'test.yml');
        fs.writeFileSync(flowFile, 'id: test\n');

        const handler = new CommandHandler(
            tmpDir,
            createMockStepQueue() as never,
            createMockWorkerPool() as never,
        );
        const result = await handler.handleRun({
            type: 'run', flowFile, cwd: tmpDir, inputs: {},
        } as never);

        expect(result.type).toBe('error');
        expect((result as { code: string }).code).toBe('FLOW_NOT_FOUND');
        // Must not leak path in error message
        expect((result as { message: string }).message).not.toContain(flowFile);
        expect((result as { message: string }).message).not.toContain(outsideDir);

        fs.rmSync(outsideDir, { recursive: true });
    });

    it('allows flow files inside cwd', async () => {
        // Flow file under tmpDir (which is used as cwd) — guard must not block it
        const flowFile = path.join(tmpDir, 'allowed.yml');
        fs.writeFileSync(flowFile, VALID_FLOW_YAML);

        const handler = new CommandHandler(
            tmpDir,
            createMockStepQueue() as never,
            createMockWorkerPool() as never,
            undefined,
            mockExecStore as never,
            mockLogWriter as never,
        );
        const result = await handler.handleRun({
            type: 'run', flowFile, cwd: tmpDir, inputs: {},
        } as never);

        // Should not return FLOW_NOT_FOUND due to path restriction
        if (result.type === 'error') {
            expect((result as { code: string }).code).not.toBe('FLOW_NOT_FOUND');
        }
    });

    it('allows absolute paths when allowAbsolutePaths is true', async () => {
        const outsideDir = path.join(os.tmpdir(), `outside-${Date.now()}`);
        fs.mkdirSync(outsideDir, { recursive: true });
        const flowFile = path.join(outsideDir, 'test.yml');
        fs.writeFileSync(flowFile, 'invalid yaml: [');

        const handler = new CommandHandler(
            tmpDir,
            createMockStepQueue() as never,
            createMockWorkerPool() as never,
            undefined,
            mockExecStore as never,
            mockLogWriter as never,
            true // allowAbsolutePaths
        );
        const result = await handler.handleRun({
            type: 'run', flowFile, cwd: os.tmpdir(), inputs: {},
        } as never);

        // Should not be blocked by path guard
        expect((result as { code?: string }).code).not.toBe('FLOW_NOT_FOUND');
        // Should fail with PARSE_ERROR since yaml is invalid
        expect(result.type).toBe('error');
        expect((result as { code: string }).code).toBe('PARSE_ERROR');
        // Must not expose the path in the error message
        expect((result as { message: string }).message).not.toContain(flowFile);

        fs.rmSync(outsideDir, { recursive: true });
    });
});
