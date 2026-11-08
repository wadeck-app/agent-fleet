import { describe, expect, it } from 'vitest';

import { SbxStartNoticeFilter } from './SbxStartNoticeFilter';
import { eachRow } from './testing/EachRow';

const NOTICE = '  ✓ sandbox box-1 — started\n';
const OTHER = NOTICE.replace('box-1', 'box-2');

function filtered(chunks: string[]): string[] {
	const emitted: string[] = [];
	const filter = new SbxStartNoticeFilter('box-1', text => emitted.push(text));
	for (const chunk of chunks) filter.push(chunk);
	filter.finish();
	return emitted;
}

describe('SbxStartNoticeFilter', () => {
	it('drops the start notice of that sandbox at the beginning of the stream, however it is chunked, and nothing else', async () => {
		await eachRow<[string, string[], string[]]>(
			[
				['the notice alone', [NOTICE], []],
				['the notice then output', [NOTICE, 'err\n'], ['err\n']],
				['the notice and output in one chunk', [`${NOTICE}err\n`], ['err\n']],
				['the notice split in three', [NOTICE.slice(0, 5), NOTICE.slice(5, 20), `${NOTICE.slice(20)}x`], ['x']],
				['output without a notice', ['err\n', 'more\n'], ['err\n', 'more\n']],
				['the notice later in the stream is the program output', ['x\n', NOTICE], ['x\n', NOTICE]],
				['the notice of another sandbox', [OTHER], [OTHER]],
				['a truncated notice at the end of the stream', [NOTICE.slice(0, 10)], [NOTICE.slice(0, 10)]],
				['nothing', [], []],
			],
			(_name, chunks, expected) => expect(filtered(chunks)).toEqual(expected)
		);
	});

	it('strips the notice from a finished stderr in the same way', async () => {
		await eachRow<[string, string, string]>(
			[
				['notice then error', `${NOTICE}boom\n`, 'boom\n'],
				['no notice', 'boom\n', 'boom\n'],
				['notice not first', `boom\n${NOTICE}`, `boom\n${NOTICE}`],
			],
			(_name, stderr, expected) => expect(SbxStartNoticeFilter.strip('box-1', stderr)).toBe(expected)
		);
	});
});
