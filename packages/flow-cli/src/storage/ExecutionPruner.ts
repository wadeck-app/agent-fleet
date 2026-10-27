import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ExecutionState } from '../ipc/Protocol';
import { TEMP_FILE_INFIX } from './AtomicRecordWriter';
import { type PluginMetaCandidate, PluginMetaCleaner } from './PluginMetaCleaner';

/** A leftover temporary file older than this belongs to a writer that died. */
const STALE_TEMP_FILE_MS = 60 * 60 * 1000;

/**
 * Deletes execution records older than the retention period, and unfinished-write files left by dead writers.
 * Also deletes the plugin workspace `.meta` a deleted record names (age rule only; see PluginMetaCleaner).
 */
export class ExecutionPruner {
	constructor(
		private readonly executionsDir: string,
		private readonly retainDays: number,
		// `.meta` directories of executions running now: never deleted.
		private readonly activePluginMetaDirs: () => readonly string[] = () => [],
		private readonly metaCleaner: PluginMetaCleaner = new PluginMetaCleaner()
	) {}

	prune(): void {
		const run = this.start();
		if (run !== undefined) {
			for (const file of run.files) {
				run.handle(file);
			}
			run.finish();
		}
	}

	/**
	 * Same rules as prune(), but reads at most `chunkSize` records at a time and yields the event loop in between,
	 * so a daemon with a long history keeps answering while it prunes. Never rejects on a record problem.
	 */
	async pruneInBackground(
		chunkSize = 50,
		yieldToEventLoop: () => Promise<void> = () => new Promise<void>(resolve => setImmediate(resolve))
	): Promise<void> {
		const run = this.start();
		if (run === undefined) {
			return;
		}
		for (let index = 0; index < run.files.length; index += chunkSize) {
			if (index > 0) {
				await yieldToEventLoop();
			}
			for (const file of run.files.slice(index, index + chunkSize)) {
				run.handle(file);
			}
		}
		run.finish();
	}

	/** Lists the directory and removes stale temporary files; undefined when there is nothing to examine. */
	private start(): { files: string[]; handle: (file: string) => void; finish: () => void } | undefined {
		let rawFiles: string[];
		try {
			rawFiles = fs.readdirSync(this.executionsDir);
		} catch (err) {
			process.stderr.write(`[ExecutionStore] failed to read executions dir for pruning: ${String(err)}\n`);
			return undefined;
		}
		this.removeStaleTemporaryFiles(rawFiles);
		const files = rawFiles.filter(f => f.endsWith('.json'));
		if (files.length === 0) {
			return undefined;
		}
		const cutoffMs = Date.now() - this.retainDays * 24 * 60 * 60 * 1000;
		const expiredMeta: PluginMetaCandidate[] = [];
		const liveMeta: string[] = [];
		const handle = (file: string): void => {
			const filePath = path.join(this.executionsDir, file);
			try {
				const content = fs.readFileSync(filePath, 'utf8');
				const state = JSON.parse(content) as ExecutionState;
				const timestamp = state.completedAt ?? state.startedAt;
				const ageMs = new Date(timestamp).getTime();
				if (ageMs < cutoffMs) {
					fs.unlinkSync(filePath);
					if (state.pluginMetaDir !== undefined) {
						expiredMeta.push({ executionId: state.executionId, pluginMetaDir: state.pluginMetaDir });
					}
				} else if (state.pluginMetaDir !== undefined) {
					liveMeta.push(state.pluginMetaDir);
				}
			} catch {
				// fallback: delete if unreadable and old by mtime
				try {
					const stat = fs.statSync(filePath);
					if (stat.mtimeMs < cutoffMs) {
						fs.unlinkSync(filePath);
					}
				} catch {
					/* ignore */
				}
			}
		};
		// Never throws: a failure warns, and the records have all been handled already.
		const finish = (): void => {
			this.metaCleaner.clean(expiredMeta, liveMeta, this.activePluginMetaDirs());
		};
		return { files, handle, finish };
	}

	/** Deletes unfinished-write files left by a writer that died; a recent one may still be in use. */
	private removeStaleTemporaryFiles(names: string[]): void {
		for (const name of names.filter(n => n.includes(TEMP_FILE_INFIX))) {
			const filePath = path.join(this.executionsDir, name);
			try {
				if (Date.now() - fs.statSync(filePath).mtimeMs > STALE_TEMP_FILE_MS) {
					fs.unlinkSync(filePath);
				}
			} catch (err) {
				process.stderr.write(`[ExecutionStore] could not clean leftover ${filePath}: ${String(err)}\n`);
			}
		}
	}
}
