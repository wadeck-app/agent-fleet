import type { AssignableStep, ExecutionContext } from '../ipc/Protocol';
import type { SendMessageFn, StepRunnerFactory } from './WorkerAdapter';
import { WorkerAdapter } from './WorkerAdapter';

const { mockMcpStart, mockMcpStop } = vi.hoisted(() => ({
	mockMcpStart: vi.fn(),
	mockMcpStop: vi.fn(),
}));

vi.mock('./McpServer', () => ({
	McpServer: class MockMcpServer {
		start = mockMcpStart;
		stop = mockMcpStop;
	},
}));

// Built at runtime from parts: a literal would trip secret scanners on the source file.
const TOKEN = ['tk', '_Ab3xY9', 'Q7z'].join('');

const step = {
	id: 'm1',
	name: 'M',
	type: 'model',
	model: 'haiku',
	prompt: 'go',
	secrets: ['API_TOKEN'],
} as unknown as AssignableStep;

function context(secrets?: Record<string, string>): ExecutionContext {
	return {
		executionId: 'testexec',
		inputs: {},
		stepOutputs: {},
		stepMeta: {},
		workspaceDir: '/tmp/ws',
		outputsDir: '/tmp/ws.meta/outputs',
		cwd: '/tmp/ws',
		...(secrets ? { secrets } : {}),
	};
}

type Progress = {
	tool: string | null;
	changed: boolean;
	summary?: string;
	lastCompletedTool?: string;
	advanceMs?: number;
};

describe('WorkerAdapter -- step_progress tool activity', () => {
	let sent: Array<Record<string, unknown>>;
	let sendMessage: SendMessageFn;
	let adapter: WorkerAdapter;
	let report: (progress: Progress[]) => void;
	let now: number;

	beforeEach(() => {
		now = 1_000_000;
		vi.spyOn(Date, 'now').mockImplementation(() => now);
		mockMcpStart.mockResolvedValue({ port: 1, mcpServer: { name: 'flow', command: [], env: {} } });
		mockMcpStop.mockResolvedValue(undefined);
		sent = [];
		sendMessage = (message): void => {
			sent.push(message as unknown as Record<string, unknown>);
		};
		// The runner reports the given progress events, as ModelStepExecutor would, between ticks of the clock.
		const executeStep = vi.fn(
			async (
				_step: unknown,
				_ws: unknown,
				_ctx: unknown,
				_a: unknown,
				_b: unknown,
				onActivity: (p: unknown) => void
			) => {
				for (const p of pendingProgress) {
					now += p.advanceMs ?? 0;
					onActivity({
						activity: p.tool === null ? null : { tool: p.tool, summary: p.summary ?? '', startedAt: now },
						...(p.lastCompletedTool !== undefined && { lastCompletedTool: p.lastCompletedTool }),
						changed: p.changed,
					});
				}
				return { outputs: {} };
			}
		);
		const factory: StepRunnerFactory = () => ({ executeStep, setOnRenderedPrompt: vi.fn() }) as never;
		adapter = new WorkerAdapter(factory);
		report = progress => {
			pendingProgress = progress as Array<Progress & { advanceMs?: number }>;
		};
	});

	let pendingProgress: Array<Progress & { advanceMs?: number }> = [];

	const progressMessages = (): Array<Record<string, unknown>> => sent.filter(m => m['type'] === 'step_progress');

	// The 5s throttle exists to spare the daemon one message per stream chunk. A tool call starting or
	// returning is rare and is exactly what a stall report later depends on, so it must never be dropped.
	it('sends a changed tool call at once, even inside the throttle window', async () => {
		report([
			{ tool: null, changed: false },
			{ tool: 'Bash', summary: 'npm test', changed: true },
			{ tool: null, lastCompletedTool: 'Bash', changed: true },
		]);

		await adapter.execute(step, context(), sendMessage);

		const messages = progressMessages();
		expect(messages).toHaveLength(3);
		expect(messages[1]).toMatchObject({
			activity: { tool: 'Bash', summary: 'npm test', startedAt: now },
		});
		expect(messages[2]).toMatchObject({ activity: null, lastCompletedTool: 'Bash' });
	});

	it('keeps throttling plain heartbeats, which say nothing about the call', async () => {
		report([
			{ tool: null, changed: false },
			{ tool: null, changed: false, advanceMs: 1_000 },
			{ tool: null, changed: false, advanceMs: 6_000 },
		]);

		await adapter.execute(step, context(), sendMessage);

		const messages = progressMessages();
		expect(messages).toHaveLength(2);
		// A heartbeat must not overwrite what the daemon knows with "nothing running".
		for (const message of messages) {
			expect(message).not.toHaveProperty('activity');
		}
	});

	// maskDeep already covers every outgoing message, but it would see a secret cut in half by the
	// truncation and let the leading characters through, so the cut has to come after the masking.
	it('masks the summary before truncating it to 120 characters', async () => {
		report([{ tool: 'Bash', summary: `${'x'.repeat(110)}${TOKEN} and more after it`, changed: true }]);

		await adapter.execute(step, context({ API_TOKEN: TOKEN }), sendMessage);

		const activity = progressMessages()[0]!['activity'] as { summary: string };
		expect(activity.summary).toHaveLength(120);
		expect(activity.summary).not.toContain(TOKEN.slice(0, 4));
		expect(activity.summary.startsWith('x'.repeat(110))).toBe(true);
	});

	it('leaves a short summary untouched', async () => {
		report([{ tool: 'Read', summary: '/a/b.ts', changed: true }]);

		await adapter.execute(step, context(), sendMessage);

		expect((progressMessages()[0]!['activity'] as { summary: string }).summary).toBe('/a/b.ts');
	});
});
