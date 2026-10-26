import { HookDispatcher } from '@wadeck-app/shared-cli/HookDispatcher';
import { WorkspaceManager } from 'flow-engine';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { FlowConfig } from '../config/FlowConfig';
import { projectConfigFile } from '../config/ProjectFlowConfig';
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

	function writeHooks(projectId: string, command: string): void {
		const file = projectConfigFile(fixture.registryDir, projectId);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, `hooks:\n  onFlowEnd:\n    - command: ${command}\n`);
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
		writeHooks(alpha.id, 'echo alpha');
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
		writeHooks(beta.id, 'echo beta');

		await run({ type: 'run', flowFile: 'f.yml', cwd: alpha.folder, projectRef: 'beta' });

		expect(prune).toHaveBeenCalledWith(path.join(beta.folder!, '.flow', 'workspaces'), 7, 3);
		const resolved = handleRun.mock.calls[0]![2] as { project: { id: string }; projectPath: string };
		expect(resolved.project.id).toBe(beta.id);
		expect(resolved.projectPath).toBe(beta.folder);
	});

	it('refuses a run when the project hooks file cannot be parsed, instead of running without its hooks', async () => {
		const alpha = await fixture.register('alpha');
		const file = projectConfigFile(fixture.registryDir, alpha.id);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, 'hooks:\n  onFlowEnd: [unclosed\n');

		await expect(run({ type: 'run', flowFile: 'f.yml', cwd: alpha.folder })).rejects.toThrow(
			/Failed to parse flow config/
		);
		expect(handleRun).not.toHaveBeenCalled();
	});

	it('refuses a run when the repository still holds the old .flow/config.yml, naming the command that moves it', async () => {
		const alpha = await fixture.register('alpha');
		const legacy = path.join(alpha.folder!, '.flow', 'config.yml');
		fs.mkdirSync(path.dirname(legacy), { recursive: true });
		fs.writeFileSync(legacy, 'hooks:\n  onFlowEnd:\n    - command: echo old\n');
		const target = projectConfigFile(fixture.registryDir, alpha.id);

		await expect(run({ type: 'run', flowFile: 'f.yml', cwd: alpha.folder })).rejects.toThrow(
			`mv "${legacy}" "${target}"`
		);
		expect(handleRun).not.toHaveBeenCalled();
	});
});
