import type { WorkspaceHandle, WorkspaceProvider, WorkspaceRequest } from 'extension-points';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

import { isProcessAlive } from '../utils/isProcessAlive';
import { GitFolderProbe } from './GitFolderProbe';
import { PoolOptions } from './PoolOptions';
import { type ClaimOwner, type ClaimRecord, PoolSlotClaims, type RecoveredClaim } from './PoolSlotClaims';
import { runMetaDirFor } from './RunMetaDir';
import { WorkspaceWaitCancelledError } from './WorkspaceWaitCancelledError';

/** Everything the provider takes from its environment, so a test can replace each of them. */
export interface PoolDependencies {
	probe: GitFolderProbe;
	/** Identifies this daemon process in the claims it writes. */
	daemonId: string;
	ownPid: number;
	isProcessAlive: (pid: number) => boolean;
	/** Whether this process runs the execution (through any pool provider), so its claim is live. */
	isLocalExecution: (executionId: string) => boolean;
	onLocalExecutionStart: (executionId: string) => void;
	onLocalExecutionEnd: (executionId: string) => void;
	now: () => number;
	/** How often a waiting run looks at the claims again (a claim of another process may have gone away). */
	recheckMs: number;
	/** How often the reason of a wait is told again. */
	announceEveryMs: number;
	emptyClaimGraceMs: number;
}

/** One id per daemon process, written in every claim. */
const PROCESS_DAEMON_ID = randomUUID();
/** Executions of this process that hold or are claiming a slot, whichever pool provider serves them. */
const PROCESS_EXECUTIONS = new Set<string>();

const DEFAULT_DEPENDENCIES: PoolDependencies = {
	probe: new GitFolderProbe(),
	daemonId: PROCESS_DAEMON_ID,
	ownPid: process.pid,
	isProcessAlive,
	isLocalExecution: id => PROCESS_EXECUTIONS.has(id),
	onLocalExecutionStart: id => PROCESS_EXECUTIONS.add(id),
	onLocalExecutionEnd: id => PROCESS_EXECUTIONS.delete(id),
	now: () => Date.now(),
	recheckMs: 5_000,
	announceEveryMs: 60_000,
	emptyClaimGraceMs: 5_000,
};

interface Waiter {
	request: WorkspaceRequest;
	resolve: (handle: WorkspaceHandle) => void;
	reject: (error: Error) => void;
	cancelled: boolean;
	lastAnnouncedAt: number | undefined;
	removeAbortListener: () => void;
}

type AttemptOutcome =
	| { kind: 'claimed'; handle: WorkspaceHandle }
	| { kind: 'none-free'; holders: ClaimRecord[]; total: number; unknownHolders: number }
	| { kind: 'refused'; error: Error };

/**
 * `pool`: hands out one free folder of a set prepared in advance and takes it back when the run ends. The folders are
 * never created or deleted here, and are not synchronized (a first step of the flow does that).
 *
 * When every slot is claimed the run WAITS, first come first served, with no timeout, and says so through
 * `request.onWaiting` at once and every minute. It resumes when a slot is released in this process (at once) or a claim of
 * another process goes away or turns stale (at the next recheck). See {@link PoolSlotClaims} for how claims survive a crash.
 */
export class PoolWorkspaceProvider implements WorkspaceProvider {
	private readonly options: PoolOptions;
	private readonly deps: PoolDependencies;
	private readonly claims: PoolSlotClaims;
	private readonly queue: Waiter[] = [];
	private readonly held = new Map<string, { slot: string; executionId: string }>();
	private pumping = false;
	private pumpAgain = false;
	private timer: NodeJS.Timeout | undefined;

	constructor(options: unknown, dependencies: Partial<PoolDependencies> = {}) {
		this.options = PoolOptions.parse(options);
		this.deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
		this.claims = new PoolSlotClaims({
			daemonId: this.deps.daemonId,
			ownPid: this.deps.ownPid,
			isProcessAlive: this.deps.isProcessAlive,
			isLocalExecution: this.deps.isLocalExecution,
			now: this.deps.now,
			emptyClaimGraceMs: this.deps.emptyClaimGraceMs,
		});
	}

