import type { ScriptLogEntry } from '@shared/api/workspaceScripts.contract';

/**
 * Efficient log buffer that handles:
 * - Deduplication by ID
 * - Insertion at correct position by timestamp (server-side)
 * - Out-of-order arrivals
 *
 * Optimized for insertion rather than full re-sort
 *
 * Adapted from LogBuffer for script process logs
 */
export class ScriptLogBuffer {
	private logs: ScriptLogEntry[] = [];
	private logIdSet: Set<string> = new Set();

	constructor(initialLogs: ScriptLogEntry[] = []) {
		this.logs = [...initialLogs].sort((a, b) => a.timestamp - b.timestamp);
		this.logIdSet = new Set(this.logs.map(l => l.id));
	}

	/**
	 * Add new logs to buffer, handling deduplication and insertion
	 * @returns true if logs were added, false if all were duplicates
	 */
	addLogs(newLogs: ScriptLogEntry[]): boolean {
		// Filter duplicates against existing logs AND within the batch itself
		const seenInBatch = new Set<string>();
		const uniqueNewLogs = newLogs.filter(log => {
			if (this.logIdSet.has(log.id) || seenInBatch.has(log.id)) {
				return false;
			}
			seenInBatch.add(log.id);
			return true;
		});

		if (uniqueNewLogs.length === 0) {
			return false;
		}

		// Add IDs to set
		uniqueNewLogs.forEach(log => this.logIdSet.add(log.id));

		// Optimization: if all new logs are after the last existing log, just append
		if (
			this.logs.length === 0 ||
			uniqueNewLogs.every(log => log.timestamp >= this.logs[this.logs.length - 1].timestamp)
		) {
			// Sort new logs among themselves first
			uniqueNewLogs.sort((a, b) => a.timestamp - b.timestamp);
			this.logs.push(...uniqueNewLogs);
			return true;
		}

		// Otherwise, insert each log at the correct position using binary search
		for (const log of uniqueNewLogs) {
			const insertIndex = this.findInsertIndex(log.timestamp);
			this.logs.splice(insertIndex, 0, log);
		}

		return true;
	}

	/**
	 * Binary search to find insertion index for a given timestamp
	 */
	private findInsertIndex(timestamp: number): number {
		let left = 0;
		let right = this.logs.length;

		while (left < right) {
			const mid = Math.floor((left + right) / 2);
			if (this.logs[mid].timestamp < timestamp) {
				left = mid + 1;
			} else {
				right = mid;
			}
		}

		return left;
	}

	/**
	 * Get all logs in timestamp order
	 */
	getLogs(): ScriptLogEntry[] {
		return [...this.logs];
	}

	/**
	 * Get logs count
	 */
	getCount(): number {
		return this.logs.length;
	}

	/**
	 * Clear all logs
	 */
	clear(): void {
		this.logs = [];
		this.logIdSet.clear();
	}

	/**
	 * Check if buffer has a log with given ID
	 */
	has(id: string): boolean {
		return this.logIdSet.has(id);
	}

	/**
	 * Get the latest (max) timestamp in buffer
	 */
	getLatestTimestamp(): number | null {
		if (this.logs.length === 0) return null;
		return this.logs[this.logs.length - 1].timestamp;
	}
}
