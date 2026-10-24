import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { ExecutionState } from '../ipc/Protocol';
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

function flowBody(version: string | undefined, script = 'echo hi'): Record<string, unknown> {
	return {
		...(version === undefined ? {} : { version }),
		name: 'Versioned Flow',
		description: 'd',
		workspace: { mode: 'manual', gitStrategy: 'any', reusePolicy: 'if-available' },
		steps: [{ id: 'only', name: 'Only', type: 'script', script }],
	};
}

describe('CommandHandler flow versions', () => {
	let tmpDir: string;
	let daemonDir: string;
	let flowFile: string;
	let registryFile: string;
	let handlers: CommandHandler[];

	function build(): CommandHandler {
		const pool = {
			describe: vi.fn().mockReturnValue({ workerId: 'w', sourceId: 'built-in:fork', features: [] }),
			remove: vi.fn(),
			listIdle: vi.fn(() => []),
			markBusy: vi.fn(),
			hasBusyWorkers: vi.fn().mockReturnValue(false),
			send: vi.fn(() => true),
			summarize: vi.fn().mockReturnValue([]),
			canProvision: vi.fn().mockReturnValue(false),
			planProvisioning: vi.fn().mockReturnValue({ fork: 0 }),
		};
		const handler = new CommandHandler(daemonDir, pool as never, pool as never);
		handlers.push(handler);
		return handler;
	}

	const writeFlow = (version: string | undefined, script?: string) =>
		fs.writeFileSync(flowFile, yaml.dump({ id: 'versioned', ...flowBody(version, script) }));
	const writeRegistry = (version: string, script?: string) =>
		fs.writeFileSync(registryFile, yaml.dump({ versioned: flowBody(version, script) }));
	const runFile = (handler = build()) => handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
	const runRegistered = (flowVersion?: string, handler = build()) =>
		handler.handleRun({
			type: 'run',
			flowFile: registryFile,
			flowId: 'versioned',
			registered: true,
			...(flowVersion === undefined ? {} : { flowVersion }),
			cwd: tmpDir,
		} as never);
	const records = (): ExecutionState[] =>
		fs
			.readdirSync(path.join(daemonDir, 'executions'))
			.map(
				name => JSON.parse(fs.readFileSync(path.join(daemonDir, 'executions', name), 'utf8')) as ExecutionState
			)
			.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
	const snapshotText = (record: ExecutionState): string =>
		fs.readFileSync(path.join(daemonDir, 'definitions', ...record.definitionSnapshot!.split('/')), 'utf8');

	beforeEach(() => {
		tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-versions-')));
		daemonDir = path.join(tmpDir, 'daemon');
		fs.mkdirSync(path.join(daemonDir, 'executions'), { recursive: true });
		fs.mkdirSync(path.join(daemonDir, 'logs'), { recursive: true });
		flowFile = path.join(tmpDir, 'flow.yml');
		registryFile = path.join(tmpDir, 'flows.yml');
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

	it('records version, hash, snapshot and the file choice for a run by path, and stores the snapshot', async () => {
		writeFlow('1.4.0');

		expect((await runFile()).type).toBe('execution_started');

		const [record] = records();
		expect(record).toMatchObject({
			flowId: 'versioned',
			flowVersion: '1.4.0',
			versionChoice: 'file',
			definitionSnapshot: expect.stringMatching(/^versioned\/1\.4\.0-[0-9a-f]{12}\.yml$/),
			definitionHash: expect.stringMatching(/^[0-9a-f]{64}$/),
		});
		expect(snapshotText(record!)).toBe(fs.readFileSync(flowFile, 'utf8'));
	});

	it('refuses the same version with different content before any workspace or record exists', async () => {
		writeFlow('1.0.0');
		await runFile();
		mockAllocate.mockClear();
		writeFlow('1.0.0', 'echo edited without bump');

		const result = await runFile();

		expect(result).toMatchObject({ type: 'error', code: 'FLOW_VERSION_CONFLICT' });
		expect((result as { message: string }).message).toContain('bump the version in ' + flowFile);
		expect(records()).toHaveLength(1);
		expect(mockAllocate).not.toHaveBeenCalled();
	});

	it('a definition that fails validation does not freeze its version', async () => {
		fs.writeFileSync(flowFile, yaml.dump({ id: 'versioned', version: '1.0.0', name: 'broken' }));
		expect(await runFile()).toMatchObject({ type: 'error', code: 'VALIDATION_FAILED' });

		writeFlow('1.0.0');
		expect((await runFile()).type).toBe('execution_started');
	});

	it('runs a flow without version as 0.0.0 and logs how to add one', async () => {
		writeFlow(undefined);

		expect((await runFile()).type).toBe('execution_started');

		expect(records()[0]).toMatchObject({ flowVersion: '0.0.0', versionChoice: 'file' });
		const logs = fs
			.readdirSync(path.join(daemonDir, 'logs'))
			.map(name => fs.readFileSync(path.join(daemonDir, 'logs', name), 'utf8'))
			.join('\n');
		expect(logs).toContain("version: '1.0.0'");
	});

	it('refuses an invalid version', async () => {
		fs.writeFileSync(flowFile, yaml.dump({ id: 'versioned', ...flowBody('1.0'), version: '1.0' }));

		expect(await runFile()).toMatchObject({ type: 'error', code: 'FLOW_VERSION_INVALID' });
	});

	it('refuses --flow-version with a file path', async () => {
		writeFlow('1.0.0');

		const result = await build().handleRun({ type: 'run', flowFile, flowVersion: '1.0.0', cwd: tmpDir } as never);

		expect(result).toMatchObject({ type: 'error', code: 'FLOW_VERSION_WITH_FILE' });
		expect((result as { message: string }).message).toContain('@');
	});

	describe('a registered id', () => {
		it('runs the latest version at the time of the run, then a pinned older one from its snapshot', async () => {
			writeRegistry('1.0.0', 'echo v1');
			await runRegistered();
			writeRegistry('1.1.0', 'echo v2');
			await runRegistered();
			await runRegistered('1.0.0');

			const [first, second, pinned] = records();
			expect([first, second, pinned].map(r => [r!.flowVersion, r!.versionChoice])).toEqual([
				['1.0.0', 'latest'],
				['1.1.0', 'latest'],
				['1.0.0', 'pinned'],
			]);
			expect(pinned!.definitionHash).toBe(first!.definitionHash);
			expect(second!.definitionHash).not.toBe(first!.definitionHash);
			expect(snapshotText(pinned!)).toContain('echo v1');
			expect(snapshotText(first!)).toBe(snapshotText(pinned!));
		});

		it('lists the known versions when the pinned one does not exist', async () => {
			writeRegistry('1.0.0');
			await runRegistered();

			const result = await runRegistered('3.0.0');

			expect(result).toMatchObject({ type: 'error', code: 'FLOW_VERSION_NOT_FOUND' });
			expect((result as { message: string }).message).toContain('1.0.0');
			expect(records()).toHaveLength(1);
		});

		it('reports an unknown flow as FLOW_NOT_FOUND with where it looked', async () => {
			const result = await runRegistered();

			expect(result).toMatchObject({ type: 'error', code: 'FLOW_NOT_FOUND' });
			expect((result as { message: string }).message).toContain(registryFile);
		});
	});

	describe('flow resume', () => {
		const TIMEOUT_ERROR = `[file-approval] Timed out after 30 ms waiting for an answer.
  Request file : /tmp/approvals/x_approve.request.json
  Response file: /tmp/approvals/x_approve.response.json (does not exist)
No decision was made -- this step is unanswered, not denied.`;

		it('keeps the version and definition of the run, and re-dispatches the step of that definition, after the file was edited', async () => {
			const interventionFlow = (version: string, title: string) =>
				fs.writeFileSync(
					flowFile,
					yaml.dump({
						id: 'versioned',
						...flowBody(version),
						steps: [
							{ id: 's1', name: 'S1', type: 'script', script: 'echo hello' },
							{
								id: 'approve',
								name: 'Approve',
								type: 'user_intervention',
								interventionType: 'approval',
								depends: ['s1'],
								approval: { title, description: 'Please review' },
							},
						],
					})
				);
			const dispatched: { stepId: string; config?: unknown }[] = [];
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
							hasUserInterface: true,
							ephemeral: true,
							shellCapabilities: [],
						},
					},
				]),
				markBusy: vi.fn(),
				hasBusyWorkers: vi.fn().mockReturnValue(false),
				send: vi.fn((_ws: unknown, message: { stepId: string }) => {
					dispatched.push(message);
					return true;
				}),
				summarize: vi.fn().mockReturnValue([]),
				canProvision: vi.fn().mockReturnValue(false),
				planProvisioning: vi.fn().mockReturnValue({ fork: 0 }),
			};
			const handler = new CommandHandler(daemonDir, pool as never, pool as never);
			handlers.push(handler);
			interventionFlow('1.0.0', 'Title of version 1');
			const started = (await runFile(handler)) as { executionId: string };
			handler.onStepCompleted(started.executionId, 's1', {});
			handler.onStepFailed(started.executionId, 'approve', TIMEOUT_ERROR);
			const before = records()[0]!;
			dispatched.length = 0;
			interventionFlow('2.0.0', 'Title of version 2');

			expect(handler.handleResume(started.executionId)).toMatchObject({
				type: 'execution_resumed',
				stepId: 'approve',
			});

			const after = records()[0]!;
			expect(after).toMatchObject({
				flowVersion: '1.0.0',
				definitionHash: before.definitionHash,
				definitionSnapshot: before.definitionSnapshot,
				versionChoice: 'file',
			});
			expect(JSON.stringify(dispatched)).toContain('Title of version 1');
			expect(JSON.stringify(dispatched)).not.toContain('Title of version 2');
		});
	});
});
