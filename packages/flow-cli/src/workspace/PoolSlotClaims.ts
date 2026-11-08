import * as fs from 'node:fs';
import * as path from 'node:path';

/** Who claims a slot. */
export interface ClaimOwner {
	executionId: string;
	flowId: string;
	/** Identifies this daemon process (not only its pid, which the OS may hand to another process later). */
	daemonId: string;
	pid: number;
}

/** What `claim.json` holds. */
export interface ClaimRecord extends ClaimOwner {
	claimedAt: string;
}

/** A claim that was taken over because its holder is gone. */
export interface RecoveredClaim {
	/** Undefined when the claim folder never got its record (the claimer crashed between mkdir and write). */
	executionId: string | undefined;
	pid: number | undefined;
	reason: string;
}

export type ClaimResult =
	{ claimed: true; recovered?: RecoveredClaim } | { claimed: false; holder: ClaimRecord | undefined };

export type SlotInspection =
	| { state: 'free' }
	| { state: 'held'; holder: ClaimRecord | undefined }
	| { state: 'stale'; recovery: RecoveredClaim };

export interface PoolSlotClaimsOptions {
	daemonId: string;
	ownPid: number;
	isProcessAlive: (pid: number) => boolean;
	/** True when this process runs the execution (any pool of it), so its claim is live. */
	isLocalExecution: (executionId: string) => boolean;
	now: () => number;
	/** An empty or unreadable claim younger than this is taken to be in the middle of being written. */
	emptyClaimGraceMs: number;
}

const POOL_DIR = '.flow-pool';
const CLAIM_SUFFIX = '.claim';
const RECORD_FILE = 'claim.json';

/**
 * Claims on the slots of a pool, kept on disk so that another daemon or a restarted one sees them.
 *
 * A claim is a folder `<slot's parent>/.flow-pool/<slot name>.claim` created with a non-recursive `mkdir`, which is
 * atomic and fails with EEXIST when somebody else holds it, then a `claim.json` inside. A claim whose holder is gone is
 * taken over by renaming its folder aside (one winner), never by guessing: see {@link staleness}.
 */
export class PoolSlotClaims {
	constructor(private readonly options: PoolSlotClaimsOptions) {}

