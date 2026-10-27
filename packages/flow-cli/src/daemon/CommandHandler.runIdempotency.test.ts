import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { CommandHandler } from './CommandHandler';
import { registerFolderAsProject } from './CommandHandlerTestHarness';

const FLOW_YAML = `\
id: idem-flow
version: "1.0.0"
name: Idem Flow
description: One script step
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: only
    name: Only
    type: script
    script: echo hi
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

const mockExecStore = {
	create: vi.fn(),
	read: vi.fn().mockReturnValue({ steps: {} }),
	exists: vi.fn().mockReturnValue(false),
	markStepRunning: vi.fn(),
	update: vi.fn(),
};

const mockLogWriter = { write: vi.fn(), writeExecution: vi.fn() };

describe('a run sent twice with the same request id (the client retried after a timeout)', () => {
	let tmpDir: string;
	let disposeProject: () => void;
	let handler: CommandHandler;
	let flowFile: string;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-handler-idem-'));
		({ dispose: disposeProject } = await registerFolderAsProject(tmpDir));
		fs.mkdirSync(path.join(tmpDir, 'daemon'), { recursive: true });
		vi.clearAllMocks();
		const provider = {
			allocate: vi.fn().mockResolvedValue({ path: path.join(tmpDir, 'plugin-ws'), id: 'p:1' }),
			release: vi.fn().mockResolvedValue(undefined),
		};
		handler = new CommandHandler(
			path.join(tmpDir, 'daemon'),
			pool as never,
			pool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never,
			false,
			undefined,
			undefined,
			provider as never
		);
		flowFile = path.join(tmpDir, 'idem-flow.yml');
		fs.writeFileSync(flowFile, FLOW_YAML);
	});
	afterEach(() => {
		handler.stopBackgroundWork();
		disposeProject();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('creates ONE execution when two concurrent runs share the id, and both get its id', async () => {
		const cmd = { type: 'run', flowFile, cwd: tmpDir, requestId: 'req-1' } as never;

		const [first, second] = await Promise.all([handler.handleRun(cmd), handler.handleRun(cmd)]);

		expect(mockExecStore.create).toHaveBeenCalledTimes(1);
		expect(first).toEqual(second);
		expect(first.type).toBe('execution_started');
	});

	it('answers a retry that arrives after the first run finished with the same execution', async () => {
		const cmd = { type: 'run', flowFile, cwd: tmpDir, requestId: 'req-1' } as never;

		const first = await handler.handleRun(cmd);
		const second = await handler.handleRun(cmd);

		expect(mockExecStore.create).toHaveBeenCalledTimes(1);
		expect(second).toEqual(first);
	});

	it('creates one execution per distinct id', async () => {
		const [first, second] = await Promise.all([
			handler.handleRun({ type: 'run', flowFile, cwd: tmpDir, requestId: 'req-1' } as never),
			handler.handleRun({ type: 'run', flowFile, cwd: tmpDir, requestId: 'req-2' } as never),
		]);

		expect(mockExecStore.create).toHaveBeenCalledTimes(2);
		expect(first).not.toEqual(second);
	});

	it('creates two executions when no request id is sent (older client)', async () => {
		const cmd = { type: 'run', flowFile, cwd: tmpDir } as never;

		await Promise.all([handler.handleRun(cmd), handler.handleRun(cmd)]);

		expect(mockExecStore.create).toHaveBeenCalledTimes(2);
	});

	it('forgets the ids when the daemon stops its background work', async () => {
		const cmd = { type: 'run', flowFile, cwd: tmpDir, requestId: 'req-1' } as never;
		await handler.handleRun(cmd);

		handler.stopBackgroundWork();
		await handler.handleRun(cmd);

		expect(mockExecStore.create).toHaveBeenCalledTimes(2);
	});
});
