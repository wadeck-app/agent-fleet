import { execFile } from 'node:child_process';

const COUNTED_IMAGES = ['bash.exe', 'conhost.exe', 'node.exe'] as const;
const TASKLIST_TIMEOUT_MS = 5000;

export type ProcessCountResult =
	{ ok: true; counts: Record<(typeof COUNTED_IMAGES)[number], number> } | { ok: false; error: string };

/** Returns `tasklist /FO CSV /NH` output; injectable for tests. */
export type TaskListRunner = () => Promise<string>;

const runTaskList: TaskListRunner = () =>
	new Promise((resolve, reject) => {
		// windowsHide: short-lived probe, not a user script; hiding it cannot affect script console inheritance
		execFile(
			'tasklist',
			['/FO', 'CSV', '/NH'],
			{ timeout: TASKLIST_TIMEOUT_MS, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
			(error, stdout) => (error ? reject(error) : resolve(stdout))
		);
	});

/**
 * Counts bash.exe / conhost.exe / node.exe processes via `tasklist` (read-only, 5s timeout).
 * Never throws: a failed probe is returned as `{ ok: false, error }` so callers can say so.
 */
export class WindowsProcessCounter {
	constructor(private readonly runner: TaskListRunner = runTaskList) {}

	async count(): Promise<ProcessCountResult> {
		try {
			const output = await this.runner();
			const counts = { 'bash.exe': 0, 'conhost.exe': 0, 'node.exe': 0 };
			for (const line of output.split(/\r?\n/)) {
				const image = /^"([^"]*)"/.exec(line)?.[1]?.toLowerCase();
				if (image && image in counts) counts[image as keyof typeof counts]++;
			}
			return { ok: true, counts };
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : String(error) };
		}
	}
}
