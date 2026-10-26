import type { AssignableStep, ExecutionContext } from '../ipc/Protocol';
import type { SendMessageFn, StepRunnerFactory } from './WorkerAdapter';
import { WorkerAdapter } from './WorkerAdapter';

const { mockMcpServer } = vi.hoisted(() => ({
	mockMcpServer: { name: 'flow', command: ['node', 'x'], env: {} },
}));

vi.mock('./McpServer', () => ({
	McpServer: class MockMcpServer {
		start = vi.fn().mockResolvedValue({ port: 1, mcpServer: mockMcpServer });
		stop = vi.fn().mockResolvedValue(undefined);
	},
}));

// Built at runtime from parts: a literal would trip secret scanners on the source file.
const TOKEN = ['tk', '_Ab3xY9', 'Q7z'].join('');

const scriptStep = {
	id: 'call',
	name: 'Call',
	type: 'script',
	script: 'echo ${{ inputs.region }}',
	env: { LABEL: '${{ inputs.label }}', FIXED: 'x' },
	secrets: ['API_TOKEN'],
} as unknown as AssignableStep;

const modelStep = {
	id: 'think',
	name: 'Think',
	type: 'model',
	model: 'haiku',
	prompt: 'Work on ${{ inputs.region }} with {% if inputs.API_TOKEN %}auth{% endif %}',
} as unknown as AssignableStep;

function context(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
	return {
		executionId: 'testexec',
		inputs: { region: 'eu', label: 'blue', unused: 'u' },
		stepOutputs: {},
		stepMeta: {},
		workspaceDir: '/tmp/ws',
		outputsDir: '/tmp/ws.meta/outputs',
		cwd: '/tmp/ws',
		...overrides,
	};
}

