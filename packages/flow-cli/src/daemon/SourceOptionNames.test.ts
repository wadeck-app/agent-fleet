import { describe, expect, it } from 'vitest';

import { SourceOptionNames } from './SourceOptionNames.js';

const ACCEPTED = ['extraAllowedHosts', 'image', 'maxConcurrentSandboxes', 'projects', 'region'];

describe('SourceOptionNames', () => {
	it('finds no unknown name when every one is accepted', () => {
		expect(SourceOptionNames.unknown(['projects', 'image'], ACCEPTED)).toEqual([]);
	});

	it('names the nearest accepted option for a misspelling', () => {
		expect(SourceOptionNames.unknown(['project'], ACCEPTED)).toEqual([{ name: 'project', near: ['projects'] }]);
	});

	it('offers no suggestion for a name that is near nothing', () => {
		expect(SourceOptionNames.unknown(['zzzzzzzz'], ACCEPTED)).toEqual([{ name: 'zzzzzzzz', near: [] }]);
	});

	it('is case sensitive, like the plugin', () => {
		expect(SourceOptionNames.unknown(['Projects'], ACCEPTED)).toEqual([{ name: 'Projects', near: ['projects'] }]);
	});

	it('describes the unknown names, the accepted ones and the nearest', () => {
		const text = SourceOptionNames.describe(SourceOptionNames.unknown(['project', 'zzzzzzzz'], ACCEPTED), ACCEPTED);

		expect(text).toContain('option "project" is not one of the accepted options');
		expect(text).toContain('Did you mean "projects"?');
		expect(text).toContain('option "zzzzzzzz"');
		expect(text).toContain(`Accepted options: ${ACCEPTED.join(', ')}.`);
	});

	it('says that no option is accepted when the list is empty', () => {
		const text = SourceOptionNames.describe(SourceOptionNames.unknown(['image'], []), []);

		expect(text).toContain('Accepted options: none.');
	});
});
