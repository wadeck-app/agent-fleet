import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PLUGIN_META_MARKER_FILE, PluginMetaOwnership } from './PluginMetaOwnership';

describe('PluginMetaOwnership', () => {
	let root: string;
	const ownership = new PluginMetaOwnership();

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-meta-own-'));
	});
	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('creates the .meta with outputs and a marker holding the execution id, and reports it as owned', () => {
		const metaDir = path.join(root, 'base', 'task-1.meta');

		expect(ownership.create(metaDir, 'abcd1234')).toBe(true);

		expect(fs.existsSync(path.join(metaDir, 'outputs'))).toBe(true);
		expect(fs.readFileSync(path.join(metaDir, PLUGIN_META_MARKER_FILE), 'utf8')).toBe('abcd1234');
	});

	it('does not claim a .meta directory that already existed (user data): no marker, content untouched', () => {
		const metaDir = path.join(root, 'task-1.meta');
		fs.mkdirSync(metaDir);
		fs.writeFileSync(path.join(metaDir, 'mine.txt'), 'keep');

		expect(ownership.create(metaDir, 'abcd1234')).toBe(false);

		expect(fs.readdirSync(metaDir).sort()).toEqual(['mine.txt', 'outputs']);
		expect(fs.readFileSync(path.join(metaDir, 'mine.txt'), 'utf8')).toBe('keep');
	});

	it('takes over a .meta that carries the marker of an earlier run (shared path): the latest run owns it', () => {
		const metaDir = path.join(root, 'shared.meta');
		expect(ownership.create(metaDir, 'aaaaaaaa')).toBe(true);

		expect(ownership.create(metaDir, 'bbbbbbbb')).toBe(true);

		expect(ownership.readMarker(metaDir)).toBe('bbbbbbbb');
	});

	it('does not take over a .meta whose marker file is not an execution id', () => {
		const metaDir = path.join(root, 'forged.meta');
		fs.mkdirSync(metaDir);
		fs.writeFileSync(path.join(metaDir, PLUGIN_META_MARKER_FILE), 'not an id!');

		expect(ownership.create(metaDir, 'abcd1234')).toBe(false);

		expect(ownership.readMarker(metaDir)).toBe('not an id!');
	});

	it('readMarker returns undefined when there is no marker', () => {
		fs.mkdirSync(path.join(root, 'x.meta'));
		expect(ownership.readMarker(path.join(root, 'x.meta'))).toBeUndefined();
	});
});
