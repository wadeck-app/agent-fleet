import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { RegisteredProjectFixture } from '../test-utils/RegisteredProjectFixture';
import { CommandHandler } from './CommandHandler';

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
id: project-flow
version: "1.0.0"
name: Project Flow
description: d
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
steps:
  - id: only
    name: Only
    type: script
    script: echo hi
`;

describe('CommandHandler project resolution', () => {
	let tmpDir: string;
	let daemonDir: string;
	let flowFile: string;
	let sent: unknown[];
	let handlers: CommandHandler[];
	let registry: RegisteredProjectFixture;

	function build(): CommandHandler {
		const pool = {
			describe: vi.fn().mockReturnValue({ workerId: 'w', sourceId: 'built-in:fork', features: [] }),
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
						attachedProjectIds: [],
						hasUserInterface: false,
						ephemeral: true,
						shellCapabilities: [],
					},
				},
			]),
			markBusy: vi.fn(),
			hasBusyWorkers: vi.fn().mockReturnValue(false),
			send: vi.fn((_ws: unknown, message: unknown) => {
				sent.push(message);
				return true;
			}),
			summarize: vi.fn().mockReturnValue([]),
			canProvision: vi.fn().mockReturnValue(false),
			planProvisioning: vi.fn().mockReturnValue({ fork: 0 }),
		};
		const handler = new CommandHandler(daemonDir, pool as never, pool as never);
		handlers.push(handler);
		return handler;
	}

	beforeEach(() => {
		registry = new RegisteredProjectFixture().useAsProcessEnv();
		tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-project-')));
		daemonDir = path.join(tmpDir, 'daemon');
		fs.mkdirSync(path.join(daemonDir, 'executions'), { recursive: true });
		fs.mkdirSync(path.join(daemonDir, 'logs'), { recursive: true });
		flowFile = path.join(tmpDir, 'flow.yml');
		fs.writeFileSync(flowFile, FLOW_YAML);
		sent = [];
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
		registry.dispose();
	});

	function recordFiles(): string[] {
		return fs.readdirSync(path.join(daemonDir, 'executions'));
	}

	function readRecord(file: string): { projectId?: string; projectRoot?: string } {
		return JSON.parse(fs.readFileSync(path.join(daemonDir, 'executions', file), 'utf8')) as {
			projectId?: string;
			projectRoot?: string;
		};
	}

	function onlyRecord(): { projectId?: string; projectRoot?: string } {
		const files = recordFiles();
		expect(files).toHaveLength(1);
		return readRecord(files[0]!);
	}

	function expectNothingLeftBehind(): void {
		expect(mockAllocate).not.toHaveBeenCalled();
		expect(recordFiles()).toEqual([]);
		expect(sent).toEqual([]);
	}

	it('refuses a run from a folder no project contains, before any workspace, record or step', async () => {
		await registry.register('alpha');
		const cwd = registry.makeFolder('unregistered');

		const result = await build().handleRun({ type: 'run', flowFile, cwd } as never);

		expect(result).toMatchObject({
			type: 'error',
			code: 'PROJECT_RESOLUTION_FAILED',
			detail: 'NO_PROJECT_IN_SCOPE',
		});
		const message = (result as { message: string }).message;
		expect(message).toContain(cwd);
		expect(message).toContain(`project add "${cwd}"`);
		expectNothingLeftBehind();
	});

	it('still refuses a folder that only has the old markers (.git, .flow/config.yml, legacy files)', async () => {
		const cwd = registry.makeFolder('old-markers');
		fs.mkdirSync(path.join(cwd, '.git'));
		fs.mkdirSync(path.join(cwd, '.flow'));
		fs.writeFileSync(path.join(cwd, '.flow', 'config.yml'), '');
		fs.mkdirSync(path.join(cwd, '.agent-fleet'));
		fs.writeFileSync(path.join(cwd, '.agent-fleet', 'flows.yml'), '');

		const result = await build().handleRun({ type: 'run', flowFile, cwd } as never);

		expect(result).toMatchObject({ type: 'error', code: 'PROJECT_RESOLUTION_FAILED' });
		expectNothingLeftBehind();
	});

	it('records the project id and root of a run started from a project subdirectory', async () => {
		const alpha = await registry.register('alpha');
		const nested = path.join(alpha.folder!, 'sub');
		fs.mkdirSync(nested);

		const result = await build().handleRun({ type: 'run', flowFile, cwd: nested } as never);

		expect(result.type).toBe('execution_started');
		expect(onlyRecord()).toMatchObject({ projectId: alpha.id, projectRoot: alpha.folder });
	});

	it('gives two runs from two projects, in one daemon, their own project ids', async () => {
		const alpha = await registry.register('alpha');
		const beta = await registry.register('beta');
		const handler = build();

		await handler.handleRun({ type: 'run', flowFile, cwd: alpha.folder } as never);
		await handler.handleRun({ type: 'run', flowFile, cwd: beta.folder } as never);

		const ids = recordFiles().map(file => readRecord(file).projectId);
		expect(ids.sort()).toEqual([alpha.id, beta.id].sort());
	});

	it('sees a project registered between two runs, without a restart', async () => {
		const later = registry.makeFolder('later');
		const handler = build();
		expect(await handler.handleRun({ type: 'run', flowFile, cwd: later } as never)).toMatchObject({
			type: 'error',
		});

		const added = await registry.register('later', { folder: later });
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: later } as never);

		expect(result.type).toBe('execution_started');
		expect(onlyRecord().projectId).toBe(added.id);
	});

	it('honours the project the client named with --project, whatever its cwd', async () => {
		const alpha = await registry.register('alpha');
		const elsewhere = registry.makeFolder('elsewhere');

		const result = await build().handleRun({ type: 'run', flowFile, cwd: elsewhere, projectRef: 'alpha' } as never);

		expect(result.type).toBe('execution_started');
		expect(onlyRecord()).toMatchObject({ projectId: alpha.id, projectRoot: alpha.folder });
	});

	it("honours the client's FLOW_PROJECT, which the daemon cannot read from its own environment", async () => {
		const alpha = await registry.register('alpha');
		const elsewhere = registry.makeFolder('elsewhere');

		const result = await build().handleRun({ type: 'run', flowFile, cwd: elsewhere, envProject: 'alpha' } as never);

		expect(result.type).toBe('execution_started');
		expect(onlyRecord().projectId).toBe(alpha.id);
	});

	it('refuses an unknown --project reference with the flag in the message', async () => {
		await registry.register('alpha');

		const result = await build().handleRun({
			type: 'run',
			flowFile,
			cwd: registry.root,
			projectRef: 'nope',
		} as never);

		expect(result).toMatchObject({ type: 'error', code: 'PROJECT_RESOLUTION_FAILED', detail: 'PROJECT_NOT_FOUND' });
		expect((result as { message: string }).message).toContain('--project "nope"');
		expectNothingLeftBehind();
	});

	it('refuses a virtual project (no folder to run in) and says how to give it one', async () => {
		await registry.register('docs-only', { folder: null });

		const result = await build().handleRun({
			type: 'run',
			flowFile,
			cwd: registry.root,
			projectRef: 'docs-only',
		} as never);

		expect(result).toMatchObject({ type: 'error', code: 'PROJECT_RESOLUTION_FAILED', detail: 'VIRTUAL_PROJECT' });
		expect((result as { message: string }).message).toContain('project paths add docs-only');
		expectNothingLeftBehind();
	});

	it('refuses when the client and the daemon read different registries, naming both', async () => {
		const alpha = await registry.register('alpha');
		const clientRegistry = path.join(tmpDir, 'other-xdg', 'project');

		const result = await build().handleRun({
			type: 'run',
			flowFile,
			cwd: alpha.folder,
			registryDir: clientRegistry,
		} as never);

		expect(result).toMatchObject({ type: 'error', code: 'PROJECT_REGISTRY_MISMATCH' });
		const message = (result as { message: string }).message;
		expect(message).toContain(clientRegistry);
		expect(message).toContain(registry.registryDir);
		expect(message).toContain('XDG_CONFIG_HOME');
		expectNothingLeftBehind();
	});
});
