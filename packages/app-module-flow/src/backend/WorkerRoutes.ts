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
			const result = await service.listWorkers();
			return reply.code(200).send({
				...result,
				// The origin as words, for the table (the summary only has the `ephemeral` flag).
				workers: result.workers.map(worker => ({
					...worker,
					origin: worker.ephemeral ? 'started by the daemon' : 'external',
				})),
			});
		} catch (err) {
			return replyWithError(reply, err);
		}
	});

	/**
	 * `GET /workers/recent`: the workers that are not connected (any more) but whose log is still on disk (7 days), newest
	 * first, each with its origin, size, last write and last line. Read from the files: works with no daemon running.
	 */
	ctx.registerRoute('GET', '/workers/recent', async (_req, reply) => {
		try {
			const recent = await service.listRecentWorkers();
			return reply.code(200).send({
				recent: recent.map(entry => ({ ...entry, lastLine: stripForServing(entry.lastLine) })),
				count: recent.length,
			});
		} catch (err) {
			return replyWithError(reply, err);
		}
	});

	/**
	 * `GET /workers/:workerId/logs?lines=N` (default 200, at most 2000): the tail of the log the daemon keeps for a worker,
	 * secrets masked when written. `:workerId` is a live worker's id, or the key of the log of a worker that is gone (a pid
	 * for a forked worker, a worker id otherwise; see `GET /workers/recent`): an exited worker (`state: 'exited'`) is
	 * served from its file, also when no daemon runs. A worker the daemon forked has its process output; any other has what
	 * the daemon observed of it (connection, steps) and, when it ships them, its own output lines.
	 * `available: false` and a `reason` say why there is nothing (file removed, daemon predates the logs), never an empty
	 * list alone. An id that is neither live nor a key answers the not-found notice.
	 */
	ctx.registerRoute('GET', '/workers/:workerId/logs', async (req, reply) => {
		const { workerId } = req.params as { workerId: string };
		const query = (req as { query?: QueryParams }).query ?? {};
		try {
			const lines =
				optionalInteger(query, 'lines', { min: 1, max: WORKER_LOG_MAX_LINES }) ?? WORKER_LOG_DEFAULT_LINES;
			const { worker, key, origin, logs } = await service.readWorkerLogs(workerId, lines);
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
				live: worker !== undefined,
				// A DataTable takes rows: one row.
				summary: [
					{
						workerId: worker?.workerId ?? key,
						state: worker?.state ?? 'exited',
						heldBy: worker?.heldBy ?? '',
						pid: worker?.pid ?? (origin === 'started by the daemon' ? Number(key) : ''),
						version: worker?.version ?? '',
						sourceId: worker?.sourceId ?? '',
						origin,
						hasUserInterface: worker?.hasUserInterface ?? '',
						sizeBytes: logs.sizeBytes,
						lastWritten: logs.modifiedAt ?? '',
					},
				],
			});
		} catch (err) {
			return replyNotFoundOrError(reply, err, workerId);
		}
	});
}
