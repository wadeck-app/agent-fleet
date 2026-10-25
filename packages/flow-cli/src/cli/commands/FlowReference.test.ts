import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RegisteredProjectFixture } from '../../test-utils/RegisteredProjectFixture';
import { resolveFlowReference } from './FlowReference';

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
