import { describe, expect, it } from 'vitest';

import { DockerImageId } from './DockerImageId';

const HEX = 'a'.repeat(64);
const ID = `sha256:${HEX}`;

describe('DockerImageId', () => {
	it.each([
		{ label: 'an id with a newline', output: `${ID}\n`, ok: true },
		{ label: 'an empty output', output: '', ok: false },
		{ label: 'a short id', output: 'sha256:abc', ok: false },
		{ label: 'an error text', output: 'Error: No such image', ok: false },
	])('parse: $label', ({ output, ok }) => {
		if (ok) expect(DockerImageId.parse(output)).toBe(ID);
		else expect(() => DockerImageId.parse(output)).toThrow(/Expected an image id/);
	});

	it.each([
		{
			label: 'blobs layout',
			manifest: [{ Config: `blobs/sha256/${HEX}`, RepoTags: ['flow-sandbox:m9'] }],
			ok: true,
		},
		{ label: 'json layout', manifest: [{ Config: `${HEX}.json`, RepoTags: ['x:1', 'flow-sandbox:m9'] }], ok: true },
		{
			label: 'another image',
			manifest: [{ Config: `blobs/sha256/${'b'.repeat(64)}`, RepoTags: ['flow-sandbox:m9'] }],
			ok: false,
		},
		{
			label: 'another tag',
			manifest: [{ Config: `blobs/sha256/${HEX}`, RepoTags: ['flow-sandbox:old'] }],
			ok: false,
		},
	])('assertInArchive: $label', ({ manifest, ok }) => {
		const run = (): void => DockerImageId.assertInArchive(ID, JSON.stringify(manifest), 'flow-sandbox:m9');
		if (ok) expect(run).not.toThrow();
		else expect(run).toThrow(/does not hold image/);
	});

	it('assertInArchive: refuses a manifest that is not JSON', () => {
		expect(() => DockerImageId.assertInArchive(ID, 'tar: manifest.json: Not found', 'x:1')).toThrow(/not JSON/);
	});
});
