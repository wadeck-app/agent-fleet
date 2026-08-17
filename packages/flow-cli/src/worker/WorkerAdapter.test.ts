import type { AssignableStep, ExecutionContext } from '../ipc/Protocol';
import { WorkerAdapter } from './WorkerAdapter';
import type { SendMessageFn, StepRunnerFactory } from './WorkerAdapter';

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
	stepMeta: {},
	workspaceDir: '/tmp/ws',
	outputsDir: '/tmp/ws.meta/outputs',
	cwd: '/tmp/ws',
});

const makeScriptStep = (): AssignableStep =>
	({
		id: 'script-step',
		name: 'Script',
		type: 'script',
		script: 'echo hello',
	}) as any;

const makeModelStep = (): AssignableStep =>
	({
		id: 'model-step',
		name: 'Model',
		type: 'model',
		model: 'haiku',
		prompt: 'Say hello',
	}) as any;

const makeSubflowStep = (): AssignableStep =>
	({
		id: 'subflow-step',
		name: 'Subflow',
		type: 'subflow',
		flowId: 'other-flow',
		inputs: {},
	}) as any;

describe('WorkerAdapter', () => {
	let adapter: WorkerAdapter;
	let sendMessage: SendMessageFn;
	let mockExecuteStep: ReturnType<typeof vi.fn>;
	let mockFactory: StepRunnerFactory;

	beforeEach(() => {
		vi.clearAllMocks();
		// mockReset:true in vitest config resets implementations; restore them here.
		mockMcpStart.mockResolvedValue({ configPath: '/tmp/mcp.json' });
		mockMcpStop.mockResolvedValue(undefined);
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
		await expect(adapter.execute(makeSubflowStep(), makeContext(), sendMessage)).rejects.toThrow(
			/not supported in v1/
		);
	});

	it('returns outputs for a script step', async () => {
		const result = await adapter.execute(makeScriptStep(), makeContext(), sendMessage);
		expect(result.output).toEqual({ result: 'ok' });
		// Factory called with empty string for non-model steps
		expect(mockFactory).toHaveBeenCalledWith('');
	});

	it('sends stdout lines as log messages for script step', async () => {
		mockExecuteStep.mockResolvedValue({ stdout: 'hello\nworld\n', outputs: {} });
		await adapter.execute(makeScriptStep(), makeContext(), sendMessage);
		const logCalls = (sendMessage as ReturnType<typeof vi.fn>).mock.calls
			.map(c => c[0])
			.filter((m: any) => m.type === 'log');
		expect(logCalls).toHaveLength(2);
		expect(logCalls[0].entry.message).toBe('hello');
		expect(logCalls[1].entry.message).toBe('world');
		expect(logCalls[0].stepId).toBe('script-step');
		expect(logCalls[0].executionId).toBe('testexec');
	});

	it('does not send log messages for empty stdout', async () => {
		mockExecuteStep.mockResolvedValue({ stdout: '\n  \n', outputs: {} });
		await adapter.execute(makeScriptStep(), makeContext(), sendMessage);
		const logCalls = (sendMessage as ReturnType<typeof vi.fn>).mock.calls
			.map(c => c[0])
			.filter((m: any) => m.type === 'log');
		expect(logCalls).toHaveLength(0);
	});

	it('does not send log messages when stdout is undefined', async () => {
		mockExecuteStep.mockResolvedValue({ outputs: {} });
		await adapter.execute(makeScriptStep(), makeContext(), sendMessage);
		const logCalls = (sendMessage as ReturnType<typeof vi.fn>).mock.calls
			.map(c => c[0])
			.filter((m: any) => m.type === 'log');
		expect(logCalls).toHaveLength(0);
	});

	it('sends trace.response (not trace.stdout) as log message for model step', async () => {
		// Regression: before the fix, raw NDJSON from trace.stdout was sent as log noise.
		mockExecuteStep.mockResolvedValue({
			response: 'Clean answer',
			stdout: '{"type":"system","subtype":"init"}\n{"type":"assistant","message":"..."}',
			outputs: { response: 'Clean answer' },
		});
		await adapter.execute(makeModelStep(), makeContext(), sendMessage);
		const logCalls = (sendMessage as ReturnType<typeof vi.fn>).mock.calls
			.map(c => c[0])
			.filter((m: any) => m.type === 'log');
		// 1 system entry ("Launching haiku…") + 1 response entry
		expect(logCalls).toHaveLength(2);
		const responseLog = logCalls.find((m: any) => m.entry.eventType !== 'system');
		expect(responseLog.entry.message).toBe('Clean answer');
		expect(responseLog.stepId).toBe('model-step');
	});

	it('does not send raw NDJSON from stdout for model step', async () => {
		mockExecuteStep.mockResolvedValue({
			response: 'Answer',
			stdout: '{"type":"system"}\n{"type":"assistant"}',
			outputs: { response: 'Answer' },
		});
		await adapter.execute(makeModelStep(), makeContext(), sendMessage);
		const logCalls = (sendMessage as ReturnType<typeof vi.fn>).mock.calls
			.map(c => c[0])
			.filter((m: any) => m.type === 'log');
		// No raw JSON lines should appear
		const rawJsonCalls = logCalls.filter((m: any) => m.entry.message.startsWith('{'));
		expect(rawJsonCalls).toHaveLength(0);
	});

	it('throws when trace.error is set for model step', async () => {
		// Regression: before the fix, model step returned normally even when Claude failed.
		mockExecuteStep.mockResolvedValue({
			error: 'Claude exited with code 1',
			response: '',
			stdout: '',
			outputs: {},
		});
		await expect(adapter.execute(makeModelStep(), makeContext(), sendMessage)).rejects.toThrow(
			'Claude exited with code 1'
		);
	});

	it('returns outputs for a model step and calls McpServer start/stop', async () => {
		const result = await adapter.execute(makeModelStep(), makeContext(), sendMessage);
		expect(result.output).toEqual({ result: 'ok' });

		expect(mockMcpStart).toHaveBeenCalledTimes(1);
		expect(mockMcpStop).toHaveBeenCalledTimes(1);
		// Factory called with MCP config path from McpServer
		expect(mockFactory).toHaveBeenCalledWith('/tmp/mcp.json');
	});

	describe('toolLog parameter', () => {
		const makeStreamingModelStep = (toolLog?: string) =>
			({
				id: 'model-step',
				name: 'Model',
				type: 'model',
				model: 'haiku',
				prompt: 'Say hello',
				log: 'streaming',
				...(toolLog !== undefined && { toolLog }),
			}) as any;

		const toolUseEntry = {
			id: 'e1',
			timestamp: 1,
			level: 'warning',
			message: 'Tool: Bash(command=sleep 5)',
			eventType: 'tool_use',
			metadata: { toolName: 'Bash', input: { command: 'sleep 5' } },
		};

		const toolResultEntry = {
			id: 'e2',
			timestamp: 2,
			level: 'debug',
			message: 'Tool result [tu_1]: done',
			eventType: 'tool_result',
			metadata: { toolUseId: 'tu_1' },
		};

		const assistantEntry = {
			id: 'e3',
			timestamp: 3,
			level: 'info',
			message: 'Claude: Hello!',
			eventType: 'assistant_text',
		};

		const setupStreamingMock = () => {
			mockExecuteStep.mockImplementation(async (_step, _ws, _ctx, _onTrace, onLogEntry) => {
				if (onLogEntry) {
					onLogEntry(assistantEntry);
					onLogEntry(toolUseEntry);
					onLogEntry(toolResultEntry);
				}
				return { response: 'Hello!', outputs: { response: 'Hello!' } };
			});
		};

		it('toolLog: none (default) — system launch + assistant_text sent, no tool events', async () => {
			setupStreamingMock();
			await adapter.execute(makeStreamingModelStep('none'), makeContext(), sendMessage);
			const logCalls = (sendMessage as any).mock.calls.map((c: any) => c[0]).filter((m: any) => m.type === 'log');
			const types = logCalls.map((m: any) => m.entry.eventType);
			expect(types).toContain('system'); // "Launching model…"
			expect(types).toContain('assistant_text');
			expect(types).not.toContain('tool_use');
			expect(types).not.toContain('tool_result');
		});

		it('toolLog: name — assistant_text + tool_use sent, tool_result suppressed', async () => {
			setupStreamingMock();
			await adapter.execute(makeStreamingModelStep('name'), makeContext(), sendMessage);
			const logCalls = (sendMessage as any).mock.calls.map((c: any) => c[0]).filter((m: any) => m.type === 'log');
			const types = logCalls.map((m: any) => m.entry.eventType);
			expect(types).toContain('assistant_text');
			expect(types).toContain('tool_use');
			expect(types).not.toContain('tool_result');
			// name mode: → Tool: Name(input...) truncated to 80 chars
			const toolCall = logCalls.find((m: any) => m.entry.eventType === 'tool_use');
			expect(toolCall.entry.message).toMatch(/^→ Tool: Bash/);
		});

		it('toolLog: full — assistant_text + tool_use + tool_result all sent', async () => {
			setupStreamingMock();
			await adapter.execute(makeStreamingModelStep('full'), makeContext(), sendMessage);
			const logCalls = (sendMessage as any).mock.calls.map((c: any) => c[0]).filter((m: any) => m.type === 'log');
			const types = logCalls.map((m: any) => m.entry.eventType);
			expect(types).toContain('assistant_text');
			expect(types).toContain('tool_use');
			expect(types).toContain('tool_result');
			// full mode: message has → prefix
			const toolCall = logCalls.find((m: any) => m.entry.eventType === 'tool_use');
			expect(toolCall.entry.message).toMatch(/^→ /);
			const toolResult = logCalls.find((m: any) => m.entry.eventType === 'tool_result');
			expect(toolResult.entry.message).toMatch(/^← /);
		});

		it('toolLog omitted (default none) — same as toolLog: none', async () => {
			setupStreamingMock();
			await adapter.execute(makeStreamingModelStep(undefined), makeContext(), sendMessage);
			const logCalls = (sendMessage as any).mock.calls.map((c: any) => c[0]).filter((m: any) => m.type === 'log');
			const types = logCalls.map((m: any) => m.entry.eventType);
			expect(types).not.toContain('tool_use');
			expect(types).not.toContain('tool_result');
		});
	});

	it('throws when trace.error is set (script exited with non-zero code)', async () => {
		// Regression: before the fix, execute() returned normally even when the script failed,
		// causing the worker to send step_completed instead of step_failed.
		mockExecuteStep.mockResolvedValue({
			error: 'Script exited with exit code 1',
			exitCode: 1,
			stdout: 'failing output',
			outputs: {},
		});
		await expect(adapter.execute(makeScriptStep(), makeContext(), sendMessage)).rejects.toThrow(
			'Script exited with exit code 1'
		);
	});
});
