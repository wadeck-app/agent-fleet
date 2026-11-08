import { describe, expect, it } from 'vitest';

import { RunMetaDirectory } from './RunMetaDirectory';
import { eachRow } from './testing/EachRow';

describe('RunMetaDirectory', () => {
	it('derives the run meta directory from outputsDir (each layout)', async () => {
		await eachRow<[string, { workspaceDir: string; outputsDir?: unknown }, string]>(
			[
				[
					'in-place: meta inside the project (Windows)',
					{ workspaceDir: 'C:\\p', outputsDir: 'C:\\p\\.flow\\runs\\r1.meta\\outputs' },
					'C:\\p\\.flow\\runs\\r1.meta',
				],
				['sibling meta (POSIX)', { workspaceDir: '/w/ws', outputsDir: '/w/ws.meta/outputs' }, '/w/ws.meta'],
			],
			(_name, context, expected) => expect(RunMetaDirectory.of(context)).toBe(expected)
		);
	});

	// No guessing of "<workspace>.meta": since the workspace providers that is wrong for in-place and pool, and a wrong mount is
	// a wrong exposure. The daemon always sends outputsDir; its absence means a protocol drift that must be visible.
	it('refuses an assignment without outputsDir, saying what is missing', async () => {
		await eachRow<[string, unknown]>(
			[
				['absent', undefined],
				['null', null],
				['empty', ''],
			],
			(_name, outputsDir) =>
				expect(() => RunMetaDirectory.of({ workspaceDir: '/w/ws', outputsDir })).toThrow(
					/no executionContext\.outputsDir[\s\S]*daemon/
				)
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
