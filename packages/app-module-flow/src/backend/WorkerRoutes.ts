import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import {
	type FlowQueryService,
	type QueryParams,
	WORKER_LOG_DEFAULT_LINES,
	WORKER_LOG_MAX_LINES,
	optionalInteger,
	stripForServing,
} from 'flow-core';

import { replyWithError } from './ErrorReply.js';
import { replyNotFoundOrError } from './NotFoundNotice.js';

/**
 * `GET /workers` (`flow worker list`): live workers, plus the declared sources (never their credential
 * hashes: flow-core strips them) and the reason for an empty list. No daemon running is a normal 200.
 */
export function registerWorkerRoutes(ctx: ModuleContext, service: FlowQueryService): void {
	// The figure next to the Workers menu entry: connected workers only (declared sources are not workers).
	ctx.registerRoute('GET', '/workers/count', async (_req, reply) => {
		try {
			const { workers } = await service.listWorkers();
			return reply.code(200).send({ count: workers.length });
		} catch (err) {
			return replyWithError(reply, err);
		}
	});

	ctx.registerRoute('GET', '/workers', async (_req, reply) => {
		try {
			// Awaited before reply.code(): a failure must not leave a 200 status set on the error answer.
			const workers = await service.listWorkers();
			return reply.code(200).send(workers);
		} catch (err) {
			return replyWithError(reply, err);
		}
	});

	/**
	 * `GET /workers/:workerId/logs?lines=N` (default 200, at most 2000): the worker and the tail of the output the daemon
	 * captured for it (stdout and stderr, secrets masked when written). Only workers the daemon forked have one:
	 * `available: false` and a `reason` say why there is none (external worker, file removed), never an empty list alone.
	 * An unknown id answers the not-found notice (a worker that exited is not listed any more).
	 */
	ctx.registerRoute('GET', '/workers/:workerId/logs', async (req, reply) => {
		const { workerId } = req.params as { workerId: string };
		const query = (req as { query?: QueryParams }).query ?? {};
		try {
			const lines =
				optionalInteger(query, 'lines', { min: 1, max: WORKER_LOG_MAX_LINES }) ?? WORKER_LOG_DEFAULT_LINES;
			const { worker, logs } = await service.readWorkerLogs(workerId, lines);
			const served = logs.lines.map(line => stripForServing(line));
			return reply.code(200).send({
				...logs,
				found: true,
				lines: served,
				// One block of text for the page viewer, same lines.
				text: served.join('\n'),
				lineCount: served.length,
				requestedLines: lines,
				// Booleans for `$if`: the shell has no negation.
				hasLines: served.length > 0,
				lacksLines: served.length === 0,
				hasReason: logs.reason !== undefined,
				// A DataTable takes rows: one row.
				summary: [
					{
						workerId: worker.workerId,
						state: worker.state,
						pid: worker.pid,
						version: worker.version ?? '',
						sourceId: worker.sourceId ?? '',
						origin: worker.ephemeral ? 'started by the daemon' : 'external',
						hasUserInterface: worker.hasUserInterface,
					},
				],
			});
		} catch (err) {
			return replyNotFoundOrError(reply, err, workerId);
		}
	});
}
