import { WorkerAdapter } from './WorkerAdapter';
import type { SendMessageFn, StepRunnerFactory } from './WorkerAdapter';
import type { AssignableStep, ExecutionContext } from '../ipc/Protocol';

const { mockMcpStart, mockMcpStop } = vi.hoisted(() => ({
    mockMcpStart: vi.fn().mockResolvedValue({ configPath: '/tmp/mcp.json' }),
    mockMcpStop: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./McpServer', () => ({
    McpServer: class MockMcpServer {
        start = mockMcpStart;
        stop = mockMcpStop;
    },
}));

const makeContext = (): ExecutionContext => ({
    executionId: 'testexec',
    inputs: {},
    stepOutputs: {},
    workspaceDir: '/tmp/ws',
});

const makeScriptStep = (): AssignableStep => ({
    id: 'script-step',
    name: 'Script',
    type: 'script',
    script: 'echo hello',
} as any);

const makeModelStep = (): AssignableStep => ({
    id: 'model-step',
    name: 'Model',
    type: 'model',
    model: 'haiku',
    prompt: 'Say hello',
} as any);

const makeSubflowStep = (): AssignableStep => ({
    id: 'subflow-step',
    name: 'Subflow',
    type: 'subflow',
    flowId: 'other-flow',
    inputs: {},
} as any);

describe('WorkerAdapter', () => {
    let adapter: WorkerAdapter;
    let sendMessage: SendMessageFn;
    let mockExecuteStep: ReturnType<typeof vi.fn>;
    let mockFactory: StepRunnerFactory;

    beforeEach(() => {
        vi.clearAllMocks();
        mockExecuteStep = vi.fn().mockResolvedValue({ outputs: { result: 'ok' } });
        const mockRunner = { executeStep: mockExecuteStep };
        // Factory returns a fresh mock runner for each call
        mockFactory = vi.fn().mockReturnValue(mockRunner) as unknown as StepRunnerFactory;
        adapter = new WorkerAdapter(mockFactory);
        sendMessage = vi.fn() as unknown as SendMessageFn;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('throws for subflow step type', async () => {
        await expect(
            adapter.execute(makeSubflowStep(), makeContext(), sendMessage)
        ).rejects.toThrow(/not supported in v1/);
    });

    it('returns outputs for a script step', async () => {
        const result = await adapter.execute(makeScriptStep(), makeContext(), sendMessage);
        expect(result).toEqual({ result: 'ok' });
        // Factory called with empty string for non-model steps
        expect(mockFactory).toHaveBeenCalledWith('');
    });

    it('returns outputs for a model step and calls McpServer start/stop', async () => {
        const result = await adapter.execute(makeModelStep(), makeContext(), sendMessage);
        expect(result).toEqual({ result: 'ok' });

        expect(mockMcpStart).toHaveBeenCalledTimes(1);
        expect(mockMcpStop).toHaveBeenCalledTimes(1);
        // Factory called with MCP config path from McpServer
        expect(mockFactory).toHaveBeenCalledWith('/tmp/mcp.json');
    });
});
