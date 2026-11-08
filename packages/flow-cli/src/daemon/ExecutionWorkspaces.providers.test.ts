import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { LogWriter } from '../storage/LogWriter';
import type { WorkspaceProviderSource } from '../workspace/WorkspaceProviders';
import { ExecutionWorkspaces } from './ExecutionWorkspaces';

describe('ExecutionWorkspaces provider resolution', () => {
	let root: string;
	const writeExecution = vi.fn();
	const flow = { id: 'f', version: '1.0.0' } as never;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-ws-prov-'));
		writeExecution.mockClear();
	});
	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	function workspacesWith(source: WorkspaceProviderSource): ExecutionWorkspaces {
		return new ExecutionWorkspaces({ writeExecution } as unknown as LogWriter, source);
	}

	it('refuses the run with the message of the resolution error, not a generic text', async () => {
		const result = await workspacesWith({
			providerFor: vi
				.fn()
				.mockRejectedValue(new Error('The flow does not declare a workspace. Add "workspace: in-place".')),
		}).allocate(flow, 'abcd1234', root);

		expect(result).toEqual({
			ok: false,
			response: {
				type: 'error',
				code: 'WORKSPACE_ERROR',
				message: 'The flow does not declare a workspace. Add "workspace: in-place".',
			},
		});
	});

	it('refuses the run with the message of the provider when it cannot allocate', async () => {
		const provider = {
			allocate: vi.fn().mockRejectedValue(new Error('Workspace option "dir": "x" does not exist.')),
			release: vi.fn(),
		};

		const result = await workspacesWith({
			providerFor: vi.fn().mockResolvedValue({ provider, warnings: [] }),
		}).allocate(flow, 'abcd1234', root);

		expect(result).toMatchObject({ ok: false, response: { code: 'WORKSPACE_ERROR' } });
		expect((result as { response: { message: string } }).response.message).toContain('"dir": "x" does not exist');
		expect(writeExecution).toHaveBeenCalledWith('__workspace', expect.stringContaining('does not exist'), 'error');
	});

	it('writes the deprecation warnings of the declaration to the log of the execution', async () => {
		const provider = {
			allocate: vi.fn().mockResolvedValue({ path: path.join(root, 'ws'), id: 'p:1' }),
			release: vi.fn(),
		};

		await workspacesWith({
			providerFor: vi.fn().mockResolvedValue({ provider, warnings: ['"none" is deprecated'] }),
		}).allocate(flow, 'abcd1234', root);

		expect(writeExecution).toHaveBeenCalledWith('abcd1234', '"none" is deprecated', 'warning');
	});

	it('keeps the WORKSPACE_GIT_FAILED code and the full message of a provider whose git setup failed', async () => {
		const failure = Object.assign(new Error('Worktree "x" could not be created: not a git repository. Fix: ...'), {
			code: 'WORKSPACE_GIT_FAILED',
		});
		const provider = { allocate: vi.fn().mockRejectedValue(failure), release: vi.fn() };

		const result = await workspacesWith({
			providerFor: vi.fn().mockResolvedValue({ provider, warnings: [] }),
		}).allocate(flow, 'abcd1234', root);

		expect(result).toEqual({
			ok: false,
			response: { type: 'error', code: 'WORKSPACE_GIT_FAILED', message: failure.message },
		});
	});

	// Windows paths make the first sentence longer than any per-line cap; the Fix: part comes after it.
	it('does not cut a long WORKSPACE_GIT_FAILED message, and still masks a token in it', async () => {
		const longPath = `/home/someone/${'my dir/'.repeat(60)}proj`;
		const failure = Object.assign(
			new Error(
				`Worktree "${longPath}" could not be created: not a git repository. The run was not started. Fix: run flow from inside the repository. https://user:s3cret@host/r`
			),
			{ code: 'WORKSPACE_GIT_FAILED' }
		);
		const provider = { allocate: vi.fn().mockRejectedValue(failure), release: vi.fn() };

		const result = await workspacesWith({
			providerFor: vi.fn().mockResolvedValue({ provider, warnings: [] }),
		}).allocate(flow, 'abcd1234', root);

		const message = (result as { response: { message: string } }).response.message;
		expect(message).toContain('Fix: run flow from inside the repository.');
		expect(message).not.toContain('s3cret');
		expect(message).not.toContain('…');
	});
});
