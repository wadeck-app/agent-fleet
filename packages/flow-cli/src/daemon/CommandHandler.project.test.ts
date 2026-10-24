import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

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

	function cwdWith(...files: string[]): string {
		const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-project-cwd-')));
		for (const file of files) {
			fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
			fs.writeFileSync(path.join(cwd, file), '');
		}
		return cwd;
	}

	beforeEach(() => {
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
	});

	// D#49: a legacy layout is a project that needs migrating, not "no project".
	it('refuses a run started from a legacy-layout project, before any workspace, record or step', async () => {
		const cwd = cwdWith(path.join('.agent-fleet', 'flows.yml'));

		const result = await build().handleRun({ type: 'run', flowFile, cwd } as never);

		expect(result).toMatchObject({ type: 'error', code: 'PROJECT_RESOLUTION_FAILED' });
		const message = (result as { message: string }).message;
		expect(message).toContain(cwd);
		expect(message).toMatch(/legacy/i);
		expect(message).toContain('.flow/config.yml');
		expect(mockAllocate).not.toHaveBeenCalled();
		expect(fs.readdirSync(path.join(daemonDir, 'executions'))).toEqual([]);
		expect(sent).toEqual([]);

		fs.rmSync(cwd, { recursive: true, force: true });
	});

	// A flow run by absolute path from outside any project is legitimate: forked workers
	// serve it (DefaultWorkerAcceptance), so it must not be refused.
	it('still starts a run that belongs to no project', async () => {
		const cwd = cwdWith();

		const result = await build().handleRun({ type: 'run', flowFile, cwd } as never);

		expect(result.type).toBe('execution_started');
		const record = JSON.parse(
			fs.readFileSync(
				path.join(daemonDir, 'executions', fs.readdirSync(path.join(daemonDir, 'executions'))[0]!),
				'utf8'
			)
		) as { projectRoot?: string };
		expect(record.projectRoot).toBeUndefined();

		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('records the project root of a run started from a project subdirectory', async () => {
		const cwd = cwdWith(path.join('.flow', 'config.yml'));
		const nested = path.join(cwd, 'sub');
		fs.mkdirSync(nested);

		const result = await build().handleRun({ type: 'run', flowFile, cwd: nested } as never);

		expect(result.type).toBe('execution_started');
		const record = JSON.parse(
			fs.readFileSync(
				path.join(daemonDir, 'executions', fs.readdirSync(path.join(daemonDir, 'executions'))[0]!),
				'utf8'
			)
		) as { projectRoot?: string };
		expect(record.projectRoot).toBe(cwd);

		fs.rmSync(cwd, { recursive: true, force: true });
	});
});
