// Test helper: fails a test file when a flow daemon / worker / CLI process it started is still alive after its teardown.
//
// Why: orphaned `flow.cjs` daemons and `worker.cjs` workers piled up on a developer machine (days old, holding ports
// 47825-47834) and nothing in the suite could notice a test, or a production change, that left one behind. A leak found
// here names the PIDs and is killed (by literal pid, only processes this test run provably started), so the machine does
// not accumulate them either.
//
// How: a file ARMS the guard (startTestDaemon and every test that spawns the bundle do). The vitest setup file
// (ProcessLeakSetup.ts) verifies in afterAll. A leak is a flow process that
//   - descends from the test process and was not already there when the guard was armed, or
//   - has a watched marker (the throwaway install/config directory of the test) in its command line, whoever its parent is
//     (a daemon started through wscript is detached from its starter, so ancestry alone misses it).
import { setTimeout as delay } from 'node:timers/promises';

import { isFlowProcess } from '../utils/FlowProcessReport';
import { type OsProcess, listOsProcesses } from '../utils/OsProcessTable';

export { type OsProcess, listOsProcesses, isFlowProcess };

export type ProcessLister = () => OsProcess[];

/** All processes below `rootPid`, at any depth. */
export function descendantsOf(rootPid: number, processes: readonly OsProcess[]): OsProcess[] {
	const found: OsProcess[] = [];
	const seen = new Set<number>([rootPid]);
	const queue = [rootPid];
	while (queue.length > 0) {
		const parent = queue.shift()!;
		for (const candidate of processes) {
			if (candidate.ppid === parent && !seen.has(candidate.pid)) {
				seen.add(candidate.pid);
				found.push(candidate);
				queue.push(candidate.pid);
			}
		}
	}
	return found;
}

export interface LeakGuardOptions {
	rootPid?: number;
	lister?: ProcessLister;
	/** How long a process gets to finish exiting after teardown before it counts as a leak. */
	graceMs?: number;
	pollMs?: number;
	/** Ends a leaked process. Defaults to a hard kill by pid. */
	kill?: (pid: number) => void;
}

export class ProcessLeakGuard {
	private readonly rootPid: number;
	private readonly lister: ProcessLister;
	private readonly graceMs: number;
	private readonly pollMs: number;
	private readonly kill: (pid: number) => void;
	private armed = false;
	private baseline = new Set<number>();
	private readonly markers = new Set<string>();

	constructor(options: LeakGuardOptions = {}) {
		this.rootPid = options.rootPid ?? process.pid;
		this.lister = options.lister ?? listOsProcesses;
		this.graceMs = options.graceMs ?? 10_000;
		this.pollMs = options.pollMs ?? 500;
		this.kill =
			options.kill ??
			((pid: number) => {
				try {
					process.kill(pid, 'SIGKILL');
				} catch {
					// Already gone between the scan and the kill: exactly what was wanted.
				}
			});
	}

	isArmed(): boolean {
		return this.armed;
	}

	/** Starts watching. Flow processes that already exist below the test process are not this file's and are ignored. */
	arm(): void {
		if (this.armed) {
			return;
		}
		this.armed = true;
		this.baseline = new Set(this.flowDescendants(this.lister()).map(p => p.pid));
	}

	/**
	 * Also treats any flow process whose command line contains `marker` as this file's, whatever its ancestry. The marker
	 * must be unique to the test (its temp directory): a shared path would blame another run's processes on this one.
	 */
	watch(marker: string): void {
		if (marker === '') {
			throw new Error('ProcessLeakGuard.watch() needs a non-empty marker; an empty one matches every process.');
		}
		this.arm();
		this.markers.add(marker);
	}

	private flowDescendants(processes: readonly OsProcess[]): OsProcess[] {
		return descendantsOf(this.rootPid, processes).filter(p => isFlowProcess(p.commandLine));
	}

	/** Flow processes alive right now that this file is responsible for. */
	findLeaks(processes: readonly OsProcess[] = this.lister()): OsProcess[] {
		const mine = new Map<number, OsProcess>();
		for (const p of this.flowDescendants(processes)) {
			if (!this.baseline.has(p.pid)) {
				mine.set(p.pid, p);
			}
		}
		for (const p of processes) {
			if (
				p.pid !== this.rootPid &&
				isFlowProcess(p.commandLine) &&
				[...this.markers].some(m => p.commandLine.includes(m))
			) {
				mine.set(p.pid, p);
			}
		}
		return [...mine.values()];
	}

	/**
	 * Waits for the file's flow processes to finish exiting, then fails if any is still alive. Leaked processes are killed
	 * before throwing, so one leak does not cascade into the next file and the machine is left clean.
	 *
	 * @throws naming every leaked pid, its parent and its command line.
	 */
	async verify(): Promise<void> {
		if (!this.armed) {
			return;
		}
		const deadline = Date.now() + this.graceMs;
		let leaks = this.findLeaks();
		while (leaks.length > 0 && Date.now() < deadline) {
			await delay(this.pollMs);
			leaks = this.findLeaks();
		}
		if (leaks.length === 0) {
			return;
		}
		for (const leak of leaks) {
			this.kill(leak.pid);
		}
		const lines = leaks.map(l => `  pid ${String(l.pid)} (parent ${String(l.ppid)}): ${l.commandLine}`).join('\n');
		throw new Error(
			`${String(leaks.length)} flow process(es) started by this test file were still alive ${String(this.graceMs)} ms after its teardown, and were killed now:\n${lines}\n` +
				'A daemon, worker or CLI that outlives its test is the orphan leak this guard exists for: find which stop path did not end the process.'
		);
	}
}

/** The guard of the current test file (vitest isolates modules per file). */
export const processLeakGuard = new ProcessLeakGuard();
