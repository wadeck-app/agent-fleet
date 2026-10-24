import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from 'shared-common/logger';

const log = createLogger('TraceChunkStorage');

export interface ChunkMetadata {
	index: number;
	start: number;
	end: number;
	count: number;
}

export interface TraceMetadata {
	totalEntries: number;
	chunkSize: number;
	totalChunks: number;
	lastUpdated: string;
	chunks: ChunkMetadata[];
}

// Trace payload as received from a worker (opaque until persisted): only the step list is read here.
export interface TraceWithSteps {
	steps?: unknown[];
}

export interface TraceChunk<TEntry> {
	chunkIndex: number;
	entries: TEntry[];
}

/**
 * Manages trace storage in chunks for efficient pagination
 * Chunks are stored as separate files to allow efficient partial reads
 */
/**
 * Entries are typed by `TEntry`. The default stays `any` only because web-backend's ScriptLogsStorage extends this class
 * without a type argument while overriding `readLogsPaginated` with another entry type, and TasksService reads task
 * trace steps as its own interface. Both can name their entry type explicitly once web-backend is migrated.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above: default kept for web-backend subclasses
export class TraceChunkStorage<TEntry = any> {
	private readonly CHUNK_SIZE = 500; // 500 log entries per chunk
	private readonly baseDir: string;

	constructor(baseDir: string = './data/tasks') {
		this.baseDir = baseDir;
	}

	/**
	 * Get trace directory for a task
	 */
	private getTraceDir(taskId: string): string {
		return join(this.baseDir, taskId, 'trace');
	}

	/**
	 * Get chunk file path
	 */
	private getChunkPath(taskId: string, chunkIndex: number): string {
		return join(this.getTraceDir(taskId), `chunk-${chunkIndex}.json`);
	}

	/**
	 * Get metadata file path
	 */
	private getMetadataPath(taskId: string): string {
		return join(this.getTraceDir(taskId), 'metadata.json');
	}

	/**
	 * The entries are produced by workers (flow-engine StepTrace for task traces): they are persisted without re-validation.
	 */
	private stepsOf(trace: TraceWithSteps): TEntry[] {
		return (trace.steps || []) as TEntry[];
	}

	/**
	 * Write trace incrementally (called by handleTaskTraceUpdate)
	 * Appends new entries to chunks
	 */
	async writeTraceIncremental(taskId: string, trace: TraceWithSteps): Promise<void> {
		const traceDir = this.getTraceDir(taskId);
		await fs.mkdir(traceDir, { recursive: true });

		const steps = this.stepsOf(trace);

		// Load existing metadata or create new
		const metadata = await this.loadMetadata(taskId);

		// Determine which entries are new
		const existingCount = metadata?.totalEntries || 0;
		const newSteps = steps.slice(existingCount);

		if (newSteps.length === 0) {
			// No new steps -- but existing steps may have been updated (e.g. liveLogEntries growing)
			// Check if the last step has changed and needs to be rewritten
			if (steps.length > 0) {
				await this.updateLastStepIfChanged(taskId, steps);
			}
			return;
		}

		// Calculate chunks for new steps
		const startIndex = existingCount;
		let currentChunkIndex = Math.floor(startIndex / this.CHUNK_SIZE);
		let currentChunkEntries: TEntry[] = [];

		// Load partial chunk if exists
		if (existingCount % this.CHUNK_SIZE !== 0) {
			const existingChunk = await this.loadChunk(taskId, currentChunkIndex);
			currentChunkEntries = existingChunk?.entries || [];
		}

		for (let i = 0; i < newSteps.length; i++) {
			currentChunkEntries.push(newSteps[i]);

			// Chunk is full or last entry
			if (currentChunkEntries.length === this.CHUNK_SIZE || i === newSteps.length - 1) {
				await this.writeChunk(taskId, currentChunkIndex, currentChunkEntries);

				currentChunkIndex++;
				currentChunkEntries = [];
			}
		}

		// Update metadata
		await this.updateMetadata(taskId, steps.length);
	}

	/**
	 * Write a complete trace (called by handleTaskCompleted)
	 */
	async writeTraceFull(taskId: string, trace: TraceWithSteps): Promise<void> {
		const traceDir = this.getTraceDir(taskId);
		await fs.mkdir(traceDir, { recursive: true });

		const steps = this.stepsOf(trace);

		// Write all chunks
		const totalChunks = Math.ceil(steps.length / this.CHUNK_SIZE);
		for (let i = 0; i < totalChunks; i++) {
			const start = i * this.CHUNK_SIZE;
			const end = Math.min(start + this.CHUNK_SIZE, steps.length);
			const chunkSteps = steps.slice(start, end);

			await this.writeChunk(taskId, i, chunkSteps);
		}

		// Write metadata
		await this.updateMetadata(taskId, steps.length);
	}

	/**
	 * Write a single chunk
	 */
	private async writeChunk(taskId: string, chunkIndex: number, steps: TEntry[]): Promise<void> {
		const chunkPath = this.getChunkPath(taskId, chunkIndex);
		const chunk: TraceChunk<TEntry> = {
			chunkIndex,
			entries: steps,
		};

		await fs.writeFile(chunkPath, JSON.stringify(chunk, null, 2), 'utf-8');
	}

	/**
	 * The fields that tell whether an in-progress step changed: number of live log entries and end time.
	 */
	private static progressMarker(entry: unknown): { liveCount: number; endTime: unknown } {
		if (typeof entry !== 'object' || entry === null) {
			return { liveCount: 0, endTime: undefined };
		}
		const liveLogEntries = 'liveLogEntries' in entry ? entry.liveLogEntries : undefined;
		return {
			liveCount: Array.isArray(liveLogEntries) ? liveLogEntries.length : 0,
			endTime: 'endTime' in entry ? entry.endTime : undefined,
		};
	}

	/**
	 * Update the last step in storage if its content has changed.
	 * This handles in-progress steps where liveLogEntries grow over time.
	 */
	private async updateLastStepIfChanged(taskId: string, steps: TEntry[]): Promise<void> {
		const lastStepIndex = steps.length - 1;
		const chunkIndex = Math.floor(lastStepIndex / this.CHUNK_SIZE);
		const positionInChunk = lastStepIndex % this.CHUNK_SIZE;

		const chunk = await this.loadChunk(taskId, chunkIndex);
		if (!chunk || !chunk.entries[positionInChunk]) {
			return;
		}

		const storedStep = chunk.entries[positionInChunk];
		const incomingStep = steps[lastStepIndex];

		// Quick comparison: check if liveLogEntries count differs
		const stored = TraceChunkStorage.progressMarker(storedStep);
		const incoming = TraceChunkStorage.progressMarker(incomingStep);

		// Also compare endTime to detect step completion
		const hasChanged = stored.liveCount !== incoming.liveCount || stored.endTime !== incoming.endTime;

		if (hasChanged) {
			chunk.entries[positionInChunk] = incomingStep;
			await this.writeChunk(taskId, chunkIndex, chunk.entries);
		}
	}

	/**
	 * Load a single chunk
	 */
	async loadChunk(taskId: string, chunkIndex: number): Promise<TraceChunk<TEntry> | null> {
		const chunkPath = this.getChunkPath(taskId, chunkIndex);

		try {
			const content = await fs.readFile(chunkPath, 'utf-8');
			return JSON.parse(content);
		} catch {
			return null;
		}
	}

	/**
	 * Load metadata
	 */
	async loadMetadata(taskId: string): Promise<TraceMetadata | null> {
		const metadataPath = this.getMetadataPath(taskId);

		try {
			const content = await fs.readFile(metadataPath, 'utf-8');
			return JSON.parse(content);
		} catch {
			return null;
		}
	}

	/**
	 * Update metadata
	 */
	private async updateMetadata(taskId: string, totalEntries: number): Promise<void> {
		const metadataPath = this.getMetadataPath(taskId);

		const totalChunks = Math.ceil(totalEntries / this.CHUNK_SIZE);
		const chunks: ChunkMetadata[] = [];

		for (let i = 0; i < totalChunks; i++) {
			const start = i * this.CHUNK_SIZE;
			const end = Math.min(start + this.CHUNK_SIZE, totalEntries) - 1;
			const count = end - start + 1;

			chunks.push({
				index: i,
				start,
				end,
				count,
			});
		}

		const metadata: TraceMetadata = {
			totalEntries,
			chunkSize: this.CHUNK_SIZE,
			totalChunks,
			lastUpdated: new Date().toISOString(),
			chunks,
		};

		await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
	}

	/**
	 * Read logs with pagination (optimized for chunk-aligned requests)
	 * @param taskId - Task ID
	 * @param cursor - Start index (0-based)
	 * @param limit - Number of entries to read
	 * @returns Paginated logs with next cursor
	 */
	async readLogsPaginated(
		taskId: string,
		cursor: number = 0,
		limit: number = 500
	): Promise<{ logs: TEntry[]; nextCursor: number | null; total: number }> {
		const metadata = await this.loadMetadata(taskId);

		if (!metadata) {
			return { logs: [], nextCursor: null, total: 0 };
		}

		const total = metadata.totalEntries;

		// OPTIMIZATION: If requesting exact chunk size at chunk boundary
		// We can return the chunk file directly without parsing
		if (limit === this.CHUNK_SIZE && cursor % this.CHUNK_SIZE === 0) {
			const chunkIndex = Math.floor(cursor / this.CHUNK_SIZE);
			const chunk = await this.loadChunk(taskId, chunkIndex);

			if (chunk) {
				const nextCursor = cursor + chunk.entries.length < total ? cursor + chunk.entries.length : null;

				log.debug(
					`[TraceChunkStorage] Optimized read: chunk ${chunkIndex} for task ${taskId} (${chunk.entries.length} entries)`
				);

				return {
					logs: chunk.entries,
					nextCursor,
					total,
				};
			}
		}

		// General case: may span multiple chunks
		const startChunk = Math.floor(cursor / this.CHUNK_SIZE);
		const endChunk = Math.floor((cursor + limit - 1) / this.CHUNK_SIZE);

		let logs: TEntry[] = [];

		for (let i = startChunk; i <= endChunk; i++) {
			const chunk = await this.loadChunk(taskId, i);
			if (chunk) {
				logs = logs.concat(chunk.entries);
			}
		}

		// Slice to exact range
		const startOffset = cursor % this.CHUNK_SIZE;
		const slicedLogs = logs.slice(startOffset, startOffset + limit);

		const nextCursor = cursor + slicedLogs.length < total ? cursor + slicedLogs.length : null;

		return {
			logs: slicedLogs,
			nextCursor,
			total,
		};
	}

	/**
	 * Delete all trace chunks for a task
	 */
	async deleteTrace(taskId: string): Promise<void> {
		const traceDir = this.getTraceDir(taskId);

		try {
			await fs.rm(traceDir, { recursive: true, force: true });
		} catch {
			// Ignore if doesn't exist
		}
	}

	// TODO: Add compression support (gzip) for chunks
	// This would reduce storage by ~70% but add ~10ms read latency
	// Implement when storage becomes a concern
}
