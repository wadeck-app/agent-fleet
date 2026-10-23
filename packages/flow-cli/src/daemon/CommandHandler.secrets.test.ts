import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { WORKER_FEATURE_SECRETS } from '../ipc/Protocol';
import { ExecutionMasks } from '../secrets/ExecutionMasks';
import { CommandHandler } from './CommandHandler';
import { DaemonSecrets } from './DaemonSecrets';

// Built at runtime from parts: a literal would trip secret scanners on the source file.
const TOKEN = ['tk', '_Ab3xY9', 'Q7z'].join('');

const { mockAllocate } = vi.hoisted(() => ({
	mockAllocate: vi.fn(),
}));

vi.mock('flow-engine', async importOriginal => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		WorkspaceManager: class MockWorkspaceManager {
			allocate = mockAllocate;
			release = vi.fn().mockResolvedValue(undefined);
		},
	};
});

const FLOW_YAML = `\
id: secret-flow
version: "1.0.0"
name: Secret Flow
description: d
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs:
  API_TOKEN:
    type: password
steps:
  - id: call
    name: Call
    type: script
    script: echo hi
    secrets: [API_TOKEN]
  - id: other
    name: Other
    type: script
    script: echo other
    depends: [call]
`;

interface Assign {
	stepId: string;
	stepConfig: unknown;
	executionContext: {
		inputs: Record<string, string>;
		secrets?: Record<string, string>;
		stepOutputs: Record<string, unknown>;
	};
}

describe('CommandHandler secrets', () => {
	let tmpDir: string;
	let daemonDir: string;
	let flowFile: string;
	let assigns: Assign[];
	let handlers: CommandHandler[];

	function build(env: Record<string, string>, features: string[] = [WORKER_FEATURE_SECRETS]): CommandHandler {
		const pool = {
			describe: vi.fn().mockReturnValue({ workerId: 'w', sourceId: 'built-in:fork', features }),
			remove: vi.fn(),
			listIdle: vi.fn(() => [
				{
					ws: {},
					worker: {
						state: 'idle',
						workerId: 'w',
						pid: 1,
						labels: [],
						attachedProjects: [],
						hasUserInterface: false,
						ephemeral: true,
						shellCapabilities: [],
					},
				},
			]),
			markBusy: vi.fn(),
			hasBusyWorkers: vi.fn().mockReturnValue(false),
			send: vi.fn((_ws: unknown, message: unknown) => {
				assigns.push(message as Assign);
				return true;
			}),
			summarize: vi.fn().mockReturnValue([]),
			canProvision: vi.fn().mockReturnValue(false),
			planProvisioning: vi.fn().mockReturnValue({ fork: 0 }),
		};
		const handler = new CommandHandler(
			daemonDir,
			pool as never,
			pool as never,
			undefined,
			undefined,
			undefined,
			false,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			new DaemonSecrets(new ExecutionMasks(), env)
		);
		handlers.push(handler);
		return handler;
	}

	const run = (handler: CommandHandler, inputs: Record<string, string>) =>
		handler.handleRun({ type: 'run', flowFile, cwd: tmpDir, inputs } as never);

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-secrets-'));
		daemonDir = path.join(tmpDir, 'daemon');
		fs.mkdirSync(path.join(daemonDir, 'executions'), { recursive: true });
		fs.mkdirSync(path.join(daemonDir, 'logs'), { recursive: true });
		flowFile = path.join(tmpDir, 'flow.yml');
		fs.writeFileSync(flowFile, FLOW_YAML);
		assigns = [];
		handlers = [];
		mockAllocate.mockReset();
		mockAllocate.mockResolvedValue({
			path: path.join(tmpDir, 'ws'),
			id: 'ws-1',
			metaDir: path.join(tmpDir, 'ws.meta'),
		});
	});

	afterEach(() => {
		for (const handler of handlers) {
			handler.stopBackgroundWork();
		}
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('sends the secret only with the step that uses it, never in the inputs, the step config or the record', async () => {
		const handler = build({ T: TOKEN });
		const result = await run(handler, { API_TOKEN: 'env://T' });
		expect(result.type).toBe('execution_started');
		const { executionId } = result as { executionId: string };

		expect(assigns).toHaveLength(1);
		const assign = assigns[0]!;
		expect(assign.stepId).toBe('call');
		expect(assign.executionContext.secrets).toEqual({ API_TOKEN: TOKEN });
		expect(assign.executionContext.inputs).toEqual({});
		expect(JSON.stringify(assign.stepConfig)).not.toContain(TOKEN);

		const record = fs.readFileSync(path.join(daemonDir, 'executions', `${executionId}.json`), 'utf8');
		expect(record).not.toContain(TOKEN);
	});

	it('masks step outputs before later steps receive them', async () => {
		const handler = build({ T: TOKEN });
		const { executionId } = (await run(handler, { API_TOKEN: 'env://T' })) as { executionId: string };

		handler.onStepCompleted(executionId, 'call', { body: `got ${TOKEN}` });
		handler.tryDispatch();

		const next = assigns.find(assign => assign.stepId === 'other')!;
		expect(next.executionContext.secrets).toBeUndefined();
		expect(JSON.stringify(next.executionContext.stepOutputs)).not.toContain(TOKEN);
		expect(next.executionContext.stepOutputs).toEqual({ call: { body: 'got [secret:API_TOKEN]' } });
	});

	it('refuses the run before any workspace or record exists when a secret cannot be resolved', async () => {
		const handler = build({});
		const result = await run(handler, { API_TOKEN: 'env://MISSING_VAR' });

		if (result.type !== 'error') {
			throw new Error('Expected an error response');
		}
		expect(result.code).toBe('SECRET_RESOLUTION_FAILED');
		expect(result.message).toContain('API_TOKEN');
		expect(result.message).toContain('MISSING_VAR');
		expect(mockAllocate).not.toHaveBeenCalled();
		expect(fs.readdirSync(path.join(daemonDir, 'executions'))).toEqual([]);
		expect(assigns).toHaveLength(0);
	});

	it('refuses a literal given in place of a reference, without echoing it', async () => {
		const handler = build({});
		const result = await run(handler, { API_TOKEN: TOKEN });

		if (result.type !== 'error') {
			throw new Error('Expected an error response');
		}
		expect(result.code).toBe('SECRET_RESOLUTION_FAILED');
		expect(result.message).not.toContain(TOKEN);
	});

	it('fails a step that needs secrets instead of handing it to a worker that cannot inject them', async () => {
		const handler = build({ T: TOKEN }, []);
		await run(handler, { API_TOKEN: 'env://T' });

		expect(assigns).toHaveLength(0);
		const records = fs.readdirSync(path.join(daemonDir, 'executions'));
		const record = fs.readFileSync(path.join(daemonDir, 'executions', records[0]!), 'utf8');
		expect(record).toContain('does not support secrets');
		expect(record).not.toContain(TOKEN);
	});
});
