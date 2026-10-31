/**
 * A run whose first ready steps cannot be collected (a top-level `when` the scheduler cannot evaluate: not a boolean here, since
 * a read of a step it does not depend on is now refused earlier by `flow validate`) is
 * refused by the scheduler AFTER the execution record, the workspace and the in-memory entries were created. It must
 * end as a terminal `failed` record carrying the engine-origin reason, with everything allocated released, and the
 * client must get that reason (not a record stuck at `queued` forever).
 *
 * REAL FlowScheduler, ExecutionStore (temp dir) and CommandHandler; only the worker pool, log writer and workspace
 * provider are stubs.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ExecutionStore } from '../storage/ExecutionStore';
import { CommandHandler } from './CommandHandler';
import { registerFolderAsProject } from './CommandHandlerTestHarness';

const WHEN = "'yes'";

const FLOW_YAML = `\
id: refused-flow
version: "1.0.0"
name: Refused Flow
description: x has a when that is not a boolean
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: a
    name: A
    type: script
    script: echo a
    output:
      go:
        type: string
        from: stdout
  - id: x
    name: X
    type: script
    script: echo x
    when: "${WHEN}"
`;

const pool = {
	describe: vi.fn().mockReturnValue({ workerId: 'w-test', sourceId: 'built-in:fork' }),
	remove: vi.fn(),
	getIdle: vi.fn().mockReturnValue(undefined),
	listIdle: vi.fn(() => []),
	markBusy: vi.fn(),
	markIdle: vi.fn(),
	hasBusyWorkers: vi.fn().mockReturnValue(false),
	send: vi.fn().mockReturnValue(true),
	broadcast: vi.fn(),
	register: vi.fn(),
	canProvision: vi.fn().mockReturnValue(false),
	planProvisioning: vi.fn().mockReturnValue({ fork: 0 }),
	provision: vi.fn().mockResolvedValue(undefined),
	registerWorker: vi.fn().mockReturnValue(true),
};

describe('RunRequestHandler -- a run refused by the scheduler after its record exists', () => {
	let tmpDir: string;
	let disposeProject: () => void;
	let store: ExecutionStore;
	let handler: CommandHandler;
	let provider: { allocate: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
	let flowFile: string;

	function recordIds(): string[] {
		const dir = path.join(tmpDir, 'executions');
		return fs.existsSync(dir)
			? fs
					.readdirSync(dir)
					.filter(f => f.endsWith('.json'))
					.map(f => f.slice(0, -'.json'.length))
			: [];
	}

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-engine-refusal-'));
		({ dispose: disposeProject } = await registerFolderAsProject(tmpDir));
		fs.mkdirSync(path.join(tmpDir, 'daemon'), { recursive: true });
		vi.clearAllMocks();
		fs.mkdirSync(path.join(tmpDir, 'executions'), { recursive: true });
		store = new ExecutionStore(path.join(tmpDir, 'executions'));
		provider = {
			allocate: vi.fn().mockResolvedValue({ path: path.join(tmpDir, 'plugin-ws'), id: 'p:1' }),
			release: vi.fn().mockResolvedValue(undefined),
		};
		handler = new CommandHandler(
			path.join(tmpDir, 'daemon'),
			pool as never,
			pool as never,
			undefined,
			store,
			{ write: vi.fn(), writeExecution: vi.fn() } as never,
			false,
			undefined,
			undefined,
			provider as never
		);
		flowFile = path.join(tmpDir, 'refused-flow.yml');
		fs.writeFileSync(flowFile, FLOW_YAML);
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	});

	afterEach(() => {
		handler.stopBackgroundWork();
		disposeProject();
		vi.restoreAllMocks();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('ends the record as failed with the actionable reason and releases what was allocated', async () => {
		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir, requestId: 'req-1' } as never);

		expect(response.type).toBe('error');
		const message = response.type === 'error' ? response.message : '';
		expect(message).toContain("step 'x'");
		expect(message).toContain(WHEN);
		expect(message).toMatch(/boolean expression/);

		const ids = recordIds();
		expect(ids).toHaveLength(1);
		const record = store.read(ids[0]!);
		expect(record.status).toBe('failed');
		expect(record.steps.x!.status).toBe('failed');
		expect(message).toContain(record.steps.x!.error);
		expect(message).toContain(`flow show ${ids[0]}`);
		expect(record.completedAt).toBeDefined();

		expect(handler.hasActiveExecutions()).toBe(false);
		expect(handler.isQueueEmpty()).toBe(true);
		expect(provider.release).toHaveBeenCalledTimes(1);
	});

	it('answers a retry with the same request id with the same refusal, never a started execution', async () => {
		const cmd = { type: 'run', flowFile, cwd: tmpDir, requestId: 'req-1' } as never;

		const first = await handler.handleRun(cmd);
		const second = await handler.handleRun(cmd);

		expect(second).toEqual(first);
		expect(second.type).toBe('error');
		expect(recordIds()).toHaveLength(1);
	});
});
