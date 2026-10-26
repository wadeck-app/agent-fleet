/**
 * Characterization tests: pin the CURRENT behavior of WorkspacePruner (green on unchanged code).
 * They document, among others, that a `.meta` is only ever removed together with its sibling workspace
 * directory inside the pruned base path (an orphan `.meta` is never pruned).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pruneWorkspaceDirAtStartup } from './WorkspacePruner';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('WorkspacePruner (characterization)', () => {
	let root: string;
	let base: string;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-pruner-char-'));
		base = path.join(root, 'workspaces');
		fs.mkdirSync(base);
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	function makeWorkspace(dir: string, name: string, ageDays: number): { ws: string; meta: string } {
		const ws = path.join(dir, name);
		const meta = ws + '.meta';
		fs.mkdirSync(ws, { recursive: true });
		fs.mkdirSync(path.join(meta, 'outputs'), { recursive: true });
		fs.mkdirSync(path.join(meta, 'sessions', 'claude'), { recursive: true });
		fs.writeFileSync(path.join(meta, 'sessions', 'claude', 'session.jsonl'), 'x');
		const when = new Date(Date.now() - ageDays * DAY_MS);
		fs.utimesSync(ws, when, when);
		return { ws, meta };
	}

	it('removes an expired workspace together with its whole .meta (sessions included)', () => {
		const old = makeWorkspace(base, 'isolated-old', 40);

		pruneWorkspaceDirAtStartup(base, 30, 50);

		expect(fs.existsSync(old.ws)).toBe(false);
		expect(fs.existsSync(old.meta)).toBe(false);
	});

	it('keeps a workspace younger than retainDays with its .meta', () => {
		const fresh = makeWorkspace(base, 'isolated-fresh', 1);

		pruneWorkspaceDirAtStartup(base, 30, 50);

		expect(fs.existsSync(fresh.ws)).toBe(true);
		expect(fs.existsSync(path.join(fresh.meta, 'sessions', 'claude', 'session.jsonl'))).toBe(true);
	});

	it('removes the oldest workspaces (and their .meta) beyond maxWorkspaces', () => {
		const a = makeWorkspace(base, 'isolated-a', 3);
		const b = makeWorkspace(base, 'isolated-b', 2);
		const c = makeWorkspace(base, 'isolated-c', 1);

		pruneWorkspaceDirAtStartup(base, 30, 2);

		expect(fs.existsSync(a.ws)).toBe(false);
		expect(fs.existsSync(a.meta)).toBe(false);
		expect(fs.existsSync(b.ws)).toBe(true);
		expect(fs.existsSync(c.ws)).toBe(true);
	});

	it('never prunes an orphan .meta (no sibling workspace directory): current leak behavior', () => {
		const orphanMeta = path.join(base, 'isolated-gone.meta');
		fs.mkdirSync(path.join(orphanMeta, 'outputs'), { recursive: true });
		const when = new Date(Date.now() - 400 * DAY_MS);
		fs.utimesSync(orphanMeta, when, when);

		pruneWorkspaceDirAtStartup(base, 30, 50);

		expect(fs.existsSync(orphanMeta)).toBe(true);
	});

	it('does not count .meta directories against maxWorkspaces', () => {
		const a = makeWorkspace(base, 'isolated-a', 2);
		const b = makeWorkspace(base, 'isolated-b', 1);

		pruneWorkspaceDirAtStartup(base, 30, 2);

		expect(fs.existsSync(a.ws)).toBe(true);
		expect(fs.existsSync(b.ws)).toBe(true);
	});

	it('only touches the given base path: a sibling directory tree is left alone', () => {
		const other = path.join(root, 'elsewhere');
		fs.mkdirSync(other);
		const foreign = makeWorkspace(other, 'plugin-ws', 400);

		pruneWorkspaceDirAtStartup(base, 30, 50);

		expect(fs.existsSync(foreign.ws)).toBe(true);
		expect(fs.existsSync(foreign.meta)).toBe(true);
	});

	it('does nothing when the base path does not exist', () => {
		expect(() => pruneWorkspaceDirAtStartup(path.join(root, 'missing'), 30, 50)).not.toThrow();
	});
});
