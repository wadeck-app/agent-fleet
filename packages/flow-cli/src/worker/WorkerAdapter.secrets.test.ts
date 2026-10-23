import type { AssignableStep, ExecutionContext } from '../ipc/Protocol';
import type { SendMessageFn, StepRunnerFactory } from './WorkerAdapter';
import { WorkerAdapter } from './WorkerAdapter';

// Built at runtime from parts: a literal would trip secret scanners on the source file.
const TOKEN = ['tk', '_Ab3xY9', 'Q7z'].join('');
const KEY_LINES = [['-----BEGIN ', 'KEY-----'].join(''), ['MIIEvQIBADANBgkq', 'hkiG9w0B'].join('')];
const KEY = KEY_LINES.join('\n');

const step = {
	id: 'call',
	name: 'Call',
	type: 'script',
	script: 'echo x',
	secrets: ['API_TOKEN'],
} as unknown as AssignableStep;

function context(secrets: Record<string, string> | undefined): ExecutionContext {
	return {
		executionId: 'testexec',
		inputs: { plain: 'v' },
		stepOutputs: {},
		stepMeta: {},
		workspaceDir: '/tmp/ws',
		outputsDir: '/tmp/ws.meta/outputs',
		cwd: '/tmp/ws',
		...(secrets ? { secrets } : {}),
	};
}

describe('WorkerAdapter secrets', () => {
	let sent: Array<Record<string, unknown>>;
	let sendMessage: SendMessageFn;
	let executeStep: ReturnType<typeof vi.fn>;
	let adapter: WorkerAdapter;

	beforeEach(() => {
		sent = [];
		sendMessage = (message): void => {
			sent.push(message as unknown as Record<string, unknown>);
		};
		executeStep = vi.fn();
		const factory: StepRunnerFactory = () => ({ executeStep }) as never;
		adapter = new WorkerAdapter(factory);
	});

	it('gives the step its secrets as template inputs and as the secrets map, next to the plain inputs', async () => {
		executeStep.mockResolvedValue({ outputs: {} });
		await adapter.execute(step, context({ API_TOKEN: TOKEN }), sendMessage);
		const templateContext = executeStep.mock.calls[0]![2] as { inputs: Record<string, string>; secrets: unknown };
		expect(templateContext.inputs).toEqual({ plain: 'v', API_TOKEN: TOKEN });
		expect(templateContext.secrets).toEqual({ API_TOKEN: TOKEN });
	});

	it('masks stdout before it is split into log lines, so a multi-line secret cannot leak line by line', async () => {
		executeStep.mockResolvedValue({ stdout: `start\n${KEY}\nend`, outputs: {} });
		await adapter.execute(step, context({ API_TOKEN: KEY }), sendMessage);
		const text = JSON.stringify(sent);
		for (const line of KEY_LINES) {
			expect(text).not.toContain(line);
		}
		expect(text).toContain('[secret:API_TOKEN]');
	});

	it('masks the returned outputs and meta', async () => {
		executeStep.mockResolvedValue({ outputs: { body: `got ${TOKEN}` }, meta: { note: TOKEN } });
		const result = await adapter.execute(step, context({ API_TOKEN: TOKEN }), sendMessage);
		expect(JSON.stringify(result)).not.toContain(TOKEN);
		expect(result.output).toEqual({ body: 'got [secret:API_TOKEN]' });
	});

	it('masks the error, stdout, stderr and outputs of a failed step', async () => {
		executeStep.mockResolvedValue({
			error: `failed with ${TOKEN}`,
			stdout: `o ${TOKEN}`,
			stderr: `e ${TOKEN}`,
			outputs: { stderr: TOKEN },
		});
		const failure = await adapter
			.execute(step, context({ API_TOKEN: TOKEN }), sendMessage)
			.catch((error: unknown) => error);
		const err = failure as Error & { stdout: string; stderr: string; stepOutputs: unknown };
		expect(err.message).toBe('failed with [secret:API_TOKEN]');
		expect(err.stdout).toBe('o [secret:API_TOKEN]');
		expect(err.stderr).toBe('e [secret:API_TOKEN]');
		expect(JSON.stringify(err.stepOutputs)).not.toContain(TOKEN);
		expect(JSON.stringify(sent)).not.toContain(TOKEN);
	});

	it('masks an exception thrown by the runner', async () => {
		executeStep.mockRejectedValue(new Error(`render error near ${TOKEN}`));
		const failure = await adapter
			.execute(step, context({ API_TOKEN: TOKEN }), sendMessage)
			.catch((error: unknown) => error);
		expect((failure as Error).message).toBe('render error near [secret:API_TOKEN]');
	});

	it('leaves everything untouched when the step has no secret', async () => {
		executeStep.mockResolvedValue({ stdout: 'plain output', outputs: { a: 'b' } });
		const result = await adapter.execute(step, context(undefined), sendMessage);
		expect(result.output).toEqual({ a: 'b' });
		expect(JSON.stringify(sent)).toContain('plain output');
	});
});
