import { DefinitionSnapshotStore, hashDefinition } from 'flow-core';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RegisteredProjectFixture } from '../../test-utils/RegisteredProjectFixture';
import { describeMissingFlowFile, isFileLikeReference, resolveFlowReference } from './FlowReference';

describe('resolveFlowReference', () => {
	let fixture: RegisteredProjectFixture;
	let root: string;

	beforeEach(async () => {
		fixture = new RegisteredProjectFixture();
		root = (await fixture.register('alpha')).folder!;
	});
	afterEach(() => {
		fixture.dispose();
	});

	const env = (extra: NodeJS.ProcessEnv = {}) => fixture.env(extra);

	it('an existing file runs as it is, relative paths resolved from the working directory', () => {
		fs.writeFileSync(path.join(root, 'my-flow.yml'), 'id: x');

		expect(resolveFlowReference('my-flow.yml', root, { env: env() })).toEqual({
			kind: 'file',
			flowFile: path.join(root, 'my-flow.yml'),
		});
	});

	it('an existing file needs no registered project: the daemon decides whether the run may start', () => {
		const elsewhere = fixture.makeFolder('elsewhere');
		fs.writeFileSync(path.join(elsewhere, 'my-flow.yml'), 'id: x');

		expect(resolveFlowReference('my-flow.yml', elsewhere, { env: env() })).toMatchObject({ kind: 'file' });
	});

	it('an existing file wins even when its name contains an @', () => {
		fs.mkdirSync(path.join(root, '@scope'));
		fs.writeFileSync(path.join(root, '@scope', 'flow@1.0.0'), 'id: x');

		expect(resolveFlowReference('@scope/flow@1.0.0', root, { env: env() })).toMatchObject({ kind: 'file' });
	});

	it('an id is looked up in the registry file of the registered project; the file may not exist (snapshots can still serve it)', () => {
		const sub = path.join(root, 'sub');
		fs.mkdirSync(sub);

		expect(resolveFlowReference('my-flow', sub, { env: env() })).toEqual({
			kind: 'registered',
			flowFile: path.join(root, '.flow', 'flows.yml'),
			flowId: 'my-flow',
			flowVersion: undefined,
		});
	});

	it('id@version pins the version', () => {
		expect(resolveFlowReference('my-flow@1.2.0-rc.1', root, { env: env() })).toMatchObject({
			kind: 'registered',
			flowId: 'my-flow',
			flowVersion: '1.2.0-rc.1',
		});
	});

	it('looks the id up in the project named with --project, whatever the working directory', async () => {
		const beta = await fixture.register('beta');
		const elsewhere = fixture.makeFolder('elsewhere');

		expect(resolveFlowReference('my-flow', elsewhere, { projectRef: 'beta', env: env() })).toMatchObject({
			kind: 'registered',
			flowFile: path.join(beta.folder!, '.flow', 'flows.yml'),
		});
	});

	it('looks the id up in the project named by FLOW_PROJECT', async () => {
		const beta = await fixture.register('beta');

		expect(resolveFlowReference('my-flow', root, { env: env({ FLOW_PROJECT: 'beta' }) })).toMatchObject({
			kind: 'registered',
			flowFile: path.join(beta.folder!, '.flow', 'flows.yml'),
		});
	});

	it.each(['my-flow@', 'my-flow@latest', 'my-flow@1.0', '@1.0.0'])('refuses the malformed reference %j', ref => {
		const result = resolveFlowReference(ref, root, { env: env() });
		expect(result.kind).toBe('error');
		expect((result as { error: string }).error).toMatch(/<flow-id>@MAJOR\.MINOR\.PATCH/);
	});

	it('says how to register the folder when the working directory is in no project', () => {
		const outside = fixture.makeFolder('outside');

		const result = resolveFlowReference('my-flow', outside, { env: env() });

		expect(result.kind).toBe('error');
		const error = (result as { error: string }).error;
		expect(error).toContain("Flow 'my-flow' not found as a file");
		expect(error).toContain(`project add "${outside}"`);
	});

	it('names the flag when the project reference does not resolve', () => {
		const result = resolveFlowReference('my-flow', root, { projectRef: 'nope', env: env() });

		expect(result.kind).toBe('error');
		expect((result as { error: string }).error).toContain('--project "nope"');
	});

	it('says how to give a folder to a virtual project, which has no .flow/flows.yml to read', async () => {
		await fixture.register('docs-only', { folder: null });

		const result = resolveFlowReference('my-flow', root, { projectRef: 'docs-only', env: env() });

		expect(result.kind).toBe('error');
		expect((result as { error: string }).error).toContain('project paths add docs-only');
	});
});

describe.each([
	['flow.yml', true],
	['FLOW.YAML', true],
	['sub/flow', true],
	['sub\\flow', true],
	['./flow', true],
	['../flow', true],
	['~', true],
	['~/flow', true],
	['C:\\Users\\x\\flow', true],
	['C:/Users/x/flow', true],
	['c:flow', true],
	['@scope/flow@1.0.0', true],
	['my-flow', false],
	['my-flow@1.2.0', false],
	['my.flow_v2', false],
])('isFileLikeReference(%j)', (ref, expected) => {
	it(`is ${expected}`, () => {
		expect(isFileLikeReference(ref)).toBe(expected);
	});
});

