import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import type { FlowQueryService } from 'flow-core';

import { replyWithError } from './ErrorReply.js';

/**
 * `GET /widgets/executions`: what the dashboard widget view reads about the runs, computed by flow-core
 * (`FlowQueryService.digestRuns`) and served as is. Times are ISO 8601: the view formats them. No error text travels,
 * so nothing here needs masking. The executions page keeps using `GET /executions`, whose contract this does not touch.
 */
export function registerExecutionWidgetRoutes(ctx: ModuleContext, service: FlowQueryService): void {
	ctx.registerRoute('GET', '/widgets/executions', (_req, reply) => {
		try {
			// Computed before reply.code(): a failure must not leave a 200 status set on the error answer.
			const digest = service.digestRuns();
			return reply.code(200).send(digest);
		} catch (err) {
			return replyWithError(reply, err);
		}
	});
}