	allocate(request: WorkspaceRequest): Promise<WorkspaceHandle> {
		if (request.signal?.aborted) {
			return Promise.reject(new WorkspaceWaitCancelledError(request.executionId));
		}
		try {
			// Validates the folders now: a pool that does not exist must fail the run, not make it wait for ever.
			this.options.slotsFor(request.projectDir);
		} catch (error) {
			return Promise.reject(error as Error);
		}
		return new Promise<WorkspaceHandle>((resolve, reject) => {
			const waiter: Waiter = {
				request,
				resolve,
				reject,
				cancelled: false,
				lastAnnouncedAt: undefined,
				removeAbortListener: () => undefined,
			};
			if (request.signal !== undefined) {
				const onAbort = (): void => this.cancel(waiter);
				request.signal.addEventListener('abort', onAbort, { once: true });
				waiter.removeAbortListener = () => request.signal?.removeEventListener('abort', onAbort);
			}
			const aheadOfThisRun = this.queue.length;
			this.queue.push(waiter);
			if (aheadOfThisRun > 0) {
				this.announce(
					waiter,
					`${String(aheadOfThisRun)} run(s) are already waiting for this pool and are served first`
				);
			}
			void this.pump();
		});
	}

	async release(handle: WorkspaceHandle): Promise<void> {
		const entry = this.held.get(handle.id);
		if (entry === undefined) {
			return;
		}
		this.held.delete(handle.id);
		try {
			this.claims.release(entry.slot, entry.executionId);
		} finally {
			this.deps.onLocalExecutionEnd(entry.executionId);
		}
		void this.pump();
	}

	private cancel(waiter: Waiter): void {
		if (waiter.cancelled) {
			return;
		}
		waiter.cancelled = true;
		const index = this.queue.indexOf(waiter);
		if (index >= 0) {
			this.queue.splice(index, 1);
		}
		waiter.removeAbortListener();
		waiter.reject(new WorkspaceWaitCancelledError(waiter.request.executionId));
		this.syncTimer();
	}

	/** Serves the head of the queue while a slot is free. One pump at a time; a request during a pump runs it once more. */
	private async pump(): Promise<void> {
		if (this.pumping) {
			this.pumpAgain = true;
			return;
		}
		this.pumping = true;
		try {
			do {
				this.pumpAgain = false;
				while (this.queue.length > 0) {
					const head = this.queue[0]!;
					const outcome = await this.attempt(head);
					if (head.cancelled) {
						if (outcome.kind === 'claimed') {
							await this.release(outcome.handle);
						}
						continue;
					}
					if (outcome.kind === 'none-free') {
						this.announceWaiting(head, outcome);
						break;
					}
					this.queue.shift();
					head.removeAbortListener();
					if (outcome.kind === 'claimed') {
						head.resolve(outcome.handle);
					} else {
						head.reject(outcome.error);
					}
				}
			} while (this.pumpAgain);
		} finally {
			this.pumping = false;
			this.syncTimer();
		}
		this.announceDue();
	}

	/** Tries every slot in order for this run; the first one it claims (and finds acceptable) is its own. */
	private async attempt(waiter: Waiter): Promise<AttemptOutcome> {
		try {
			return await this.tryEverySlot(waiter);
		} catch (error) {
			// The pool changed under a waiting run (a slot folder was removed...): refuse that run with the reason, never leave it waiting.
			this.deps.onLocalExecutionEnd(waiter.request.executionId);
			return { kind: 'refused', error: error instanceof Error ? error : new Error(String(error)) };
		}
	}

	private async tryEverySlot(waiter: Waiter): Promise<AttemptOutcome> {
		const { request } = waiter;
		const slots = this.options.slotsFor(request.projectDir);
		const owner: ClaimOwner = {
			executionId: request.executionId,
			flowId: request.flow.id,
			daemonId: this.deps.daemonId,
			pid: this.deps.ownPid,
		};
		// Before claiming, so the claim is live from the first instant for every other claimer of this process.
		this.deps.onLocalExecutionStart(request.executionId);
		const holders: ClaimRecord[] = [];
		let unknownHolders = 0;
		const dirtySlots: string[] = [];
		for (const slot of slots) {
			const result = this.claims.tryClaim(slot, owner);
			if (!result.claimed) {
				if (result.holder === undefined) {
					unknownHolders++;
				} else {
					holders.push(result.holder);
				}
				continue;
			}
			let state: Awaited<ReturnType<GitFolderProbe['inspect']>>;
			try {
				state = await this.deps.probe.inspect(slot);
			} catch (error) {
				// The probe refused to run git in this slot: give the slot back, the run is refused with the probe's reason.
				this.claims.release(slot, request.executionId);
				throw error;
			}
			if (this.options.requireClean && state.isRepository && state.dirty) {
				this.claims.release(slot, request.executionId);
				dirtySlots.push(slot);
				continue;
			}
			return { kind: 'claimed', handle: this.handleFor(request, slot, state, result.recovered) };
		}
		this.deps.onLocalExecutionEnd(request.executionId);
		if (this.options.requireClean && dirtySlots.length === slots.length) {
			return {
				kind: 'refused',
				error: new Error(
					`Every slot of the pool is free but has uncommitted changes, and the pool option "requireClean" refuses a dirty slot: ${dirtySlots.map(slot => `"${slot}"`).join(', ')}. ` +
						'Clean or reset them (for example git reset --hard and removing untracked files in each slot), or remove "requireClean" and let the first step of the flow clean the slot it gets.'
				),
			};
		}
		return { kind: 'none-free', holders, total: slots.length, unknownHolders };
	}

