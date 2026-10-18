import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ExecutionRecord } from '../execution/ExecutionRecord.js';

/**
 * Loads every execution record of `executionsDir`, newest first.
 * A missing directory is an empty history; files that are not valid records are skipped.
 */
export function loadExecutions(executionsDir: string): ExecutionRecord[] {
	if (!fs.existsSync(executionsDir)) return [];
	const results: ExecutionRecord[] = [];
	for (const file of fs.readdirSync(executionsDir)) {
		if (!file.endsWith('.json')) continue;
		try {
			const raw = fs.readFileSync(path.join(executionsDir, file), 'utf8');
			const rec = JSON.parse(raw) as ExecutionRecord;
			if (rec.executionId) results.push(rec);
		} catch {
			// skip malformed
		}
	}
	results.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
	return results;
}
