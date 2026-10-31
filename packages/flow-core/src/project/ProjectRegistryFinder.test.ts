import { addProject, removeProject } from '@wadeck-app/project-sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createTempDirectory } from '../testing/TempDirectory.js';
import { createRegistryProjectFinder } from './ProjectRegistryFinder.js';

function newRegistryDir(): { root: string; registryDir: string } {
	const root = createTempDirectory('flow-core-finder-');
	return { root, registryDir: path.join(root, 'xdg', 'project') };
}

describe('createRegistryProjectFinder', () => {
	it('finds a live project with its name', async () => {
		const { root, registryDir } = newRegistryDir();
		fs.mkdirSync(path.join(root, 'app'));
		const project = await addProject(registryDir, { name: 'my-app', path: path.join(root, 'app') });
		expect(createRegistryProjectFinder(registryDir)(project.id)).toEqual({
			kind: 'live',
			name: 'my-app',
			virtual: false,
		});
	});

	it('flags a project without path as virtual', async () => {
		const { registryDir } = newRegistryDir();
		const project = await addProject(registryDir, { name: 'shared-config' });
		expect(createRegistryProjectFinder(registryDir)(project.id)).toEqual({
			kind: 'live',
			name: 'shared-config',
			virtual: true,
		});
	});

	it('still names a removed project, and says it is removed', async () => {
		const { root, registryDir } = newRegistryDir();
		fs.mkdirSync(path.join(root, 'app'));
		const project = await addProject(registryDir, { name: 'my-app', path: path.join(root, 'app') });
		await removeProject(registryDir, project.id);
		expect(createRegistryProjectFinder(registryDir)(project.id)).toEqual({
			kind: 'removed',
			name: 'my-app',
			virtual: false,
		});
	});

	it('answers unknown for an id the registry never had', () => {
		const { registryDir } = newRegistryDir();
		expect(createRegistryProjectFinder(registryDir)('deadbeef')).toEqual({ kind: 'unknown' });
	});

	it('answers unavailable with the directory and the cause when the registry cannot be read, never throws', () => {
		const { registryDir } = newRegistryDir();
		// A registry.json that is not JSON makes every read fail.
		fs.mkdirSync(registryDir, { recursive: true });
		fs.writeFileSync(path.join(registryDir, 'registry.json'), '{ not json');
		const answer = createRegistryProjectFinder(registryDir)('deadbeef');
		expect(answer.kind).toBe('unavailable');
		expect(answer).toMatchObject({ reason: expect.stringContaining(registryDir) });
	});
});
