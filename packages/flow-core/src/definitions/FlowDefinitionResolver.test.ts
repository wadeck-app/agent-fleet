import type { FlowDefinition } from 'flow-engine/types';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { removeTempDirectory } from '../testing/TempDirectory.js';
import { hashDefinition } from './DefinitionHash.js';
import { DefinitionSnapshotStore } from './DefinitionSnapshotStore.js';
import { FlowDefinitionResolver } from './FlowDefinitionResolver.js';
import { FlowVersionError } from './FlowVersionError.js';

function definition(version: string | undefined, script = 'echo hi'): Record<string, unknown> {
	return {
		id: 'my-flow',
		...(version === undefined ? {} : { version }),
		name: 'My flow',
		steps: [{ id: 's', type: 'script', script }],
	};
}

describe('FlowDefinitionResolver', () => {
	let dir: string;
	let store: DefinitionSnapshotStore;
	let resolver: FlowDefinitionResolver;
	let registryFile: string;

	const writeRegistry = (entries: Record<string, unknown>, file = registryFile) =>
		fs.writeFileSync(file, yaml.dump(entries));
	const registerVersion = (version: string, script?: string) => {
		const { id: _id, ...entry } = definition(version, script);
		writeRegistry({ 'my-flow': entry });
	};
	const request = (value: Record<string, unknown>) => ({
		flowId: 'my-flow',
		flow: value as unknown as FlowDefinition,
		text: yaml.dump(value),
		label: '/flows/my-flow.yml',
	});
	const fromFile = (value: Record<string, unknown>) => {
		const resolved = resolver.forFile(request(value));
		resolved.commit();
		return resolved;
	};
	const errorOf = (action: () => unknown): FlowVersionError => {
		try {
			action();
		} catch (err) {
			if (err instanceof FlowVersionError) {
				return err;
			}
			throw err;
		}
		throw new Error('expected a FlowVersionError');
	};

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-'));
		store = new DefinitionSnapshotStore(path.join(dir, 'definitions'));
		resolver = new FlowDefinitionResolver(store);
		registryFile = path.join(dir, 'flows.yml');
	});
	afterEach(() => removeTempDirectory(dir));

	describe('a flow file', () => {
		it('runs as is, is snapshotted and reports version, hash and snapshot', () => {
			const resolved = fromFile(definition('1.2.0'));
			expect(resolved).toMatchObject({
				flowId: 'my-flow',
				version: '1.2.0',
				choice: 'file',
				hash: hashDefinition(definition('1.2.0')),
				warnings: [],
			});
			expect(resolved.definitionSnapshot).toMatch(/^my-flow\/1\.2\.0-[0-9a-f]{12}\.yml$/);
			expect(store.read(resolved.definitionSnapshot)).toBe(yaml.dump(definition('1.2.0')));
		});

		it('writes nothing until committed, so a definition refused later leaves no immutable version behind', () => {
			const resolved = resolver.forFile(request(definition('1.0.0')));
			expect(store.list('my-flow')).toEqual([]);
			resolved.commit();
			expect(store.list('my-flow')).toHaveLength(1);
			expect(() => resolver.forFile(request(definition('1.0.0', 'fixed typo')))).toThrow(/same version/);
		});

		it('is idempotent: running the same content again adds no snapshot', () => {
			fromFile(definition('1.0.0'));
			fromFile(definition('1.0.0'));
			expect(store.list('my-flow')).toHaveLength(1);
		});

		it('refuses the same version with different content and says how to fix it', () => {
			const first = fromFile(definition('1.0.0'));
			const error = errorOf(() => fromFile(definition('1.0.0', 'echo changed')));
			expect(error.kind).toBe('version-conflict');
			expect(error.message).toContain('same version 1.0.0 but different content');
			expect(error.message).toContain(first.hash.slice(0, 12));
			expect(error.message).toContain('bump the version in /flows/my-flow.yml');
			expect(store.list('my-flow')).toHaveLength(1);
		});

		it('accepts a new content under a higher version, and keeps the old snapshot untouched', () => {
			const v1 = fromFile(definition('1.0.0'));
			const before = store.read(v1.definitionSnapshot);
			fromFile(definition('1.1.0', 'echo changed'));
			expect(store.read(v1.definitionSnapshot)).toBe(before);
			expect(store.list('my-flow').map(known => known.version)).toEqual(['1.0.0', '1.1.0']);
		});

		it('treats a flow without version as 0.0.0, warns how to add one, and never conflicts', () => {
			const first = fromFile(definition(undefined));
			expect(first.version).toBe('0.0.0');
			expect(first.warnings.join('\n')).toMatch(/has no version.*0\.0\.0.*version: '1\.0\.0'/);
			expect(() => fromFile(definition(undefined, 'echo changed'))).not.toThrow();
			expect(store.list('my-flow')).toHaveLength(2);
		});

		it.each([2, '1.0', 'v1.0.0', '1.0.0+build'])('refuses the invalid version %j', version => {
			const error = errorOf(() => fromFile({ ...definition('1.0.0'), version }));
			expect(error.kind).toBe('version-invalid');
			expect(error.message).toContain('MAJOR.MINOR.PATCH');
		});
	});

	describe('a registered flow', () => {
		const resolve = (requestedVersion?: string) =>
			resolver.forRegistered({ flowId: 'my-flow', registryFile, requestedVersion });

		it('runs the registry entry when nothing is snapshotted yet (latest)', () => {
			registerVersion('1.0.0');
			const resolved = resolve();
			resolved.commit();
			expect(resolved).toMatchObject({ version: '1.0.0', choice: 'latest', flowId: 'my-flow' });
			expect(resolved.flow.id).toBe('my-flow');
			expect(store.list('my-flow')).toHaveLength(1);
		});

		it('latest is the highest semver, not the newest file: 1.10.0 beats 1.9.0, a release beats its prerelease', () => {
			fromFile(definition('1.9.0', 'a'));
			fromFile(definition('1.10.0', 'b'));
			fromFile(definition('2.0.0-rc.1', 'c'));
			expect(resolve().version).toBe('2.0.0-rc.1');
			fromFile(definition('2.0.0', 'd'));
			expect(resolve().version).toBe('2.0.0');
		});

		it('follows the edited entry once its version is the highest', () => {
			registerVersion('1.0.0');
			resolve().commit();
			registerVersion('1.1.0', 'echo v2');
			const resolved = resolve();
			resolved.commit();
			expect(resolved.version).toBe('1.1.0');
			expect(resolved.flow.steps[0]).toMatchObject({ script: 'echo v2' });
			expect(store.list('my-flow').map(known => known.version)).toEqual(['1.0.0', '1.1.0']);
		});

		it('does not let a lowered entry version win over a higher snapshot', () => {
			fromFile(definition('1.5.0', 'old'));
			registerVersion('1.0.0', 'downgraded');
			expect(resolve()).toMatchObject({ version: '1.5.0', choice: 'latest' });
		});

		it('pinned runs the snapshot of that version even after the entry changed', () => {
			registerVersion('1.0.0');
			const first = resolve();
			first.commit();
			registerVersion('1.1.0', 'echo v2');
			const pinned = resolve('1.0.0');
			expect(pinned).toMatchObject({ version: '1.0.0', choice: 'pinned', hash: first.hash });
			expect(pinned.flow.steps[0]).toMatchObject({ script: 'echo hi' });
			expect(pinned.definitionSnapshot).toBe(first.definitionSnapshot);
		});

		it('pinned to the current entry version snapshots and runs the entry', () => {
			registerVersion('1.3.0');
			const pinned = resolve('1.3.0');
			pinned.commit();
			expect(pinned).toMatchObject({ version: '1.3.0', choice: 'pinned' });
			expect(store.list('my-flow')).toHaveLength(1);
		});

		it('an unknown pinned version lists the known ones', () => {
			registerVersion('1.0.0');
			resolve().commit();
			registerVersion('1.1.0', 'x');
			const error = errorOf(() => resolve('9.9.9'));
			expect(error.kind).toBe('version-not-found');
			expect(error.message).toContain("version 9.9.9 of flow 'my-flow'");
			expect(error.message).toContain('1.0.0');
			expect(error.message).toContain('1.1.0');
		});

		it('refuses a pinned version that is not semver', () => {
			registerVersion('1.0.0');
			expect(errorOf(() => resolve('latest')).kind).toBe('version-invalid');
		});

		it('refuses an entry whose content differs from the snapshot of the same version', () => {
			registerVersion('1.0.0');
			resolve().commit();
			registerVersion('1.0.0', 'edited without bump');
			const error = errorOf(() => resolve());
			expect(error.kind).toBe('version-conflict');
			expect(error.message).toContain("bump the version in the registry entry 'my-flow' in " + registryFile);
		});

		it('runs from the snapshots alone when the registry file is gone', () => {
			fromFile(definition('1.0.0'));
			const resolved = resolver.forRegistered({
				flowId: 'my-flow',
				registryFile: path.join(dir, 'missing.yml'),
				requestedVersion: undefined,
			});
			expect(resolved).toMatchObject({ version: '1.0.0', choice: 'latest' });
		});

		it('explains where it looked when the flow is nowhere', () => {
			const error = errorOf(() => resolve());
			expect(error.kind).toBe('flow-not-found');
			expect(error.message).toContain("'my-flow'");
			expect(error.message).toContain(registryFile);
			expect(error.message).toMatch(/run it once from its file/);
		});

		it('reads entries from included files; the main file wins', () => {
			const { id: _id, ...included } = definition('1.0.0', 'included');
			fs.writeFileSync(path.join(dir, 'more.yml'), yaml.dump({ 'my-flow': included, other: included }));
			writeRegistry({ includes: ['more.yml'] });
			expect(resolve().flow.steps[0]).toMatchObject({ script: 'included' });
			const { id: _id2, ...main } = definition('1.1.0', 'main');
			writeRegistry({ includes: ['more.yml'], 'my-flow': main });
			expect(resolve().flow.steps[0]).toMatchObject({ script: 'main' });
		});

		it('refuses an entry that uses source: instead of resolving it silently differently', () => {
			writeRegistry({ 'my-flow': { source: 'external.yml' } });
			const error = errorOf(() => resolve());
			expect(error.kind).toBe('registry-unsupported');
			expect(error.message).toContain('source');
		});

		it('refuses an unreadable registry with the file name', () => {
			fs.writeFileSync(registryFile, 'a: [unclosed');
			const error = errorOf(() => resolve());
			expect(error.kind).toBe('registry-unreadable');
			expect(error.message).toContain(registryFile);
		});

		it('reports two different contents tied at the highest version (unversioned flows) as ambiguous', () => {
			fromFile(definition(undefined, 'one'));
			fromFile(definition(undefined, 'two'));
			const error = errorOf(() => resolve());
			expect(error.kind).toBe('version-ambiguous');
			expect(error.message).toContain('add a version');
		});

		it('detects a snapshot that no longer matches its hash', () => {
			const first = fromFile(definition('1.0.0'));
			fs.writeFileSync(
				path.join(dir, 'definitions', ...first.definitionSnapshot.split('/')),
				yaml.dump(definition('1.0.0', 'tampered'))
			);
			const error = errorOf(() => resolve());
			expect(error.kind).toBe('snapshot-corrupt');
			expect(error.message).toContain(first.definitionSnapshot);
		});
	});
});
