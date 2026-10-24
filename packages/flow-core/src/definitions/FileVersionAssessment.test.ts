import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { removeTempDirectory } from '../testing/TempDirectory.js';
import { hashDefinition } from './DefinitionHash.js';
import { DefinitionSnapshotStore } from './DefinitionSnapshotStore.js';
import { assessFileVersion, renderVersionLines } from './FileVersionAssessment.js';

function flow(version: string | undefined, script = 'echo hi'): Record<string, unknown> {
	return { id: 'f', ...(version === undefined ? {} : { version }), steps: [{ id: 's', script }] };
}

describe('assessFileVersion', () => {
	let dir: string;
	let store: DefinitionSnapshotStore;

	const known = (version: string, script?: string) => {
		const value = flow(version, script);
		store.save({ flowId: 'f', version, hash: hashDefinition(value), text: 'x' });
	};

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assess-'));
		store = new DefinitionSnapshotStore(path.join(dir, 'definitions'));
	});
	afterEach(() => removeTempDirectory(dir));

	it('reports a flow that never ran as new, with no warning', () => {
		const result = assessFileVersion(store, 'f', flow('1.0.0'), '/f.yml');
		expect(result).toMatchObject({ version: '1.0.0', status: 'new', warnings: [], errors: [] });
		expect(result.hash).toBe(hashDefinition(flow('1.0.0')).slice(0, 12));
	});

	it('reports identical content as known', () => {
		known('1.0.0');
		expect(assessFileVersion(store, 'f', flow('1.0.0'), '/f.yml').status).toBe('known');
	});

	it('reports a higher version as new', () => {
		known('1.0.0');
		expect(assessFileVersion(store, 'f', flow('1.1.0', 'other'), '/f.yml')).toMatchObject({
			status: 'new',
			latestKnown: '1.0.0',
			warnings: [],
		});
	});

	it('errors on the same version with different content and says to bump it', () => {
		known('1.0.0');
		const result = assessFileVersion(store, 'f', flow('1.0.0', 'edited'), '/f.yml');
		expect(result.status).toBe('conflict');
		expect(result.errors[0]).toMatch(/same version 1\.0\.0 but different content.*bump the version in \/f\.yml/);
	});

	it('warns when a new content has a version below the latest known one', () => {
		known('2.0.0');
		const result = assessFileVersion(store, 'f', flow('1.5.0', 'other'), '/f.yml');
		expect(result.status).toBe('older');
		expect(result.warnings[0]).toMatch(
			/1\.5\.0 is lower than the latest known version 2\.0\.0.*keeps running 2\.0\.0/
		);
	});

	it('warns about a missing version and shows 0.0.0', () => {
		const result = assessFileVersion(store, 'f', flow(undefined), '/f.yml');
		expect(result.version).toBe('0.0.0');
		expect(result.warnings[0]).toMatch(/has no version/);
	});

	it('reports an invalid version as an error', () => {
		const result = assessFileVersion(store, 'f', { ...flow('1.0.0'), version: '1.0' }, '/f.yml');
		expect(result.errors[0]).toMatch(/not a semantic version/);
		expect(result.status).toBe('invalid');
	});

	describe('renderVersionLines', () => {
		it('says the content is new and what the latest known version is', () => {
			known('1.0.0');
			const lines = renderVersionLines(assessFileVersion(store, 'f', flow('1.1.0', 'other'), '/f.yml'));
			expect(lines).toEqual(['Version:   1.1.0 (new content, latest known: 1.0.0)']);
		});

		it('says the content already ran', () => {
			known('1.0.0');
			const assessment = assessFileVersion(store, 'f', flow('1.0.0'), '/f.yml');
			expect(renderVersionLines(assessment)).toEqual([
				`Version:   1.0.0 (already run, definition ${assessment.hash})`,
			]);
		});

		it('says nothing ran yet for a first version', () => {
			expect(renderVersionLines(assessFileVersion(store, 'f', flow('1.0.0'), '/f.yml'))).toEqual([
				'Version:   1.0.0 (new content, never run)',
			]);
		});

		it('adds the warnings and errors under the version line', () => {
			known('1.0.0');
			const lines = renderVersionLines(assessFileVersion(store, 'f', flow('1.0.0', 'edited'), '/f.yml'));
			expect(lines[0]).toBe('Version:   1.0.0 (conflict)');
			expect(lines[1]).toMatch(/^ {2}error: .*same version 1\.0\.0 but different content/);
		});

		it('shows an invalid version without inventing one', () => {
			const lines = renderVersionLines(assessFileVersion(store, 'f', { ...flow('1.0.0'), version: 2 }, '/f.yml'));
			expect(lines[0]).toBe('Version:   invalid');
		});
	});
});
