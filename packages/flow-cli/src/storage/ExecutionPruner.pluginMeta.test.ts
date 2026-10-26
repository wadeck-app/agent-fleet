import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExecutionPruner } from './ExecutionPruner';
import { PLUGIN_META_MARKER_FILE } from './PluginMetaOwnership';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('ExecutionPruner plugin workspace .meta', () => {
	let root: string;
	let executionsDir: string;
	let stderr: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-pruner-meta-'));
		executionsDir = path.join(root, 'executions');
		fs.mkdirSync(executionsDir);
		stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	});
	afterEach(() => {
		stderr.mockRestore();
		fs.rmSync(root, { recursive: true, force: true });
	});

	function writeRecord(executionId: string, ageDays: number, extra: Record<string, unknown> = {}): void {
		const when = new Date(Date.now() - ageDays * DAY_MS).toISOString();
		const state = {
			executionId,
			flowFile: 'f.yml',
			flowId: 'f',
			status: 'completed',
			currentSteps: [],
			startedAt: when,
			completedAt: when,
			steps: {},
			...extra,
		};
		fs.writeFileSync(path.join(executionsDir, `${executionId}.json`), JSON.stringify(state));
	}

	function makeMeta(name: string, owner: string): string {
		const metaDir = path.join(root, name);
		fs.mkdirSync(path.join(metaDir, 'sessions'), { recursive: true });
		fs.writeFileSync(path.join(metaDir, PLUGIN_META_MARKER_FILE), owner);
		return metaDir;
	}

	const recordExists = (id: string): boolean => fs.existsSync(path.join(executionsDir, `${id}.json`));

	it('deletes the .meta together with an expired record', () => {
		const metaDir = makeMeta('task-1.meta', 'aaaaaaaa');
		writeRecord('aaaaaaaa', 40, { pluginMetaDir: metaDir });

		new ExecutionPruner(executionsDir, 30).prune();

		expect(recordExists('aaaaaaaa')).toBe(false);
		expect(fs.existsSync(metaDir)).toBe(false);
	});

	it('keeps the .meta of a record inside the retention period', () => {
		const metaDir = makeMeta('task-1.meta', 'aaaaaaaa');
		writeRecord('aaaaaaaa', 5, { pluginMetaDir: metaDir });

		new ExecutionPruner(executionsDir, 30).prune();

		expect(recordExists('aaaaaaaa')).toBe(true);
		expect(fs.existsSync(metaDir)).toBe(true);
	});

	it('applies no count rule: many recent records keep all their .meta', () => {
		const dirs = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc'].map(id => {
			const metaDir = makeMeta(`${id}.meta`, id);
			writeRecord(id, 1, { pluginMetaDir: metaDir });
			return metaDir;
		});

		new ExecutionPruner(executionsDir, 30).prune();

		expect(dirs.every(d => fs.existsSync(d))).toBe(true);
	});

	it('tolerates old-format records without pluginMetaDir and leaves pre-existing .meta alone', () => {
		const preExisting = path.join(root, 'old-task.meta');
		fs.mkdirSync(preExisting);
		writeRecord('aaaaaaaa', 400);

		new ExecutionPruner(executionsDir, 30).prune();

		expect(recordExists('aaaaaaaa')).toBe(false);
		expect(fs.existsSync(preExisting)).toBe(true);
		expect(stderr).not.toHaveBeenCalled();
	});

	it('keeps a shared .meta (none provider) while a non-expired record references the same path', () => {
		const shared = makeMeta('cwd.meta', 'aaaaaaaa');
		writeRecord('aaaaaaaa', 40, { pluginMetaDir: shared });
		writeRecord('bbbbbbbb', 2, { pluginMetaDir: shared });

		new ExecutionPruner(executionsDir, 30).prune();

		expect(recordExists('aaaaaaaa')).toBe(false);
		expect(fs.existsSync(shared)).toBe(true);
	});

	it('keeps a .meta used by an active execution', () => {
		const metaDir = makeMeta('task-1.meta', 'aaaaaaaa');
		writeRecord('aaaaaaaa', 40, { pluginMetaDir: metaDir });

		new ExecutionPruner(executionsDir, 30, () => [metaDir]).prune();

		expect(fs.existsSync(metaDir)).toBe(true);
	});

	it('keeps the .meta when the marker names another execution', () => {
		const metaDir = makeMeta('task-1.meta', 'zzzzzzzz');
		writeRecord('aaaaaaaa', 40, { pluginMetaDir: metaDir });

		new ExecutionPruner(executionsDir, 30).prune();

		expect(fs.existsSync(metaDir)).toBe(true);
	});

	it('never throws into the loop when a .meta cannot be removed: the other records are still pruned', () => {
		const user = path.join(root, 'project');
		fs.mkdirSync(user);
		writeRecord('aaaaaaaa', 40, { pluginMetaDir: user });
		writeRecord('bbbbbbbb', 40);

		expect(() => new ExecutionPruner(executionsDir, 30).prune()).not.toThrow();

		expect(recordExists('bbbbbbbb')).toBe(false);
		expect(fs.existsSync(user)).toBe(true);
		expect(stderr).toHaveBeenCalledWith(expect.stringContaining(user));
	});
});
