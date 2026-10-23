import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import {
	type FlowQueryService,
	type QueryParams,
	optionalBoolean,
	optionalInteger,
	optionalString,
	stripForServing,
	todayLogDate,
} from 'flow-core';

import { replyWithError } from './ErrorReply.js';

export const DEFAULT_LOG_LINES = 200;
export const MAX_LOG_LINES = 5000;

/**
 * `GET /logs?date&lines&human` (`flow logs`): the tail of one day's daemon log, with ANSI stripped and
 * nothing else (no secret guessing; masking happens when the daemon writes). With `human=false`
 * the NDJSON is served as written, so an escape sequence stays in its JSON-escaped form.
 */
export function registerLogRoutes(ctx: ModuleContext, service: FlowQueryService): void {
	ctx.registerRoute('GET', '/logs', (req, reply) => {
		const query = (req as { query?: QueryParams }).query ?? {};
		try {
			const date = optionalString(query, 'date') ?? todayLogDate();
			const lines = optionalInteger(query, 'lines', { min: 1, max: MAX_LOG_LINES }) ?? DEFAULT_LOG_LINES;
			const human = optionalBoolean(query, 'human', true);
			const log = service.readLogs({ date, lines, human });
			return reply.code(200).send({ date, ...log, text: stripForServing(log.text) });
		} catch (err) {
			return replyWithError(reply, err);
		}
	});
}
