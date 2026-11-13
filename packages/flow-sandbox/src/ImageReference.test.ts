import { describe, expect, it } from 'vitest';

import { ImageReference } from './ImageReference';
import { eachRow } from './testing/EachRow';

describe('ImageReference.problem (an image must be a repository:tag reference: the preflight can only match that form)', () => {
	it('accepts repository:tag, registry and namespace forms, a registry port and a digest', () =>
		eachRow(
			[
				['a tag', 'flow-sandbox:m6'],
				['a namespace', 'docker.io/library/flow-sandbox:m6'],
				['a registry with a port', 'localhost:5000/team/flow-sandbox:m6'],
				['a digest', 'flow-sandbox@sha256:0123456789abcdef'],
				['a dotted version', 'flow-sandbox:poc-m0.1'],
			],
			(_name, image) => expect(ImageReference.problem(image)).toBeUndefined()
		));

	it('refuses a bare tag or name, naming what it must look like and the example', () =>
		eachRow(
			[
				['a bare tag', 'm6'],
				['a bare name', 'flow-sandbox'],
				['a registry port but no tag', 'localhost:5000/flow-sandbox'],
				['an empty tag', 'flow-sandbox:'],
				['an empty repository', ':m6'],
			],
			(_name, image) => {
				const problem = ImageReference.problem(image) ?? '';

				expect(problem, image).toContain(JSON.stringify(image));
				expect(problem, image).toContain('repository:tag');
				expect(problem, image).toContain('flow-sandbox:m6');
			}
		));
});
