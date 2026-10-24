import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { removeTempDirectory } from '../testing/TempDirectory.js';
import { hashDefinition } from './DefinitionHash.js';
import { DefinitionSnapshotStore } from './DefinitionSnapshotStore.js';

describe('DefinitionSnapshotStore', () => {
	let dir: string;
	let store: DefinitionSnapshotStore;

	const save = (flowId: string, version: string, text: string) =>
		store.save({ flowId, version, hash: hashDefinition({ text }), text });

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshots-'));
		store = new DefinitionSnapshotStore(path.join(dir, 'definitions'));
	});
	afterEach(() => removeTempDirectory(dir));

	it('writes <flowId>/<version>-<hash12>.yml with the exact text', () => {
		const saved = save('f', '1.0.0', 'id: f\n# comment\n');
		expect(saved.created).toBe(true);
		expect(saved.ref).toMatch(/^f\/1\.0\.0-[0-9a-f]{12}\.yml$/);
		expect(store.read(saved.ref)).toBe('id: f\n# comment\n');
	});

	it('is idempotent: the same version and content is not written twice and keeps its first-seen date', () => {
		const first = save('f', '1.0.0', 'id: f\n');
		const file = path.join(dir, 'definitions', ...first.ref.split('/'));
		const old = new Date('2020-01-01T00:00:00.000Z');
		fs.utimesSync(file, old, old);
		const second = save('f', '1.0.0', 'id: f\n');
		expect(second).toEqual({ ref: first.ref, created: false });
		expect(fs.readdirSync(path.join(dir, 'definitions', 'f'))).toHaveLength(1);
		expect(store.list('f')[0]!.firstSeen).toBe(old.toISOString());
	});

	it('never rewrites an existing snapshot', () => {
		const saved = save('f', '1.0.0', 'id: f\n');
		const file = path.join(dir, 'definitions', ...saved.ref.split('/'));
		fs.writeFileSync(file, 'tampered');
		expect(() => save('f', '1.0.0', 'id: f\n')).not.toThrow();
		expect(fs.readFileSync(file, 'utf8')).toBe('tampered');
	});

	it('lists versions sorted by semver, with short hash and reference', () => {
		save('f', '1.10.0', 'b');
		save('f', '1.9.0', 'a');
		save('f', '2.0.0-rc.1', 'c');
		save('other', '9.9.9', 'x');
		const listed = store.list('f');
		expect(listed.map(known => known.version)).toEqual(['1.9.0', '1.10.0', '2.0.0-rc.1']);
		expect(listed[0]).toMatchObject({ hash: expect.stringMatching(/^[0-9a-f]{12}$/), ref: expect.any(String) });
	});

	it('lists nothing for a flow that was never snapshotted', () => {
		expect(store.list('missing')).toEqual([]);
	});

	it('reports a foreign file in the flow directory instead of ignoring it', () => {
		save('f', '1.0.0', 'a');
		fs.writeFileSync(path.join(dir, 'definitions', 'f', 'notes.txt'), 'x');
		expect(() => store.list('f')).toThrow(/notes\.txt.*not a definition snapshot.*Remove it/);
	});

	it('refuses to read a reference that does not exist', () => {
		expect(() => store.read('f/1.0.0-abcdef012345.yml')).toThrow(
			/Cannot read definition snapshot .*1\.0\.0-abcdef012345\.yml/
		);
	});
});
