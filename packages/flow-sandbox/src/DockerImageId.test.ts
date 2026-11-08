import { describe, expect, it } from 'vitest';

import { DockerImageId } from './DockerImageId';
import { eachRow } from './testing/EachRow';

const HEX = 'a'.repeat(64);
const ID = `sha256:${HEX}`;

describe('DockerImageId', () => {
	it('parse (each case)', () =>
		eachRow(
			[
				{ label: 'an id with a newline', output: `${ID}\n`, ok: true },
				{ label: 'an empty output', output: '', ok: false },
				{ label: 'a short id', output: 'sha256:abc', ok: false },
				{ label: 'an error text', output: 'Error: No such image', ok: false },
			],
			({ output, ok }) => {
				if (ok) expect(DockerImageId.parse(output)).toBe(ID);
				else expect(() => DockerImageId.parse(output)).toThrow(/Expected an image id/);
			}
		));

	it('assertInArchive (each case)', () =>
		eachRow(
			[
				{
					label: 'blobs layout',
					manifest: [{ Config: `blobs/sha256/${HEX}`, RepoTags: ['flow-sandbox:m9'] }],
					ok: true,
				},
				{
					label: 'json layout',
					manifest: [{ Config: `${HEX}.json`, RepoTags: ['x:1', 'flow-sandbox:m9'] }],
					ok: true,
				},
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
			],
			({ manifest, ok }) => {
				const run = (): void => DockerImageId.assertInArchive(ID, JSON.stringify(manifest), 'flow-sandbox:m9');
				if (ok) expect(run).not.toThrow();
				else expect(run).toThrow(/does not hold image/);
			}
		));

	// Docker 29 with the containerd image store (the sbx 0.51.0 builder): `docker image inspect` .Id is the digest of the image
	// index, which the saved archive lists in index.json; its manifest.json Config is another digest (observed with hello-world).
	it('assertInArchive: the containerd store, where the id is the index digest of the archive (each case)', () =>
		eachRow(
			[
				{ label: 'index digest equals the id', index: [{ digest: ID }], tags: ['flow-sandbox:m9'], ok: true },
				{
					label: 'another index digest',
					index: [{ digest: `sha256:${'b'.repeat(64)}` }],
					tags: ['flow-sandbox:m9'],
					ok: false,
				},
				{ label: 'right digest, another tag', index: [{ digest: ID }], tags: ['flow-sandbox:old'], ok: false },
				{ label: 'no index', index: undefined, tags: ['flow-sandbox:m9'], ok: false },
			],
			({ index, tags, ok }) => {
				const manifest = JSON.stringify([{ Config: `blobs/sha256/${'c'.repeat(64)}`, RepoTags: tags }]);
				const indexJson =
					index === undefined ? 'tar: index.json: Not found' : JSON.stringify({ manifests: index });
				const run = (): void => DockerImageId.assertInArchive(ID, manifest, 'flow-sandbox:m9', indexJson);
				if (ok) expect(run).not.toThrow();
				else expect(run).toThrow(/does not hold image/);
			}
		));

	it('assertInArchive: refuses a manifest that is not JSON', () => {
		expect(() => DockerImageId.assertInArchive(ID, 'tar: manifest.json: Not found', 'x:1')).toThrow(/not JSON/);
	});
});
