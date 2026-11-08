import { describe, expect, it } from 'vitest';

import { RunMetaDirectory } from './RunMetaDirectory';
import { eachRow } from './testing/EachRow';

describe('RunMetaDirectory', () => {
	it('derives the run meta directory from outputsDir (each layout), and keeps the sibling convention when there is none', async () => {
		await eachRow<[string, { workspaceDir: string; outputsDir?: unknown }, string]>(
			[
				[
					'in-place: meta inside the project (Windows)',
					{ workspaceDir: 'C:\\p', outputsDir: 'C:\\p\\.flow\\runs\\r1.meta\\outputs' },
					'C:\\p\\.flow\\runs\\r1.meta',
				],
				['sibling meta (POSIX)', { workspaceDir: '/w/ws', outputsDir: '/w/ws.meta/outputs' }, '/w/ws.meta'],
				['no outputsDir', { workspaceDir: '/w/ws' }, '/w/ws.meta'],
				['empty outputsDir', { workspaceDir: '/w/ws', outputsDir: '' }, '/w/ws.meta'],
			],
			(_name, context, expected) => expect(RunMetaDirectory.of(context)).toBe(expected)
		);
	});

	it('refuses an outputsDir that is not <meta>/outputs', async () => {
		await eachRow<[string, unknown]>(
			[
				['another name', '/w/ws.meta/out'],
				['a name that merely ends in outputs', '/w/ws.meta/myoutputs'],
				['not a string', 42],
			],
			(_name, outputsDir) =>
				expect(() => RunMetaDirectory.of({ workspaceDir: '/w/ws', outputsDir })).toThrow(/cannot be derived/)
		);
	});
});