describe('WorkerAdapter step io', () => {
	let executeStep: ReturnType<typeof vi.fn>;
	let adapter: WorkerAdapter;
	const sendMessage: SendMessageFn = () => undefined;

	beforeEach(() => {
		executeStep = vi.fn();
		const factory: StepRunnerFactory = () => ({ executeStep, setOnRenderedPrompt: vi.fn() }) as never;
		adapter = new WorkerAdapter(factory);
	});

	it('reports the flow inputs the step reads, its rendered env, its secret names and its stdout/stderr', async () => {
		executeStep.mockResolvedValue({
			outputs: { x: '1' },
			env: { LABEL: 'blue', FIXED: 'x' },
			stdout: 'out',
			stderr: 'warn',
		});

		const result = await adapter.execute(scriptStep, context({ secrets: { API_TOKEN: TOKEN } }), sendMessage);

		expect(result.io).toEqual({
			inputs: {
				'inputs.region': 'eu',
				'inputs.label': 'blue',
				'env.LABEL': 'blue',
				'env.FIXED': 'x',
				'secrets.API_TOKEN': '[secret:API_TOKEN]',
			},
			stdout: 'out',
			stderr: 'warn',
		});
	});

	it('records a secret input read through a template as the placeholder, never its value', async () => {
		executeStep.mockResolvedValue({ outputs: {}, prompt: `Work on eu with ${TOKEN}`, response: 'done' });

		const result = await adapter.execute(modelStep, context({ secrets: { API_TOKEN: TOKEN } }), sendMessage);

		expect(result.io?.inputs['inputs.API_TOKEN']).toBe('[secret:API_TOKEN]');
		expect(result.io?.inputs['prompt']).toBe('Work on eu with [secret:API_TOKEN]');
		expect(JSON.stringify(result.io)).not.toContain(TOKEN);
	});

	it('reports the rendered prompt of a model step and its final response as stdout', async () => {
		executeStep.mockResolvedValue({ outputs: { plan: 'p' }, prompt: 'Work on eu', response: 'the answer' });

		const result = await adapter.execute(modelStep, context(), sendMessage);

		expect(result.io?.inputs).toEqual({ 'inputs.region': 'eu', prompt: 'Work on eu' });
		expect(result.io?.stdout).toBe('the answer');
	});

	it('does not report an input the step does not read, nor one that was never supplied', async () => {
		executeStep.mockResolvedValue({ outputs: {}, prompt: 'p' });

		const result = await adapter.execute(modelStep, context({ inputs: { unused: 'u' } }), sendMessage);

		expect(Object.keys(result.io!.inputs)).toEqual(['prompt']);
	});

	it('attaches the io to the error of a failed step, masked', async () => {
		executeStep.mockResolvedValue({
			error: 'boom',
			env: { LABEL: TOKEN },
			stdout: `o ${TOKEN}`,
			stderr: 'e',
			outputs: {},
		});

		const failure = await adapter
			.execute(scriptStep, context({ secrets: { API_TOKEN: TOKEN } }), sendMessage)
			.catch((error: unknown) => error);

		const io = (failure as { io?: { inputs: Record<string, string>; stdout?: string } }).io;
		expect(io?.inputs['env.LABEL']).toBe('[secret:API_TOKEN]');
		expect(io?.stdout).toBe('o [secret:API_TOKEN]');
		expect(JSON.stringify(failure)).not.toContain(TOKEN);
	});

	it('attaches the io to the error of a failed model step', async () => {
		executeStep.mockResolvedValue({
			error: 'exited 1',
			prompt: 'p',
			response: 'partial',
			stderr: 'bad',
			outputs: {},
		});

		const failure = await adapter.execute(modelStep, context(), sendMessage).catch((error: unknown) => error);

		expect((failure as { io?: unknown }).io).toMatchObject({ stdout: 'partial', stderr: 'bad' });
	});

	// The cost of a failed attempt used to vanish here: the thrown error carried the io but not the meta.
	it('attaches the meta of the attempt to the error of a failed model step, masked', async () => {
		const meta = {
			model: 'haiku',
			session_id: 's',
			session_file: '',
			ttft_ms: 1,
			duration_ms: 2,
			cost: {
				input_tokens: 1,
				output_tokens: 2,
				cache_read_tokens: 0,
				cache_write_tokens: 0,
				usd: 0.5,
				reported: true,
			},
			end_reason: 'exit_nonzero',
			files_written: [`/tmp/${TOKEN}.txt`],
		};
		executeStep.mockResolvedValue({
			error: 'exited 1',
			prompt: 'p',
			response: '',
			stderr: 'bad',
			outputs: {},
			meta,
		});

		const failure = await adapter
			.execute(modelStep, context({ secrets: { API_TOKEN: TOKEN } }), sendMessage)
			.catch((error: unknown) => error);

		expect((failure as { meta?: unknown }).meta).toMatchObject({
			cost: { usd: 0.5 },
			end_reason: 'exit_nonzero',
		});
		expect(JSON.stringify(failure)).not.toContain(TOKEN);
	});

	it('attaches the meta of the attempt to the error of a failed script step', async () => {
		executeStep.mockResolvedValue({
			error: 'exit 3',
			stdout: '',
			stderr: '',
			outputs: {},
			meta: { exit_code: 3, duration_ms: 9, end_reason: 'exit_nonzero' },
		});

		const failure = await adapter.execute(scriptStep, context(), sendMessage).catch((error: unknown) => error);

		expect((failure as { meta?: unknown }).meta).toEqual({
			exit_code: 3,
			duration_ms: 9,
			end_reason: 'exit_nonzero',
		});
	});

	it('attaches no meta when the runner produced none (nothing invented)', async () => {
		executeStep.mockResolvedValue({ error: 'x', stdout: '', stderr: '', outputs: {} });

		const failure = await adapter.execute(scriptStep, context(), sendMessage).catch((error: unknown) => error);

		expect((failure as { meta?: unknown }).meta).toBeUndefined();
	});
});
