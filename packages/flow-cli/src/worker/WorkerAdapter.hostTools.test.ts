import * as path from 'node:path';

import type { AssignableStep, ExecutionContext } from '../ipc/Protocol';
import { WorkerAdapter } from './WorkerAdapter';
import type { SendMessageFn, StepRunnerFactory } from './WorkerAdapter';

const { constructed, mockMcpStart, mockMcpStop } = vi.hoisted(() => ({
	constructed: [] as unknown[][],
	mockMcpStart: vi.fn(),
	mockMcpStop: vi.fn(),
}));

vi.mock('./McpServer', () => ({
	McpServer: class MockMcpServer {
		constructor(...args: unknown[]) {
			constructed.push(args);
		}
		start = mockMcpStart;
		stop = mockMcpStop;
	},
}));

const context: ExecutionContext = {
	executionId: 'testexec',
	inputs: {},
	stepOutputs: {},
	stepMeta: {},
	workspaceDir: process.cwd(),
	outputsDir: `${process.cwd()}.meta/outputs`,
	cwd: process.cwd(),
};

const modelStep = (extra: Record<string, unknown> = {}): AssignableStep =>
	({
		id: 'triage',
		name: 'Triage',
		type: 'model',
		model: 'haiku',
		prompt: 'p',
		...extra,
	}) as unknown as AssignableStep;

describe('WorkerAdapter host tools wiring', () => {
	let executeStep: ReturnType<typeof vi.fn>;
	let factory: StepRunnerFactory;
	let sendMessage: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		constructed.length = 0;
		mockMcpStart.mockResolvedValue({ port: 1, mcpServer: { name: 'flow', command: ['n'], env: {} } });
		mockMcpStop.mockResolvedValue(undefined);
		executeStep = vi.fn().mockResolvedValue({ outputs: {} });
		factory = vi
			.fn()
			.mockReturnValue({ executeStep, setOnRenderedPrompt: vi.fn() }) as unknown as StepRunnerFactory;
		sendMessage = vi.fn();
	});

	it('a model step without hostTools builds the McpServer exactly as before (two arguments)', async () => {
		await new WorkerAdapter(factory).execute(modelStep(), context, sendMessage as unknown as SendMessageFn);
		expect(constructed).toHaveLength(1);
		expect(constructed[0]).toHaveLength(2);
	});

	it('a step with hostTools passes {hostTools:{stepId,tools,handler}} and stops the server with the step', async () => {
		const hostTools = [{ id: 'show', description: 'd', sideEffect: 'read', command: [process.execPath, '-v'] }];
		await new WorkerAdapter(factory).execute(
			modelStep({ hostTools }),
			context,
			sendMessage as unknown as SendMessageFn
		);
		const options = constructed[0]![2] as {
			hostTools: { stepId: string; tools: unknown[]; handler: { call: unknown } };
		};
		expect(options.hostTools.stepId).toBe('triage');
		expect(options.hostTools.tools).toEqual(hostTools);
		expect(typeof options.hostTools.handler.call).toBe('function');
		expect(mockMcpStop).toHaveBeenCalledTimes(1);
	});

	it('audit lines go through the worker log channel (the masked sendMessage), one per call', async () => {
		const hostTools = [{ id: 'show', description: 'd', sideEffect: 'read', command: [process.execPath, '-v'] }];
		await new WorkerAdapter(factory).execute(
			modelStep({ hostTools }),
			context,
			sendMessage as unknown as SendMessageFn
		);
		const options = constructed[0]![2] as {
			hostTools: { handler: { call: (request: unknown) => Promise<unknown> } };
		};
		await options.hostTools.handler.call({
			executionId: 'testexec',
			callId: 'c1',
			toolId: 'show',
			args: { bad: 1 },
		});
		const logs = sendMessage.mock.calls
			.map(([message]) => message as { type: string; stepId: string; entry: { message: string } })
			.filter(message => message.type === 'log' && message.entry.message.startsWith('[host-tool]'));
		expect(logs).toHaveLength(1);
		expect(logs[0]!.stepId).toBe('triage');
	});

	it('fails the step with a named error BEFORE the server and the model start when an executable is missing', async () => {
		const hostTools = [
			{ id: 'show', description: 'd', sideEffect: 'read', command: ['not-installed-anywhere-xyz'] },
		];
		await expect(
			// An absolute-only PATH: the ambient one may hold relative entries, which resolution refuses.
			new WorkerAdapter(factory, { ...process.env, PATH: path.dirname(process.execPath) }).execute(
				modelStep({ hostTools }),
				context,
				sendMessage as unknown as SendMessageFn
			)
		).rejects.toThrow(/Step 'triage' tool 'show'.*not-installed-anywhere-xyz/);
		expect(constructed).toHaveLength(0);
		expect(mockMcpStart).not.toHaveBeenCalled();
		expect(executeStep).not.toHaveBeenCalled();
	});
});
