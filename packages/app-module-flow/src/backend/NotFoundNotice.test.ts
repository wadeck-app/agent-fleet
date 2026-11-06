import { ExecutionLookupError, InvalidQueryError, UnknownPluginError } from 'flow-core';
import { describe, expect, it } from 'vitest';

import { notFoundNoticeOf } from './NotFoundNotice.js';

const ABSOLUTE_PATH = /([A-Za-z]:[\\/]|\/(home|Users|tmp|var)\/)/;

describe('notFoundNoticeOf', () => {
	it('words a missing execution for a user holding a stale link, with the way to the list', () => {
		const notice = notFoundNoticeOf(
			new ExecutionLookupError(
				"No execution matches 's6n7aze5' in C:\\Users\\someone\\.config\\flow\\executions.",
				'not-found'
			),
			's6n7aze5'
		);
		expect(notice).toEqual({
			found: false,
			notFound: true,
			id: 's6n7aze5',
			title: 'Execution not found',
			message:
				'Execution s6n7aze5 was not found. It may have been removed by the retention cleanup, or the id is wrong.',
			listLabel: 'See all executions',
			listHref: '/modules/flow/executions',
		});
	});

	it('never leaks the absolute path the lookup error carries', () => {
		const notice = notFoundNoticeOf(
			new ExecutionLookupError("No execution matches 'abc' in /home/me/.config/flow/executions.", 'not-found'),
			'abc'
		)!;
		expect(JSON.stringify(notice)).not.toMatch(ABSOLUTE_PATH);
	});

	it('treats an id that cannot be an execution id like a missing one (the id is wrong)', () => {
		expect(notFoundNoticeOf(new ExecutionLookupError('not an id', 'invalid-id'), 'NOPE!')).toMatchObject({
			notFound: true,
			id: 'NOPE!',
			title: 'Execution not found',
		});
	});

	it('words a missing plugin and links to the plugin list', () => {
		expect(notFoundNoticeOf(new UnknownPluginError('nope'), 'nope')).toEqual({
			found: false,
			notFound: true,
			id: 'nope',
			title: 'Plugin not found',
			message: 'Plugin nope was not found. The id may be wrong.',
			listLabel: 'See all plugins',
			listHref: '/modules/flow/plugins',
		});
	});

	it.each([
		['an ambiguous prefix', new ExecutionLookupError('two match', 'ambiguous')],
		['a corrupt file', new ExecutionLookupError('cannot parse', 'corrupt')],
		['an invalid record', new ExecutionLookupError('no steps', 'invalid-record')],
		['a bad query', new InvalidQueryError('bad limit')],
		['an unexpected error', new Error('disk on fire')],
	])('leaves %s to the error reply (they are not "not found")', (_label, err) => {
		expect(notFoundNoticeOf(err, 'abc')).toBeUndefined();
	});
});
