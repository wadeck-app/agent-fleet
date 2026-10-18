import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { type FlowQueryService, todayLogDate } from 'flow-core';

import { replyWithError } from './ErrorReply.js';
import { type QueryParams, optionalBoolean, optionalInteger, optionalString } from './QueryParameters.js';

export const DEFAULT_LOG_LINES = 200;
export const MAX_LOG_LINES = 5000;

/** `GET /logs?date&lines&human` (`flow logs`): the tail of one day's daemon log. */
export function registerLogRoutes(ctx: ModuleContext, service: FlowQueryService): void {
	ctx.registerRoute('GET', '/logs', (req, reply) => {
		const query = (req as { query?: QueryParams }).query ?? {};
		try {
			const date = optionalString(query, 'date') ?? todayLogDate();
			const lines = optionalInteger(query, 'lines', { min: 1, max: MAX_LOG_LINES }) ?? DEFAULT_LOG_LINES;
			const human = optionalBoolean(query, 'human', true);
			const log = service.readLogs({ date, lines, human });
			return reply.code(200).send({ date, ...log });
		} catch (err) {
			return replyWithError(reply, err);
		}
	});
}
