import { HookDispatcher } from '@wadeck-app/shared-cli/HookDispatcher';
import { WorkspaceManager } from 'flow-engine';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { FlowConfig } from '../config/FlowConfig';
import { RegisteredProjectFixture } from '../test-utils/RegisteredProjectFixture';
import { createDaemonCommands } from './createDaemonCommands';

describe('createDaemonCommands run', () => {
	let fixture: RegisteredProjectFixture;
	let handleRun: ReturnType<typeof vi.fn>;
	let prune: ReturnType<typeof vi.spyOn>;
	let run: (payload: unknown) => Promise<unknown>;

	beforeEach(() => {
		fixture = new RegisteredProjectFixture().useAsProcessEnv();
		handleRun = vi.fn().mockResolvedValue({ type: 'execution_started', executionId: 'x' });
		prune = vi.spyOn(WorkspaceManager, 'pruneOldWorkspaceDir').mockImplementation(() => undefined);
		const config = { workspace: { retainDays: 7, maxWorkspaces: 3 } } as FlowConfig;
		const commands = createDaemonCommands(config, () => ({ commandHandler: { handleRun } }) as never);
		run = commands['run'] as (payload: unknown) => Promise<unknown>;
	});

	afterEach(() => {
		fixture.dispose();
	});

	function writeHooks(folder: string, command: string): void {
		fs.mkdirSync(path.join(folder, '.flow'), { recursive: true });
		fs.writeFileSync(path.join(folder, '.flow', 'config.yml'), `hooks:\n  onFlowEnd:\n    - command: ${command}\n`);
	}

	it('refuses a run from an unregistered folder without pruning, reading hooks or reaching the handler', async () => {
		const cwd = fixture.makeFolder('unregistered');

		const response = await run({ type: 'run', flowFile: 'f.yml', cwd });

		expect(response).toMatchObject({
			type: 'error',
			code: 'PROJECT_RESOLUTION_FAILED',
			detail: 'NO_PROJECT_IN_SCOPE',
		});
		expect(prune).not.toHaveBeenCalled();
		expect(handleRun).not.toHaveBeenCalled();
	});

	it('prunes and reads the hooks of the project, then hands the resolved project to the handler', async () => {
		const alpha = await fixture.register('alpha');
		writeHooks(alpha.folder!, 'echo alpha');
		const sub = path.join(alpha.folder!, 'sub');
		fs.mkdirSync(sub);

		await run({ type: 'run', flowFile: 'f.yml', cwd: sub });

		expect(prune).toHaveBeenCalledWith(path.join(alpha.folder!, '.flow', 'workspaces'), 7, 3);
		expect(handleRun).toHaveBeenCalledTimes(1);
		const [cmd, dispatcher, resolved] = handleRun.mock.calls[0] as [unknown, unknown, { project: { id: string } }];
		expect(cmd).toMatchObject({ cwd: sub });
		expect(dispatcher).toBeInstanceOf(HookDispatcher);
		expect(resolved.project.id).toBe(alpha.id);
	});

	it('works on the project named with --project, not on the folder the client is in', async () => {
		const alpha = await fixture.register('alpha');
		const beta = await fixture.register('beta');
		writeHooks(beta.folder!, 'echo beta');

		await run({ type: 'run', flowFile: 'f.yml', cwd: alpha.folder, projectRef: 'beta' });

		expect(prune).toHaveBeenCalledWith(path.join(beta.folder!, '.flow', 'workspaces'), 7, 3);
		const resolved = handleRun.mock.calls[0]![2] as { project: { id: string }; projectPath: string };
		expect(resolved.project.id).toBe(beta.id);
		expect(resolved.projectPath).toBe(beta.folder);
	});

	it('refuses a run when the project hooks file cannot be parsed, instead of running without its hooks', async () => {
		const alpha = await fixture.register('alpha');
		fs.mkdirSync(path.join(alpha.folder!, '.flow'));
		fs.writeFileSync(path.join(alpha.folder!, '.flow', 'config.yml'), 'hooks:\n  onFlowEnd: [unclosed\n');

		await expect(run({ type: 'run', flowFile: 'f.yml', cwd: alpha.folder })).rejects.toThrow(
			/Failed to parse flow config/
		);
		expect(handleRun).not.toHaveBeenCalled();
	});
});
