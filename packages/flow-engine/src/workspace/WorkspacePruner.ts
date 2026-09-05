/**
 * WorkspacePruner -- disk-level workspace directory pruning.
 * Handles age-based and count-based removal of workspace directories.
 */
import * as fs from 'fs';
import * as path from 'path';

import type { Workspace } from '../types';

function removeWithMeta(dirPath: string): void {
	try {
		if (fs.existsSync(dirPath)) {
			fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
		}
	} catch (err) {
		process.stderr.write(`[WorkspacePruner] failed to remove ${dirPath}: ${String(err)}\n`);
	}
	const metaPath = dirPath + '.meta';
	try {
		if (fs.existsSync(metaPath)) {
			fs.rmSync(metaPath, { recursive: true, force: true });
		}
	} catch {
		// ignore meta cleanup failure
	}
}

/**
 * Prune workspace directories by age and count.
 * Skips any workspace that is currently active (provided via activeWorkspaces).
 */
export async function pruneWorkspaces(
	basePath: string,
	config: { retainDays: number; maxWorkspaces: number },
	activeWorkspaces: Map<string, Workspace>
): Promise<void> {
	if (!fs.existsSync(basePath)) return;

	const activePaths = new Set<string>();
	for (const ws of activeWorkspaces.values()) {
		activePaths.add(ws.path);
	}

	const entries = fs
		.readdirSync(basePath, { withFileTypes: true })
		.filter(e => e.isDirectory() && !e.name.endsWith('.meta'))
		.map(e => {
			const full = path.join(basePath, e.name);
			const stat = fs.statSync(full);
			return { full, mtime: stat.mtimeMs };
		})
		.filter(e => !activePaths.has(e.full));

	const cutoffMs = config.retainDays * 86400 * 1000;
	const now = Date.now();

	const surviving = entries.filter(e => {
		if (now - e.mtime > cutoffMs) {
			removeWithMeta(e.full);
			return false;
		}
		return true;
	});

	if (surviving.length > config.maxWorkspaces) {
		const sorted = surviving.sort((a, b) => a.mtime - b.mtime);
		for (const e of sorted.slice(0, sorted.length - config.maxWorkspaces)) {
			removeWithMeta(e.full);
		}
	}
}

/**
 * Static startup pruning (no in-memory state yet -- safe to prune anything).
 */
export function pruneWorkspaceDirAtStartup(basePath: string, retainDays: number, maxWorkspaces: number): void {
	if (!fs.existsSync(basePath)) return;

	let rawEntries: string[];
	try {
		rawEntries = fs.readdirSync(basePath);
	} catch (err) {
		process.stderr.write(`[WorkspacePruner] failed to read workspace dir: ${String(err)}\n`);
		return;
	}

	const dirs: Array<{ fullPath: string; mtimeMs: number }> = [];
	for (const name of rawEntries) {
		if (name.endsWith('.meta')) continue;
		const fullPath = path.join(basePath, name);
		try {
			const stat = fs.statSync(fullPath);
			if (!stat.isDirectory()) continue;
			dirs.push({ fullPath, mtimeMs: stat.mtimeMs });
		} catch {
			// skip unreadable entries
		}
	}

	dirs.sort((a, b) => a.mtimeMs - b.mtimeMs);
	const cutoffMs = Date.now() - retainDays * 24 * 60 * 60 * 1000;

	const remaining: typeof dirs = [];
	for (const d of dirs) {
		if (d.mtimeMs < cutoffMs) {
			removeWithMeta(d.fullPath);
		} else {
			remaining.push(d);
		}
	}

	const excess = remaining.length - maxWorkspaces;
	if (excess > 0) {
		for (const d of remaining.slice(0, excess)) {
			removeWithMeta(d.fullPath);
		}
	}
}