	tryClaim(slotPath: string, owner: ClaimOwner): ClaimResult {
		const claimPath = this.claimPathOf(slotPath);
		fs.mkdirSync(path.dirname(claimPath), { recursive: true });
		let recovered: RecoveredClaim | undefined;
		for (let attempt = 0; attempt < 2; attempt++) {
			let created = false;
			try {
				fs.mkdirSync(claimPath);
				created = true;
				this.write(claimPath, owner);
				return recovered === undefined ? { claimed: true } : { claimed: true, recovered };
			} catch (error) {
				if (created) {
					// The folder is ours but its record could not be written: do not leave a claim nobody can read.
					fs.rmSync(claimPath, { recursive: true, force: true });
					throw error;
				}
				if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
					throw error;
				}
			}
			const inspection = this.inspectClaim(claimPath);
			if (inspection.state === 'stale' && this.takeAside(claimPath)) {
				recovered = inspection.recovery;
				continue;
			}
			return { claimed: false, holder: inspection.state === 'held' ? inspection.holder : undefined };
		}
		return { claimed: false, holder: this.readRecord(claimPath) };
	}

	/** Gives the slot back. Idempotent; never removes the claim of somebody else. */
	release(slotPath: string, executionId: string): void {
		const claimPath = this.claimPathOf(slotPath);
		const record = this.readRecord(claimPath);
		if (record === undefined || record.executionId !== executionId) {
			return;
		}
		fs.rmSync(claimPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
	}

	inspect(slotPath: string): SlotInspection {
		return this.inspectClaim(this.claimPathOf(slotPath));
	}

	private inspectClaim(claimPath: string): SlotInspection {
		if (!fs.existsSync(claimPath)) {
			return { state: 'free' };
		}
		const record = this.readRecord(claimPath);
		if (record === undefined) {
			return this.unreadable(claimPath);
		}
		const recovery = this.staleness(record);
		return recovery === undefined ? { state: 'held', holder: record } : { state: 'stale', recovery };
	}

	/** A claim with no usable record: the claimer is writing it (young) or died before it did (old). */
	private unreadable(claimPath: string): SlotInspection {
		let ageMs: number;
		try {
			ageMs = this.options.now() - fs.statSync(claimPath).mtimeMs;
		} catch {
			// Gone in the meantime: free.
			return { state: 'free' };
		}
		if (ageMs <= this.options.emptyClaimGraceMs) {
			return { state: 'held', holder: undefined };
		}
		return {
			state: 'stale',
			recovery: {
				executionId: undefined,
				pid: undefined,
				reason: `the claim was empty or unreadable for more than ${String(Math.round(this.options.emptyClaimGraceMs / 1000))}s (the claimer stopped while writing it)`,
			},
		};
	}

	/** Why a claim is stale, or undefined when its holder may still be running. */
	private staleness(record: ClaimRecord): RecoveredClaim | undefined {
		const { daemonId, ownPid, isProcessAlive, isLocalExecution } = this.options;
		if (record.daemonId === daemonId) {
			return isLocalExecution(record.executionId)
				? undefined
				: {
						executionId: record.executionId,
						pid: record.pid,
						reason: `execution ${record.executionId} of this daemon is no longer running`,
					};
		}
		// Another daemon: its pid may have been given to this process since. The daemon id tells them apart.
		if (record.pid === ownPid) {
			return {
				executionId: record.executionId,
				pid: record.pid,
				reason: `the daemon that held it (pid ${String(record.pid)}) is gone; this process has that pid now`,
			};
		}
		if (!isProcessAlive(record.pid)) {
			return {
				executionId: record.executionId,
				pid: record.pid,
				reason: `its process (pid ${String(record.pid)}) is dead`,
			};
		}
		return undefined;
	}

	/** Renames the claim aside (atomic: one taker wins) and removes it. False when somebody else got there first. */
	private takeAside(claimPath: string): boolean {
		const aside = `${claimPath}.stale-${String(this.options.now())}-${Math.random().toString(36).slice(2, 8)}`;
		try {
			fs.renameSync(claimPath, aside);
		} catch {
			return false;
		}
		try {
			fs.rmSync(aside, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
		} catch (error) {
			process.stderr.write(
				`[pool] could not delete the stale claim "${aside}": ${String(error)}. Delete it by hand; it is no longer used.\n`
			);
		}
		return true;
	}

	private write(claimPath: string, owner: ClaimOwner): void {
		const record: ClaimRecord = { ...owner, claimedAt: new Date(this.options.now()).toISOString() };
		fs.writeFileSync(path.join(claimPath, RECORD_FILE), JSON.stringify(record));
	}

	private readRecord(claimPath: string): ClaimRecord | undefined {
		let parsed: unknown;
		try {
			parsed = JSON.parse(fs.readFileSync(path.join(claimPath, RECORD_FILE), 'utf8'));
		} catch {
			return undefined;
		}
		const record = parsed as Partial<ClaimRecord> | null;
		if (
			record === null ||
			typeof record !== 'object' ||
			typeof record.executionId !== 'string' ||
			typeof record.pid !== 'number' ||
			typeof record.daemonId !== 'string'
		) {
			return undefined;
		}
		return {
			executionId: record.executionId,
			flowId: typeof record.flowId === 'string' ? record.flowId : '(unknown flow)',
			pid: record.pid,
			daemonId: record.daemonId,
			claimedAt: typeof record.claimedAt === 'string' ? record.claimedAt : '(unknown)',
		};
	}

	private claimPathOf(slotPath: string): string {
		return path.join(path.dirname(slotPath), POOL_DIR, `${path.basename(slotPath)}${CLAIM_SUFFIX}`);
	}
}
