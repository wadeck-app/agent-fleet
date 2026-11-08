import type { WorkspaceProvider, WorkspaceRequest } from 'extension-points';
import type { FlowDefinition } from 'flow-engine';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { WorkspaceProviders } from './WorkspaceProviders';

function flowWith(declaration: unknown, extra: Record<string, unknown> = {}): FlowDefinition {
	return { id: 'f', version: '1.0.0', workspace: declaration, steps: [], ...extra } as unknown as FlowDefinition;
}

describe('WorkspaceProviders', () => {
	let project: string;

	beforeEach(() => {
		project = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-providers-'));
	});
	afterEach(() => {
		fs.rmSync(project, { recursive: true, force: true });
	});

	function request(): WorkspaceRequest {
		return {
			taskId: 'abcd1234',
			executionId: 'abcd1234',
			projectDir: project,
			flow: { id: 'f', version: '1.0.0' },
		};
	}

	it('serves in-place from the project folder', async () => {
		const { provider, warnings } = await new WorkspaceProviders().providerFor(flowWith('in-place'));

		expect(warnings).toEqual([]);
		expect((await provider.allocate(request())).path).toBe(path.resolve(project));
	});

	it('serves readonly with a read-only handle', async () => {
		const { provider } = await new WorkspaceProviders().providerFor(flowWith({ provider: 'readonly' }));

		expect((await provider.allocate(request())).readOnly).toBe(true);
	});

	it('serves the legacy "mode: manual" as in-place, with the deprecation warning', async () => {
		const { provider, warnings } = await new WorkspaceProviders().providerFor(
			flowWith({ mode: 'manual', gitStrategy: 'any', reusePolicy: 'never' })
		);

		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('workspace: in-place');
		expect((await provider.allocate(request())).path).toBe(path.resolve(project));
	});

	it('serves the "none" alias as in-place, with a warning', async () => {
		const { warnings } = await new WorkspaceProviders().providerFor(flowWith('none'));

		expect(warnings[0]).toContain('"none"');
	});

	it('builds worktree from its options', async () => {
		const { provider } = await new WorkspaceProviders().providerFor(
			flowWith({ provider: 'worktree', baseDir: '../worktrees' })
		);

		expect(typeof provider.allocate).toBe('function');
	});

	it('refuses a flow with no workspace, naming the providers', async () => {
		await expect(new WorkspaceProviders().providerFor(flowWith(undefined))).rejects.toThrow(
			/does not declare a workspace.*in-place.*pool.*readonly.*worktree/s
		);
	});

	it('refuses a removed legacy block with the rewrite hint', async () => {
		await expect(
			new WorkspaceProviders().providerFor(flowWith({ mode: 'isolated', gitStrategy: 'main-only' }))
		).rejects.toThrow(/removed.*worktree/s);
	});

	it('refuses an unknown option of a built-in, listing the accepted ones', async () => {
		await expect(
			new WorkspaceProviders().providerFor(flowWith({ provider: 'in-place', folder: 'x' }))
		).rejects.toThrow(/unknown option "folder".*Accepted options: dir/s);
	});

	describe('named instances of the config', () => {
		const instance: WorkspaceProvider = { allocate: vi.fn(), release: vi.fn() };

		it('asks the instance resolver for a name that is not built in', async () => {
			const resolve = vi.fn().mockResolvedValue(instance);

			const { provider } = await new WorkspaceProviders(resolve).providerFor(flowWith('my-instance'));

			expect(provider).toBe(instance);
			expect(resolve).toHaveBeenCalledWith({ use: 'my-instance' });
		});

		it('passes the inline options as section options', async () => {
			const resolve = vi.fn().mockResolvedValue(instance);

			await new WorkspaceProviders(resolve).providerFor(flowWith({ provider: 'my-instance', size: 2 }));

			expect(resolve).toHaveBeenCalledWith({ use: 'my-instance', options: { size: 2 } });
		});

		it('names the built-ins and the config when the instance cannot be resolved', async () => {
			const resolve = vi.fn().mockRejectedValue(new Error('instance "x" not found in global config'));

			await expect(new WorkspaceProviders(resolve).providerFor(flowWith('x'))).rejects.toThrow(
				/Unknown workspace provider "x".*in-place, pool, readonly, worktree.*not found in global config/s
			);
		});

		it('says so when there is no instance resolver at all', async () => {
			await expect(new WorkspaceProviders().providerFor(flowWith('x'))).rejects.toThrow(
				/Unknown workspace provider "x".*in-place, pool, readonly, worktree/s
			);
		});

		it('serves the deprecated plugins.workspace when the flow has no workspace, with a warning', async () => {
			const resolve = vi.fn().mockResolvedValue(instance);
			const section = { use: 'legacy' };

			const result = await new WorkspaceProviders(resolve).providerFor(
				flowWith(undefined, { plugins: { workspace: section } })
			);

			expect(result.provider).toBe(instance);
			expect(resolve).toHaveBeenCalledWith(section);
			expect(result.warnings[0]).toContain('plugins.workspace');
		});

		it('fails loudly when plugins.workspace is used but cannot be resolved', async () => {
			const resolve = vi.fn().mockRejectedValue(new Error('boom'));

			await expect(
				new WorkspaceProviders(resolve).providerFor(
					flowWith(undefined, { plugins: { workspace: { use: 'l' } } })
				)
			).rejects.toThrow(/plugins\.workspace.*boom/s);
		});
	});
});
