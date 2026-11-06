import type { ModuleRouteHandler } from '@wadeck-app/app-core-sdk';
import { ExecutionLookupError, UnknownPluginError, errorMessage } from 'flow-core';

import { replyWithError } from './ErrorReply.js';

type Reply = Parameters<ModuleRouteHandler>[1];

/**
 * What a page of one record answers when the record is not there (a stale link, a retention cleanup, a typo). The page
 * loads all its sources at once and one failed source leaves every other one undefined (the extension slots then print
 * their framework error), so the route answers 200 with this payload and the page shows `message` and a link to the
 * list instead of content. The content of a found record carries `found: true` (see the `$if` of each page).
 */
export interface NotFoundNotice {
	found: false;
	notFound: true;
	id: string;
	title: string;
	message: string;
	listLabel: string;
	listHref: string;
}

const EXECUTIONS_HREF = '/modules/flow/executions';
const PLUGINS_HREF = '/modules/flow/plugins';

function executionNotice(id: string): NotFoundNotice {
	return {
		found: false,
		notFound: true,
		id,
		title: 'Execution not found',
		message: `Execution ${id} was not found. It may have been removed by the retention cleanup, or the id is wrong.`,
		listLabel: 'See all executions',
		listHref: EXECUTIONS_HREF,
	};
}

function pluginNotice(id: string): NotFoundNotice {
	return {
		found: false,
		notFound: true,
		id,
		title: 'Plugin not found',
		message: `Plugin ${id} was not found. The id may be wrong.`,
		listLabel: 'See all plugins',
		listHref: PLUGINS_HREF,
	};
}

/**
 * The notice for a lookup failure that means "this record is not there", `undefined` for any other failure (an ambiguous
 * prefix, a corrupt file, a bad query, a bug), which the error reply keeps answering with its own status and message.
 * An id that cannot be an execution id is the same case for the user: the id is wrong. The text never holds the path of
 * the data folder that the lookup error carries (it stays in the server log, see {@link replyNotFoundOrError}).
 */
export function notFoundNoticeOf(err: unknown, id: string): NotFoundNotice | undefined {
	if (err instanceof ExecutionLookupError && (err.kind === 'not-found' || err.kind === 'invalid-id')) {
		return executionNotice(id);
	}
	if (err instanceof UnknownPluginError) {
		return pluginNotice(id);
	}
	return undefined;
}

/** Answers the not-found notice for a missing record (the detailed error goes to the server log), the error reply otherwise. */
export function replyNotFoundOrError(reply: Reply, err: unknown, id: string): void {
	const notice = notFoundNoticeOf(err, id);
	if (notice === undefined) {
		replyWithError(reply, err);
		return;
	}
	// eslint-disable-next-line no-console -- the module has no logger: the lookup error names the data folder, which the page must not show.
	console.warn(`[flow] ${notice.title}: ${errorMessage(err)}`);
	reply.code(200).send(notice);
}
