import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import type { FlowQueryService } from 'flow-core';

import { replyWithError } from './ErrorReply.js';

/** `GET /plugins` and `GET /plugins/:id` (`flow plugins list` / `flow plugins show`). The detail also carries `optionRows`: the same options as `{ name, description }` rows, since a DSL table renders arrays, not objects. */
export function registerPluginRoutes(ctx: ModuleContext, service: FlowQueryService): void {
	ctx.registerRoute('GET', '/plugins', (_req, reply) => {
		try {
			const plugins = service.listPlugins();
			return reply.code(200).send({ plugins });
		} catch (err) {
			return replyWithError(reply, err);
		}
	});

	ctx.registerRoute('GET', '/plugins/:id', (req, reply) => {
		const { id } = req.params as { id: string };
		try {
			const description = service.describePlugin(id);
			const optionRows = Object.entries(description.options).map(([name, optionDescription]) => ({
				name,
				description: optionDescription,
			}));
			return reply.code(200).send({ ...description, optionRows });
		} catch (err) {
			return replyWithError(reply, err);
		}
	});
}
