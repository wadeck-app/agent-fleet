import { addPath } from '@wadeck-app/project-sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { RegisteredProjectFixture } from '../test-utils/RegisteredProjectFixture';
import { ProjectScopeError, ProjectScopeResolver } from './ProjectScopeResolver';

function failureOf(action: () => unknown): ProjectScopeError {
	try {
		action();
	} catch (error) {
		if (error instanceof ProjectScopeError) {
			return error;
		}
		throw error;
	}
	throw new Error('expected a ProjectScopeError, nothing was thrown');
}

describe('ProjectScopeResolver', () => {
	let fixture: RegisteredProjectFixture;
	const resolver = new ProjectScopeResolver();

	beforeEach(() => {
		fixture = new RegisteredProjectFixture();
	});

	afterEach(() => {
		fixture.dispose();
	});

	it('resolves the cwd to the registered project that contains it, from a subfolder too', async () => {
		const alpha = await fixture.register('alpha');
		const sub = path.join(alpha.folder!, 'src', 'deep');
		fs.mkdirSync(sub, { recursive: true });

		const resolved = resolver.resolve({ cwd: sub, env: fixture.env() });

		expect(resolved).toMatchObject({ id: alpha.id, name: 'alpha', source: 'cwd', via: 'cwd' });
		expect(resolved.path).toBe(alpha.folder);
	});

	it('lets --project win over FLOW_PROJECT and over the cwd', async () => {
		const alpha = await fixture.register('alpha');
		const beta = await fixture.register('beta');
		const gamma = await fixture.register('gamma');

		const resolved = resolver.resolve({
			cwd: alpha.folder!,
			projectRef: 'beta',
			env: fixture.env({ FLOW_PROJECT: 'gamma' }),
		});

		expect(resolved).toMatchObject({ id: beta.id, source: 'flag', via: '--project' });
		expect(gamma.id).not.toBe(beta.id);
	});

	it('lets FLOW_PROJECT win over the cwd', async () => {
		const alpha = await fixture.register('alpha');
		const gamma = await fixture.register('gamma');

		const resolved = resolver.resolve({ cwd: alpha.folder!, env: fixture.env({ FLOW_PROJECT: 'gamma' }) });

		expect(resolved).toMatchObject({ id: gamma.id, source: 'env', via: 'FLOW_PROJECT' });
	});

	it('treats a blank FLOW_PROJECT as unset', async () => {
		const alpha = await fixture.register('alpha');

		const resolved = resolver.resolve({ cwd: alpha.folder!, env: fixture.env({ FLOW_PROJECT: '   ' }) });

		expect(resolved.source).toBe('cwd');
	});

	it('resolves an alias and an id like a name', async () => {
		const alpha = await fixture.register('alpha', { aliases: ['al'] });
		const outside = fixture.makeFolder('elsewhere');

		expect(resolver.resolve({ cwd: outside, projectRef: 'al', env: fixture.env() }).id).toBe(alpha.id);
		expect(resolver.resolve({ cwd: outside, projectRef: alpha.id, env: fixture.env() }).id).toBe(alpha.id);
	});

	it('refuses an unknown reference with the SDK message and the flag it came from', async () => {
		await fixture.register('alpha');

		const error = failureOf(() => resolver.resolve({ cwd: fixture.root, projectRef: 'alpah', env: fixture.env() }));

		expect(error.code).toBe('PROJECT_NOT_FOUND');
		expect(error.message).toContain('--project "alpah": ');
		expect(error.message).toContain("no project matches 'alpah'");
		expect(error.message).toContain('alpha');
	});

	it('names FLOW_PROJECT when the bad reference came from the environment', async () => {
		await fixture.register('alpha');

		const error = failureOf(() =>
			resolver.resolve({ cwd: fixture.root, env: fixture.env({ FLOW_PROJECT: 'nope' }) })
		);

		expect(error.message).toContain('FLOW_PROJECT="nope": ');
	});

	it('refuses an empty --project instead of treating it as unset', async () => {
		const alpha = await fixture.register('alpha');

		const error = failureOf(() => resolver.resolve({ cwd: alpha.folder!, projectRef: '', env: fixture.env() }));

		expect(error.message).toContain('--project ""');
	});

	it('refuses an unregistered cwd with the SDK message, its hint and the project add line', async () => {
		await fixture.register('alpha');
		const unregistered = fixture.makeFolder('unregistered');

		const error = failureOf(() => resolver.resolve({ cwd: unregistered, env: fixture.env() }));

		expect(error.code).toBe('NO_PROJECT_IN_SCOPE');
		expect(error.message).toContain(unregistered);
		expect(error.message).toContain('alpha');
		expect(error.message).toContain(`project add "${unregistered}"`);
		expect(error.message.split('\n').length).toBeGreaterThanOrEqual(3);
	});

	it('still refuses a folder that has .git, .flow/config.yml and .flows: the registry is the only definition of a project', () => {
		const unregistered = fixture.makeFolder('looks-like-a-project');
		fs.mkdirSync(path.join(unregistered, '.git'));
		fs.mkdirSync(path.join(unregistered, '.flow'));
		fs.writeFileSync(path.join(unregistered, '.flow', 'config.yml'), 'hooks: {}\n');
		fs.mkdirSync(path.join(unregistered, '.flows'));

		const error = failureOf(() => resolver.resolve({ cwd: unregistered, env: fixture.env() }));

		expect(error.code).toBe('NO_PROJECT_IN_SCOPE');
	});

	it('resolves a folder reached through a second registered path of the project', async () => {
		const alpha = await fixture.register('alpha');
		const worktree = fixture.makeFolder('alpha-worktree');
		await addPath(fixture.registryDir, 'alpha', worktree);

		const resolved = resolver.resolve({ cwd: worktree, env: fixture.env() });

		expect(resolved.id).toBe(alpha.id);
		expect(resolved.path).toBe(worktree);
	});

	it('resolves a virtual project (no folder) without a path, and requirePath says what to do', async () => {
		const virtual = await fixture.register('docs-only', { folder: null });

		const resolved = resolver.resolve({ cwd: fixture.root, projectRef: 'docs-only', env: fixture.env() });

		expect(resolved.id).toBe(virtual.id);
		expect(resolved.path).toBeUndefined();
		const error = failureOf(() => resolver.requirePath(resolved));
		expect(error.code).toBe('VIRTUAL_PROJECT');
		expect(error.message).toContain('docs-only');
		expect(error.message).toContain('project paths add');
	});

	it('returns the path of a project with one from requirePath', async () => {
		const alpha = await fixture.register('alpha');

		const resolved = resolver.resolve({ cwd: fixture.root, projectRef: 'alpha', env: fixture.env() });

		expect(resolver.requirePath(resolved)).toBe(alpha.folder);
	});

	it('reports a corrupt registry with the file to fix', async () => {
		await fixture.register('alpha');
		fs.writeFileSync(path.join(fixture.registryDir, 'registry.json'), '{ not json');

		const error = failureOf(() => resolver.resolve({ cwd: fixture.root, env: fixture.env() }));

		expect(error.code).toBe('REGISTRY_ERROR');
		expect(error.message).toContain('registry.json');
	});

	it('reloads the registry on every call, so a project added in between is seen at once', async () => {
		const later = fixture.makeFolder('later');
		const env = fixture.env();
		expect(failureOf(() => resolver.resolve({ cwd: later, env })).code).toBe('NO_PROJECT_IN_SCOPE');

		const added = await fixture.register('later', { folder: later });

		expect(resolver.resolve({ cwd: later, env }).id).toBe(added.id);
	});

	it('describes how the project was resolved in one line', async () => {
		const alpha = await fixture.register('alpha');

		const resolved = resolver.resolve({ cwd: alpha.folder!, env: fixture.env() });

		expect(resolved.description).toContain('alpha');
		expect(resolved.description).toContain(alpha.id);
		expect(resolved.description).not.toContain('\n');
	});
});
