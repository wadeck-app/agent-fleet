import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import type { FlowQueryService } from 'flow-core';

import { replyWithError } from './ErrorReply.js';

/**
 * `GET /workers` (`flow worker list`): live workers, plus the declared sources (never their credential
 * hashes: flow-core strips them) and the reason for an empty list. No daemon running is a normal 200.
 */
export function registerWorkerRoutes(ctx: ModuleContext, service: FlowQueryService): void {
	ctx.registerRoute('GET', '/workers', async (_req, reply) => {
		try {
			// Awaited before reply.code(): a failure must not leave a 200 status set on the error answer.
			const workers = await service.listWorkers();
			return reply.code(200).send(workers);
		} catch (err) {
			return replyWithError(reply, err);
		}
	});
}