	private handleFor(
		request: WorkspaceRequest,
		slot: string,
		state: { isRepository: boolean; dirty: boolean },
		recovered: RecoveredClaim | undefined
	): WorkspaceHandle {
		const slotName = path.basename(slot);
		const notes: string[] = [];
		if (recovered !== undefined) {
			notes.push(
				`Pool slot "${slotName}" was claimed by ${recovered.executionId === undefined ? 'a run that never finished claiming it' : `execution ${recovered.executionId}`}, which is gone (${recovered.reason}): the claim was taken over.`
			);
		}
		if (!state.isRepository) {
			notes.push(`Pool slot "${slot}" is not a git repository: nothing records what the steps change there.`);
		} else if (state.dirty) {
			notes.push(
				`Pool slot "${slot}" has uncommitted changes left by an earlier run: the steps start from that state. Clean it in a first step (or set the pool option "requireClean").`
			);
		}
		const handle: WorkspaceHandle = {
			path: slot,
			id: `pool:${slotName}:${request.executionId}`,
			// The slot is reused by later runs, so its outputs live in a folder of this execution alone.
			metaDir: runMetaDirFor(request.projectDir, request.executionId),
			...(notes.length === 0 ? {} : { notes }),
		};
		this.held.set(handle.id, { slot, executionId: request.executionId });
		return handle;
	}

	private announceWaiting(waiter: Waiter, outcome: Extract<AttemptOutcome, { kind: 'none-free' }>): void {
		if (
			waiter.lastAnnouncedAt !== undefined &&
			this.deps.now() - waiter.lastAnnouncedAt < this.deps.announceEveryMs
		) {
			return;
		}
		const claimedBy = outcome.holders
			.map(holder => `${holder.executionId} (flow ${holder.flowId}, since ${holder.claimedAt})`)
			.join(', ');
		const unknown =
			outcome.unknownHolders > 0 ? `${String(outcome.unknownHolders)} claim(s) still being written` : '';
		const holdersText = [claimedBy, unknown].filter(part => part !== '').join(', ');
		const claimed = outcome.holders.length + outcome.unknownHolders;
		this.announce(
			waiter,
			`${String(claimed)}/${String(outcome.total)} slots are claimed${holdersText === '' ? '' : ` by: ${holdersText}`}`
		);
	}

	/** Tells the waiting runs behind the head again once a minute has passed. */
	private announceDue(): void {
		for (const waiter of this.queue) {
			if (waiter.lastAnnouncedAt === undefined) {
				continue;
			}
			if (this.deps.now() - waiter.lastAnnouncedAt >= this.deps.announceEveryMs) {
				const position = this.queue.indexOf(waiter);
				this.announce(waiter, `${String(position)} run(s) are ahead of this one for this pool`);
			}
		}
	}

	private announce(waiter: Waiter, reason: string): void {
		waiter.lastAnnouncedAt = this.deps.now();
		waiter.request.onWaiting?.({
			message: `Waiting for a free workspace: ${reason}. This run starts when a slot is released (first come, first served, no timeout). Cancel it with: flow cancel ${waiter.request.executionId}`,
		});
	}

	private syncTimer(): void {
		if (this.queue.length > 0 && this.timer === undefined) {
			this.timer = setInterval(() => void this.pump(), this.deps.recheckMs);
			this.timer.unref();
		} else if (this.queue.length === 0 && this.timer !== undefined) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}
}
