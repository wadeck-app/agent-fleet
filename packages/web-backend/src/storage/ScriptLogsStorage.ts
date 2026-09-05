import { TraceChunkStorage } from 'orchestrator';
import { join } from 'node:path';
import { createLogger } from 'shared-common/logger';

import type { ScriptLogEntry } from '@app/shared/api/workspaceScripts.contract';

const log = createLogger('ScriptLogsStorage');

/
  ===========================================================================================
  SCRIPT LOGS STORAGE
  ===========================================================================================
 
  Extends TraceChunkStorage to store script execution logs in chunks.
  Uses the same -entry chunk pattern for efficient pagination.
 
  Storage structure:
  ./data/workspace-scripts/{scriptId}/logs/
   metadata.json          - Total entries, chunks metadata
   chunk-.json           - First  log entries
   chunk-.json           - Next  log entries
   ...
 
  Features:
  - Chunk-based storage ( entries per chunk)
  - Efficient pagination support
  - Real-time incremental writes
  - Cross-platform file handling
 
  ===========================================================================================
 /
export class ScriptLogsStorage extends TraceChunkStorage {
	constructor(baseDir: string = './data/workspace-scripts') {
		super(baseDir);
	}

	/
	  Write log entries incrementally (append new entries)
	  @param scriptId - Script ID
	  @param logEntries - New log entries to append
	 /
	async writeLogsIncremental(scriptId: string, logEntries: ScriptLogEntry[]): Promise<void> {
		if (logEntries.length === ) {
			return;
		}

		log.debug(`[ScriptLogsStorage] Writing ${logEntries.length} log entries for script ${scriptId}`);

		// Convert ScriptLogEntry[] to trace format expected by TraceChunkStorage
		const trace = {
			steps: logEntries,
		};

		await this.writeTraceIncremental(scriptId, trace);
	}

	/
	  Write complete log entries (overwrite)
	  @param scriptId - Script ID
	  @param logEntries - All log entries
	 /
	async writeLogsFull(scriptId: string, logEntries: ScriptLogEntry[]): Promise<void> {
		log.debug(`[ScriptLogsStorage] Writing full logs (${logEntries.length} entries) for script ${scriptId}`);

		const trace = {
			steps: logEntries,
		};

		await this.writeTraceFull(scriptId, trace);
	}

	/
	  Read logs with pagination, filtering, and search
	  @param scriptId - Script ID
	  @param cursor - Start index (-based)
	  @param limit - Number of entries to read
	  @param level - Optional level filter (stdout, stderr, info, error)
	  @param search - Optional search query
	  @returns Paginated logs with next cursor
	 /
	async readLogsPaginated(
		scriptId: string,
		cursor: number = ,
		limit: number = ,
		level?: 'stdout' | 'stderr' | 'info' | 'error',
		search?: string
	): Promise<{ logs: ScriptLogEntry[]; nextCursor: number | null; total: number }> {
		// Read from parent class
		const result = await super.readLogsPaginated(scriptId, cursor, limit);

		let logs = result.logs as ScriptLogEntry[];

		// Apply level filter if specified
		if (level) {
			logs = logs.filter(entry => entry.level === level);
		}

		// Apply search filter if specified
		if (search) {
			const searchLower = search.toLowerCase();
			logs = logs.filter(entry => entry.message.toLowerCase().includes(searchLower));
		}

		// Recalculate nextCursor based on filtered results
		const nextCursor = logs.length === limit && result.nextCursor !== null ? result.nextCursor : null;

		return {
			logs,
			nextCursor,
			total: result.total,
		};
	}

	/
	  Delete all logs for a script
	  @param scriptId - Script ID
	 /
	async deleteLogs(scriptId: string): Promise<void> {
		log.debug(`[ScriptLogsStorage] Deleting logs for script ${scriptId}`);
		await this.deleteTrace(scriptId);
	}

	/
	  Check if logs exist for a script
	  @param scriptId - Script ID
	  @returns True if logs exist
	 /
	async hasLogs(scriptId: string): Promise<boolean> {
		const metadata = await this.loadMetadata(scriptId);
		return metadata !== null && metadata.totalEntries > ;
	}

	/
	  Get total log count for a script
	  @param scriptId - Script ID
	  @returns Total number of log entries
	 /
	async getTotalLogCount(scriptId: string): Promise<number> {
		const metadata = await this.loadMetadata(scriptId);
		return metadata?.totalEntries || ;
	}
}
