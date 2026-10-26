import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { removeTempDirectory } from '../testing/TempDirectory.js';
import { hashDefinition } from './DefinitionHash.js';
import { DefinitionSnapshotStore } from './DefinitionSnapshotStore.js';
import { listFlowVersions, renderVersionTable } from './FlowVersionListing.js';

describe('FlowVersionListing', () => {
	let dir: string;
	let store: DefinitionSnapshotStore;
	let registryFile: string;

	const entry = (version: string, script = 'echo hi') => ({ version, name: 'N', steps: [{ id: 's', script }] });
	const snapshot = (version: string, script?: string) => {
		const definition = { id: 'f', ...entry(version, script) };
		store.save({ flowId: 'f', version, hash: hashDefinition(definition), text: yaml.dump(definition) });
	};
	const register = (version: string, script?: string) =>
		fs.writeFileSync(registryFile, yaml.dump({ f: entry(version, script) }));

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'listing-'));
		store = new DefinitionSnapshotStore(path.join(dir, 'definitions'));
		registryFile = path.join(dir, 'flows.yml');
	});
	afterEach(() => removeTempDirectory(dir));

	it('lists snapshots by semver and marks the latest', () => {
		snapshot('1.10.0', 'b');
		snapshot('1.9.0', 'a');

		const rows = listFlowVersions(store, 'f', undefined);

		expect(rows.map(row => [row.version, row.latest])).toEqual([
			['1.9.0', false],
			['1.10.0', true],
		]);
		expect(rows[0]).toMatchObject({ snapshot: true, registry: false, firstSeen: expect.any(String) });
	});

	it('shows a registry version that never ran, and merges one that did', () => {
		snapshot('1.0.0');
		register('1.0.0');
		expect(listFlowVersions(store, 'f', registryFile)).toHaveLength(1);
		expect(listFlowVersions(store, 'f', registryFile)[0]).toMatchObject({ snapshot: true, registry: true });

		register('1.1.0', 'new');
		const rows = listFlowVersions(store, 'f', registryFile);
		expect(rows.map(row => row.version)).toEqual(['1.0.0', '1.1.0']);
		expect(rows[1]).toMatchObject({ snapshot: false, registry: true, latest: true, firstSeen: undefined });
	});

	it('renders a table with hash, first seen date and where each version lives', () => {
		snapshot('1.0.0');
		register('1.1.0', 'new');

		const text = renderVersionTable('f', listFlowVersions(store, 'f', registryFile));

		expect(text).toMatch(/VERSION\s+DEFINITION\s+FIRST SEEN \(UTC\)\s+WHERE/);
		expect(text).toMatch(/1\.0\.0\s+[0-9a-f]{12}\s+\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\s+snapshot\n/);
		expect(text).toMatch(/1\.1\.0 \*\s+[0-9a-f]{12}\s+-\s+registry \(not run yet\)/);
		expect(text).toContain('* = latest');
	});

	it('says what to do when the flow has no known version', () => {
		expect(renderVersionTable('f', [])).toBe(
			"No version of flow 'f' is known: it never ran and is not in the project registry. Run it once from its file: flow run <path>."
		);
	});
});
