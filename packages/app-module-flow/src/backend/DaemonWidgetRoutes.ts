import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { type FlowQueryService, summarizeDaemon } from 'flow-core';

import { replyWithError } from './ErrorReply.js';

/**
 * `GET /widgets/daemon`: the daemon and the number of live workers as short labels for the dashboard card. A stopped
 * daemon is a normal 200 (the labels say so and what to do); only a daemon that cannot be asked is an error reply.
 */
export function registerDaemonWidgetRoutes(ctx: ModuleContext, service: FlowQueryService): void {
	ctx.registerRoute('GET', '/widgets/daemon', async (_req, reply) => {
		try {
			// Awaited before reply.code(): a failure must not leave a 200 status set on the error answer.
			const listing = await service.listWorkers();
			return reply.code(200).send(summarizeDaemon(listing));
		} catch (err) {
			return replyWithError(reply, err);
		}
	});
}
