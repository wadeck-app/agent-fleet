import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { type FlowQueryService, stripErrorsForServing } from 'flow-core';

import { replyWithError } from './ErrorReply.js';
import { toWidgetBody } from './ExecutionWidgetBody.js';

/**
 * `GET /widgets/executions`: what the dashboard widget views read about the runs, computed by flow-core
 * (`FlowQueryService.digestRuns`) and flattened by {@link toWidgetBody}. Times are ISO 8601: the views format them.
 * The executions page keeps using `GET /executions`, whose contract this does not touch.
 */
export function registerExecutionWidgetRoutes(ctx: ModuleContext, service: FlowQueryService): void {
	ctx.registerRoute('GET', '/widgets/executions', (_req, reply) => {
		try {
			// Computed before reply.code(): a failure must not leave a 200 status set on the error answer.
			// The error texts are served before the digest cuts them to one short line (ANSI stripped).
			const body = toWidgetBody(service.digestRuns(stripErrorsForServing));
			return reply.code(200).send(body);
		} catch (err) {
			return replyWithError(reply, err);
		}
	});
}
