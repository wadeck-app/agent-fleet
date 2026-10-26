import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PluginMetaCleaner } from './PluginMetaCleaner';
import { PLUGIN_META_MARKER_FILE } from './PluginMetaOwnership';

describe('PluginMetaCleaner', () => {
	let root: string;
	let warn: Mock<(message: string) => void>;
	let cleaner: PluginMetaCleaner;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-meta-clean-'));
		warn = vi.fn<(message: string) => void>();
		cleaner = new PluginMetaCleaner(warn);
	});
	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	function makeMeta(name: string, markerContent: string | null = 'abcd1234'): string {
		const metaDir = path.join(root, name);
		fs.mkdirSync(path.join(metaDir, 'sessions'), { recursive: true });
		fs.writeFileSync(path.join(metaDir, 'sessions', 's.json'), '{}');
		if (markerContent !== null) {
			fs.writeFileSync(path.join(metaDir, PLUGIN_META_MARKER_FILE), markerContent);
		}
		return metaDir;
	}

	function cleanOne(metaDir: string, referenced: string[] = [], active: string[] = []): string | undefined {
		return cleaner.clean([{ executionId: 'abcd1234', pluginMetaDir: metaDir }], referenced, active)[0]?.result;
	}

	it('removes a .meta whose marker equals the record execution id, including sessions/', () => {
		const metaDir = makeMeta('task-1.meta');

		expect(cleanOne(metaDir)).toBe('removed');

		expect(fs.existsSync(metaDir)).toBe(false);
		expect(warn).not.toHaveBeenCalled();
	});

	it('keeps a .meta whose marker names another execution (marker mismatch), silently', () => {
		const metaDir = makeMeta('task-1.meta', 'zzzzzzzz');

		expect(cleanOne(metaDir)).toBe('kept-marker-mismatch');

		expect(fs.existsSync(metaDir)).toBe(true);
		expect(warn).not.toHaveBeenCalled();
	});

	it('keeps a user .meta without marker', () => {
		const metaDir = makeMeta('task-1.meta', null);

		expect(cleanOne(metaDir)).toBe('kept-marker-mismatch');

		expect(fs.existsSync(metaDir)).toBe(true);
	});

	it('keeps a .meta still referenced by a non-expired record (shared none-provider path)', () => {
		const metaDir = makeMeta('cwd.meta');

		expect(cleanOne(metaDir, [metaDir])).toBe('kept-referenced');

		expect(fs.existsSync(metaDir)).toBe(true);
	});

	it('compares paths by real path (another spelling of the same directory)', () => {
		const metaDir = makeMeta('cwd.meta');
		fs.mkdirSync(path.join(root, 'sub'));
		const otherSpelling = path.join(root, 'sub', '..', 'cwd.meta');

		expect(cleanOne(metaDir, [otherSpelling])).toBe('kept-referenced');
	});

	it('keeps a .meta used by an active execution', () => {
		const metaDir = makeMeta('cwd.meta');

		expect(cleanOne(metaDir, [], [metaDir])).toBe('kept-active');

		expect(fs.existsSync(metaDir)).toBe(true);
	});

	it('refuses a directory whose name does not end with .meta, with an actionable warning', () => {
		const dir = makeMeta('project');

		expect(cleanOne(dir)).toBe('refused');

		expect(fs.existsSync(dir)).toBe(true);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining(dir));
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('.meta'));
	});

	it('refuses when the path is a file, not a directory', () => {
		const file = path.join(root, 'x.meta');
		fs.writeFileSync(file, 'data');

		expect(cleanOne(file)).toBe('refused');

		expect(fs.existsSync(file)).toBe(true);
	});

	it('reports a missing .meta as already gone, without warning', () => {
		expect(cleanOne(path.join(root, 'nope.meta'))).toBe('already-gone');

		expect(warn).not.toHaveBeenCalled();
	});

	it('refuses a .meta that is itself a link to another directory and leaves the target untouched', () => {
		const target = path.join(root, 'precious');
		fs.mkdirSync(target);
		fs.writeFileSync(path.join(target, PLUGIN_META_MARKER_FILE), 'abcd1234');
		fs.writeFileSync(path.join(target, 'data.txt'), 'keep');
		const link = path.join(root, 'linked.meta');
		fs.symlinkSync(target, link, 'junction');

		expect(cleanOne(link)).toBe('refused');

		expect(fs.readFileSync(path.join(target, 'data.txt'), 'utf8')).toBe('keep');
		expect(warn).toHaveBeenCalledWith(expect.stringContaining(link));
	});

	describe('links inside the .meta', () => {
		it('proves rmSync unlinks a junction/symlink without following it: the target content survives', () => {
			const target = path.join(root, 'outside');
			fs.mkdirSync(target);
			fs.writeFileSync(path.join(target, 'data.txt'), 'keep');
			const dir = path.join(root, 'plain');
			fs.mkdirSync(dir);
			fs.symlinkSync(target, path.join(dir, 'link'), 'junction');

			fs.rmSync(dir, { recursive: true, force: true });

			expect(fs.existsSync(dir)).toBe(false);
			expect(fs.readFileSync(path.join(target, 'data.txt'), 'utf8')).toBe('keep');
		});

		it('removes the .meta and leaves the content a link inside it points to', () => {
			const target = path.join(root, 'outside');
			fs.mkdirSync(target);
			fs.writeFileSync(path.join(target, 'data.txt'), 'keep');
			const metaDir = makeMeta('task-1.meta');
			fs.symlinkSync(target, path.join(metaDir, 'sessions', 'link'), 'junction');

			expect(cleanOne(metaDir)).toBe('removed');

			expect(fs.existsSync(metaDir)).toBe(false);
			expect(fs.readFileSync(path.join(target, 'data.txt'), 'utf8')).toBe('keep');
		});
	});

	it('warns with path, cause and manual fix when removal fails, and does not throw', () => {
		const metaDir = makeMeta('task-1.meta');
		const failing = new PluginMetaCleaner(warn, () => {
			throw new Error('EBUSY: resource busy');
		});

		const outcomes = failing.clean([{ executionId: 'abcd1234', pluginMetaDir: metaDir }], [], []);

		expect(outcomes[0]?.result).toBe('failed');
		const message = String(warn.mock.calls[0]?.[0]);
		expect(message).toContain(metaDir);
		expect(message).toContain('EBUSY');
		expect(message).toContain('manually');
	});

	it('keeps going after a failure: the next candidate is still processed', () => {
		const first = makeMeta('a.meta');
		const second = makeMeta('b.meta');
		let calls = 0;
		const flaky = new PluginMetaCleaner(warn, target => {
			calls += 1;
			if (calls === 1) {
				throw new Error('EPERM');
			}
			fs.rmSync(target, { recursive: true, force: true });
		});

		const outcomes = flaky.clean(
			[
				{ executionId: 'abcd1234', pluginMetaDir: first },
				{ executionId: 'abcd1234', pluginMetaDir: second },
			],
			[],
			[]
		);

		expect(outcomes.map(o => o.result)).toEqual(['failed', 'removed']);
		expect(fs.existsSync(second)).toBe(false);
	});
});
