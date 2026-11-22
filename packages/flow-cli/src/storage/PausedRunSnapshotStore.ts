import { isExecutionId } from 'flow-core';
import type { SchedulerSnapshot } from 'flow-engine';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ExecutionMasks } from '../secrets/ExecutionMasks';
import { AtomicRecordWriter } from './AtomicRecordWriter';

/** Version written in every snapshot file; a file of another version is refused, never guessed at. */
export const PAUSED_SNAPSHOT_VERSION = 1;
/** Suffix of the snapshot file next to the record: never `.json`, so no record listing sees it. */
export const PAUSED_SNAPSHOT_SUFFIX = '.paused-snapshot';
/** Largest snapshot written. Over it the run is not persisted (and says so): nothing is ever cut. */
export const MAX_PAUSED_SNAPSHOT_BYTES = 32 * 1024 * 1024;

/** What a restarted daemon needs, beyond the record, to continue a paused run. Never holds a secret value. */
export interface PausedRunSnapshot {
	/** The run command as it was accepted (without `requestId`): project, inputs (secret REFERENCES), cwd. */
	run: Record<string, unknown>;
	scheduler: SchedulerSnapshot;
	/** Steps the scheduler handed out that sat in the dispatch queue (held back by the pause). */
	queued: string[];
	context: {
		stepOutputs: Record<string, Record<string, unknown>>;
		stepMeta: Record<string, unknown>;
		subStepErrors?: Record<string, string[]>;
		subSteps?: Record<string, { outputs: Record<string, unknown>; status: string }>;
		subStepFeedback?: string;
	};
	/** Steps registered (initial + injected), for the per-execution step limit. */
	stepCount: number;
	/** The handle the workspace provider gave (`WorkspaceHandle` without its notes). */
	workspace: { path: string; id: string; metaDir?: string; readOnly?: boolean };
}

interface SnapshotFile {
	version: number;
	executionId: string;
	writtenAt: string;
	payload: PausedRunSnapshot;
}

export type SnapshotRead =
	{ ok: true; snapshot: PausedRunSnapshot; writtenAt: string } | { ok: false; missing: boolean; reason: string };

/** The snapshot of one paused run: `<executionsDir>/<executionId>.paused-snapshot`, replaced atomically. */
export class PausedRunSnapshotStore {
	private readonly writer = new AtomicRecordWriter();

	constructor(
		private readonly executionsDir: string,
		private readonly masks: Pick<ExecutionMasks, 'maskDeep'>,
		private readonly maxBytes: number = MAX_PAUSED_SNAPSHOT_BYTES
	) {}

	fileOf(executionId: string): string {
		if (!isExecutionId(executionId)) {
			throw new Error(`Invalid executionId format: ${JSON.stringify(executionId)}`);
		}
		return path.join(this.executionsDir, `${executionId}${PAUSED_SNAPSHOT_SUFFIX}`);
	}

	/**
	 * Writes (replaces) the snapshot, secrets masked.
	 *
	 * @throws Error saying why when it cannot be written (too large, disk); the previous snapshot is then deleted, because an
	 *         older state restored in its place would run again what already ran.
	 */
	write(executionId: string, snapshot: PausedRunSnapshot): void {
		const file: SnapshotFile = {
			version: PAUSED_SNAPSHOT_VERSION,
			executionId,
			writtenAt: new Date().toISOString(),
			payload: this.masks.maskDeep(executionId, snapshot),
		};
		try {
			const content = JSON.stringify(file);
			const bytes = Buffer.byteLength(content, 'utf8');
			if (bytes > this.maxBytes) {
				throw new Error(
					`the snapshot of the run is ${(bytes / (1024 * 1024)).toFixed(1)} MiB, the limit is ${(this.maxBytes / (1024 * 1024)).toFixed(0)} MiB (step outputs are kept whole, never cut)`
				);
			}
			this.writer.replaceFile(this.fileOf(executionId), content);
		} catch (err) {
			this.remove(executionId);
			throw err;
		}
	}

	read(executionId: string): SnapshotRead {
		const file = this.fileOf(executionId);
		let content: string;
		try {
			content = fs.readFileSync(file, 'utf8');
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
				return { ok: false, missing: true, reason: `the restart snapshot ${file} does not exist` };
			}
			return { ok: false, missing: false, reason: `the restart snapshot ${file} cannot be read: ${String(err)}` };
		}
		let parsed: Partial<SnapshotFile> | null;
		try {
			parsed = JSON.parse(content) as Partial<SnapshotFile> | null;
		} catch (err) {
			return {
				ok: false,
				missing: false,
				reason: `the restart snapshot ${file} is not valid JSON (${String(err)})`,
			};
		}
		if (parsed === null || typeof parsed !== 'object') {
			return { ok: false, missing: false, reason: `the restart snapshot ${file} is not an object` };
		}
		if (parsed.version !== PAUSED_SNAPSHOT_VERSION) {
			return {
				ok: false,
				missing: false,
				reason: `the restart snapshot ${file} has version ${JSON.stringify(parsed.version)}, this daemon reads version ${String(PAUSED_SNAPSHOT_VERSION)} (written by another flow version)`,
			};
		}
		if (parsed.executionId !== executionId) {
			return {
				ok: false,
				missing: false,
				reason: `the restart snapshot ${file} belongs to execution ${JSON.stringify(parsed.executionId)}`,
			};
		}
		const problem = PausedRunSnapshotStore.shapeProblem(parsed.payload);
		if (problem !== undefined) {
			return { ok: false, missing: false, reason: `the restart snapshot ${file} is damaged: ${problem}` };
		}
		return { ok: true, snapshot: parsed.payload as PausedRunSnapshot, writtenAt: String(parsed.writtenAt) };
	}

	/** Deletes the snapshot; nothing when there is none. A deletion that fails is reported, never silent. */
	remove(executionId: string): void {
		const file = this.fileOf(executionId);
		try {
			fs.rmSync(file, { force: true });
		} catch (err) {
			process.stderr.write(
				`[ExecutionStore] cannot delete ${file}: ${String(err)}. Delete it by hand: the execution no longer uses it.\n`
			);
		}
	}

	/** Names the first top-level part of a payload that cannot be used, or undefined. The scheduler part is checked on restore. */
	private static shapeProblem(payload: unknown): string | undefined {
		if (typeof payload !== 'object' || payload === null) {
			return 'no payload';
		}
		const p = payload as Record<string, unknown>;
		const isObject = (v: unknown): boolean => typeof v === 'object' && v !== null && !Array.isArray(v);
		for (const key of ['run', 'scheduler', 'context', 'workspace']) {
			if (!isObject(p[key])) {
				return `"${key}" is missing or not an object`;
			}
		}
		if (!Array.isArray(p['queued']) || p['queued'].some(id => typeof id !== 'string')) {
			return '"queued" is not a list of step ids';
		}
		if (typeof p['stepCount'] !== 'number') {
			return '"stepCount" is not a number';
		}
		const workspace = p['workspace'] as Record<string, unknown>;
		if (typeof workspace['path'] !== 'string' || typeof workspace['id'] !== 'string') {
			return '"workspace" has no path and id';
		}
		return undefined;
	}
}
