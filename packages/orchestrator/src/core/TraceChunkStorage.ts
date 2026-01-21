import { promises as fs } from 'fs';
import { join } from 'path';
import { logger } from 'shared-common/logger';

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

export interface TraceChunk {
	chunkIndex: number;
	entries: any[]; // StepTrace from flow-engine
}

/**
 * Manages trace storage in chunks for efficient pagination
 * Chunks are stored as separate files to allow efficient partial reads
 */
export class TraceChunkStorage {
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
	 * Write trace incrementally (called by handleTaskTraceUpdate)
	 * Appends new entries to chunks
	 */
	async writeTraceIncremental(taskId: string, trace: any): Promise<void> {
		const traceDir = this.getTraceDir(taskId);
		await fs.mkdir(traceDir, { recursive: true });

		const steps = trace.steps || [];

		// Load existing metadata or create new
		const metadata = await this.loadMetadata(taskId);

		// Determine which entries are new
		const existingCount = metadata?.totalEntries || 0;
		const newSteps = steps.slice(existingCount);

		if (newSteps.length === 0) {
			return; // No new entries
		}

		// Calculate chunks for new steps
		const startIndex = existingCount;
		let currentChunkIndex = Math.floor(startIndex / this.CHUNK_SIZE);
		let currentChunkEntries: any[] = [];

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
	async writeTraceFull(taskId: string, trace: any): Promise<void> {
		const traceDir = this.getTraceDir(taskId);
		await fs.mkdir(traceDir, { recursive: true });

		const steps = trace.steps || [];

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
	private async writeChunk(taskId: string, chunkIndex: number, steps: any[]): Promise<void> {
		const chunkPath = this.getChunkPath(taskId, chunkIndex);
		const chunk: TraceChunk = {
			chunkIndex,
			entries: steps,
		};

		await fs.writeFile(chunkPath, JSON.stringify(chunk, null, 2), 'utf-8');
	}

	/**
	 * Load a single chunk
	 */
	async loadChunk(taskId: string, chunkIndex: number): Promise<TraceChunk | null> {
		const chunkPath = this.getChunkPath(taskId, chunkIndex);

		try {
			const content = await fs.readFile(chunkPath, 'utf-8');
			return JSON.parse(content);
		} catch (error) {
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
		} catch (error) {
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
	): Promise<{ logs: any[]; nextCursor: number | null; total: number }> {
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

				logger.debug(
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

		let logs: any[] = [];

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
		} catch (error) {
			// Ignore if doesn't exist
		}
	}

	// TODO: Add compression support (gzip) for chunks
	// This would reduce storage by ~70% but add ~10ms read latency
	// Implement when storage becomes a concern
}