describe('resolveFlowReference: messages for a reference that is not a file', () => {
	let fixture: RegisteredProjectFixture;
	let root: string;
	let configDir: string;

	beforeEach(async () => {
		fixture = new RegisteredProjectFixture();
		root = (await fixture.register('alpha')).folder!;
		configDir = path.join(fixture.root, 'config');
	});
	afterEach(() => {
		fixture.dispose();
	});

	const resolve = (ref: string, cwd = root) =>
		resolveFlowReference(ref, cwd, { env: fixture.env(), configDir }) as { kind: string; error?: string };
	const writeRegistry = (ids: string[]) => {
		fs.mkdirSync(path.join(root, '.flow'), { recursive: true });
		fs.writeFileSync(
			path.join(root, '.flow', 'flows.yml'),
			yaml.dump(Object.fromEntries(ids.map(id => [id, { steps: [{ id: 's', script: 'echo SECRET_VALUE' }] }])))
		);
	};
	const missingAbsolute = path.join(os.tmpdir(), 'nope', 'missing.yml');

	it.each([
		['a missing relative path', 'nope/missing.yml'],
		['a missing bare .yaml name', 'missing.yaml'],
		['a missing ./ path', './missing'],
		['a missing absolute path', missingAbsolute],
		['a missing absolute path with backslashes', missingAbsolute.replace(/[\\/]/g, '\\')],
	])('%s: names the resolved path, the cwd and the alternatives', (_label, ref) => {
		const result = resolve(ref);

		expect(result.kind).toBe('error');
		const expectedPath = path.isAbsolute(ref) ? path.resolve(ref) : path.resolve(root, ref);
		expect(result.error).toBe(
			`Flow file not found: ${expectedPath} (cwd: ${root}). Pass an existing .yml file, ` +
				'or a registered flow id (see .flow/flows.yml of the project alpha).'
		);
		expect(result.error).not.toContain('cannot be versioned');
	});

	it('a missing file outside any registered project does not claim a project', () => {
		const outside = fixture.makeFolder('outside');

		const result = resolve('missing.yml', outside);

		expect(result.error).toBe(
			`Flow file not found: ${path.join(outside, 'missing.yml')} (cwd: ${outside}). Pass an existing .yml file, or a registered flow id.`
		);
	});

	it('a drive-letter path is a file reference whatever the platform', () => {
		const result = resolve('Z:\\nope\\missing.yml');

		expect(result.kind).toBe('error');
		expect(result.error).toContain('Flow file not found: ');
		expect(result.error).not.toContain('cannot be versioned');
	});

	it('a bare id that is not registered lists the registered ids, never their content', () => {
		writeRegistry(['b-flow', 'a-flow']);

		const result = resolve('ghost');

		expect(result.kind).toBe('error');
		expect(result.error).toMatch(
			/^No registered flow "ghost" in project alpha \([0-9a-f]{8}\)\. Registered flows: b-flow, a-flow\. To run a file pass its path\.$/
		);
		expect(result.error).not.toContain('SECRET_VALUE');
	});

	it('lists at most 10 ids and says there are more', () => {
		writeRegistry(Array.from({ length: 12 }, (_, i) => `flow-${i}`));

		const result = resolve('ghost');

		expect(result.error).toContain('flow-9, ...');
		expect(result.error).not.toContain('flow-10');
	});

	it('says so when the project has no registry file at all', () => {
		expect(resolve('ghost').error).toContain('Registered flows: none (no .flow/flows.yml in the project).');
	});

	it('a bare id with characters no id may have is reported as unregistered, not as a versioning problem', () => {
		const result = resolve('my flow');

		expect(result.error).toContain('No registered flow "my flow"');
		expect(result.error).not.toContain('cannot be versioned');
	});

	it('a registered id resolves', () => {
		writeRegistry(['my-flow']);

		expect(resolve('my-flow')).toMatchObject({ kind: 'registered', flowId: 'my-flow' });
		expect(resolve('my-flow@1.0.0')).toMatchObject({ kind: 'registered', flowId: 'my-flow', flowVersion: '1.0.0' });
	});

	it('an id that only has snapshots of earlier runs still resolves (the daemon serves it)', () => {
		const definition = { id: 'ran-once', version: '1.0.0', steps: [{ id: 's', script: 'x' }] };
		new DefinitionSnapshotStore(path.join(configDir, 'definitions')).save({
			flowId: 'ran-once',
			version: '1.0.0',
			hash: hashDefinition(definition),
			text: yaml.dump(definition),
		});

		expect(resolve('ran-once').kind).toBe('registered');
	});

	it('an unreadable registry does not block the run: the daemon reports it with its own message', () => {
		fs.mkdirSync(path.join(root, '.flow'), { recursive: true });
		fs.writeFileSync(path.join(root, '.flow', 'flows.yml'), 'a: [unclosed');

		expect(resolve('anything').kind).toBe('registered');
	});

	it('keeps the version-syntax error for a malformed id@version', () => {
		expect(resolve('my-flow@latest').error).toContain('<flow-id>@MAJOR.MINOR.PATCH');
	});
});

describe('describeMissingFlowFile', () => {
	it('resolves a relative path against the cwd and appends the given hint', () => {
		const cwd = path.resolve('/some/where');
		expect(describeMissingFlowFile('x/y.yml', cwd, 'Pass an existing .yml file.')).toBe(
			`Flow file not found: ${path.resolve(cwd, 'x/y.yml')} (cwd: ${cwd}). Pass an existing .yml file.`
		);
	});
});
