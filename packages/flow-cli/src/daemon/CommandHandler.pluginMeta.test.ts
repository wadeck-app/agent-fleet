import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { PLUGIN_META_MARKER_FILE } from '../storage/PluginMetaOwnership';
import { CommandHandler } from './CommandHandler';
import { registerFolderAsProject } from './CommandHandlerTestHarness';

const FLOW_YAML = `\
id: meta-flow
version: "1.0.0"
name: Meta Flow
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

describe('CommandHandler records the plugin workspace .meta it created', () => {
	let tmpDir: string;
	let disposeProject: () => void;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-handler-meta-'));
		({ dispose: disposeProject } = await registerFolderAsProject(tmpDir));
		fs.mkdirSync(path.join(tmpDir, 'daemon'), { recursive: true });
		vi.clearAllMocks();
	});
	afterEach(() => {
		disposeProject();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	async function run(handlePath: string): Promise<void> {
		const provider = {
			allocate: vi.fn().mockResolvedValue({ path: handlePath, id: 'p:1' }),
			release: vi.fn().mockResolvedValue(undefined),
		};
		const handler = new CommandHandler(
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
		const flowFile = path.join(tmpDir, 'meta-flow.yml');
		fs.writeFileSync(flowFile, FLOW_YAML);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		expect(result.type).toBe('execution_started');
	}

	it('passes pluginMetaDir to the record and writes the marker with the execution id', async () => {
		const handlePath = path.join(tmpDir, 'plugin-ws');

		await run(handlePath);

		const created = mockExecStore.create.mock.calls[0]?.[0] as { executionId: string; pluginMetaDir?: string };
		expect(created.pluginMetaDir).toBe(handlePath + '.meta');
		expect(fs.readFileSync(path.join(handlePath + '.meta', PLUGIN_META_MARKER_FILE), 'utf8')).toBe(
			created.executionId
		);
	});

	it('does not record a .meta that already existed (user directory)', async () => {
		const handlePath = path.join(tmpDir, 'plugin-ws');
		fs.mkdirSync(handlePath + '.meta');

		await run(handlePath);

		const created = mockExecStore.create.mock.calls[0]?.[0] as { pluginMetaDir?: string };
		expect(created.pluginMetaDir).toBeUndefined();
		expect(fs.existsSync(path.join(handlePath + '.meta', PLUGIN_META_MARKER_FILE))).toBe(false);
	});
});
