import { addProject, removeProject } from '@wadeck-app/project-sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createTempDirectory } from '../testing/TempDirectory.js';
import {
	type ProjectLookup,
	createRegistryProjectLookup,
	createRegistryProjectLookupFromEnv,
	projectLabelOf,
} from './ProjectLabel.js';

const known: ProjectLookup = () => ({ kind: 'known', name: 'my-app' });

describe('projectLabelOf', () => {
	it('shows name (id) for a project the registry knows', () => {
		expect(projectLabelOf({ projectId: 'a1b2c3d4' }, known)).toBe('my-app (a1b2c3d4)');
	});

	it('shows id (removed) for a project gone from the registry', () => {
		expect(projectLabelOf({ projectId: 'a1b2c3d4' }, () => ({ kind: 'removed' }))).toBe('a1b2c3d4 (removed)');
	});

	it('shows the bare id when the registry is unavailable or no lookup is given', () => {
		expect(projectLabelOf({ projectId: 'a1b2c3d4' }, () => ({ kind: 'unavailable' }))).toBe('a1b2c3d4');
		expect(projectLabelOf({ projectId: 'a1b2c3d4' })).toBe('a1b2c3d4');
	});

	it('shows the root with a dash for an old record that only has projectRoot', () => {
		expect(projectLabelOf({ projectRoot: '/work/app' }, known)).toBe('/work/app (-)');
	});

	it('prefers the id over the root and is undefined when neither exists', () => {
		expect(projectLabelOf({ projectId: 'a1b2c3d4', projectRoot: '/work/app' })).toBe('a1b2c3d4');
		expect(projectLabelOf({}, known)).toBeUndefined();
	});
});

describe('createRegistryProjectLookup', () => {
	async function registryWithProject(): Promise<{ registryDir: string; id: string }> {
		const root = createTempDirectory('flow-core-registry-');
		const folder = path.join(root, 'app');
		fs.mkdirSync(folder);
		const registryDir = path.join(root, 'xdg', 'project');
		const project = await addProject(registryDir, { name: 'my-app', path: folder });
		return { registryDir, id: project.id };
	}

	it('finds a live project by id', async () => {
		const { registryDir, id } = await registryWithProject();
		expect(createRegistryProjectLookup(registryDir)(id)).toEqual({ kind: 'known', name: 'my-app' });
	});

	it('still knows a soft-deleted project', async () => {
		const { registryDir, id } = await registryWithProject();
		await removeProject(registryDir, id);
		expect(createRegistryProjectLookup(registryDir)(id)).toEqual({ kind: 'known', name: 'my-app' });
	});

	it('reports an id that was never registered as removed', async () => {
		const { registryDir } = await registryWithProject();
		expect(createRegistryProjectLookup(registryDir)('ffffffff')).toEqual({ kind: 'removed' });
	});

	it('does not throw on an unreadable registry: unavailable, and one stderr line per lookup', () => {
		const root = createTempDirectory('flow-core-registry-bad-');
		const registryDir = path.join(root, 'project');
		fs.mkdirSync(registryDir);
		fs.writeFileSync(path.join(registryDir, 'registry.json'), '{not json');
		const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		const lookup = createRegistryProjectLookup(registryDir);
		expect(lookup('a1b2c3d4')).toEqual({ kind: 'unavailable' });
		expect(lookup('a1b2c3d5')).toEqual({ kind: 'unavailable' });
		expect(write).toHaveBeenCalledTimes(1);
		expect(String(write.mock.calls[0]?.[0])).toContain(registryDir);
	});
});

describe('createRegistryProjectLookupFromEnv', () => {
	it('reads the registry in $XDG_CONFIG_HOME/project, like the project CLI', async () => {
		const root = createTempDirectory('flow-core-registry-env-');
		const folder = path.join(root, 'app');
		fs.mkdirSync(folder);
		const project = await addProject(path.join(root, 'xdg', 'project'), { name: 'env-app', path: folder });
		const lookup = createRegistryProjectLookupFromEnv({ XDG_CONFIG_HOME: path.join(root, 'xdg') });
		expect(lookup(project.id)).toEqual({ kind: 'known', name: 'env-app' });
	});
});
