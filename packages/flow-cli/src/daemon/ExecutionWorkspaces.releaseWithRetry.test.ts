import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { LogWriter } from '../storage/LogWriter';
import { ExecutionWorkspaces } from './ExecutionWorkspaces';

describe('ExecutionWorkspaces.releaseWithRetry', () => {
	let root: string;
	let writeExecution: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-ws-retry-'));
		writeExecution = vi.fn();
	});
	afterEach(() => {
		vi.useRealTimers();
		fs.rmSync(root, { recursive: true, force: true });
	});

	async function allocated(release: () => Promise<void>): Promise<ExecutionWorkspaces> {
		const provider = {
			allocate: vi.fn().mockResolvedValue({ path: path.join(root, 'task-1'), id: 'p:1' }),
			release,
		};
		const workspaces = new ExecutionWorkspaces({ writeExecution } as unknown as LogWriter, provider);
		await workspaces.allocate(root, { id: 'f', version: '1.0.0' } as never, 'abcd1234');
		return workspaces;
	}

	it('releases once when the first attempt works', async () => {
		const release = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
		const workspaces = await allocated(release);

		await workspaces.releaseWithRetry('abcd1234');

		expect(release).toHaveBeenCalledTimes(1);
		expect(workspaces.activeMetaDirs()).toEqual([]);
	});

	it('retries once after about two seconds when the release fails (a Windows file still held)', async () => {
		vi.useFakeTimers();
		const release = vi
			.fn<() => Promise<void>>()
			.mockRejectedValueOnce(new Error('EBUSY'))
			.mockResolvedValue(undefined);
		const workspaces = await allocated(release);

		const done = workspaces.releaseWithRetry('abcd1234');
		await vi.advanceTimersByTimeAsync(1_900);
		expect(release).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(200);
		await done;

		expect(release).toHaveBeenCalledTimes(2);
		expect(writeExecution).not.toHaveBeenCalledWith('abcd1234', expect.anything(), 'error');
	});

	it('reports a release that failed twice, naming the workspace and how to remove it, and still resolves', async () => {
		vi.useFakeTimers();
		const release = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('EBUSY'));
		const workspaces = await allocated(release);
		const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

		try {
			const done = workspaces.releaseWithRetry('abcd1234');
			await vi.advanceTimersByTimeAsync(2_500);
			await done;
		} finally {
			stderr.mockRestore();
		}

		expect(release).toHaveBeenCalledTimes(2);
		expect(writeExecution).toHaveBeenCalledWith(
			'abcd1234',
			expect.stringMatching(/task-1.*EBUSY.*(by hand|manually)/s),
			'error'
		);
	});

	it('does nothing for an execution that holds no workspace', async () => {
		const workspaces = new ExecutionWorkspaces({ writeExecution } as unknown as LogWriter);
		await expect(workspaces.releaseWithRetry('nobody')).resolves.toBeUndefined();
	});

	it('leaves release() as it was: one fire-and-forget attempt, no retry', async () => {
		const release = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('EBUSY'));
		const workspaces = await allocated(release);
		const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

		try {
			workspaces.release('abcd1234');
			await vi.waitFor(() => expect(stderr).toHaveBeenCalled());
		} finally {
			stderr.mockRestore();
		}

		expect(release).toHaveBeenCalledTimes(1);
	});
});
