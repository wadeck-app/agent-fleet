import {
	DEFAULT_HISTORY_LIMIT,
	DEFAULT_TAIL_CHARS,
	type FlowQueryService,
	InvalidQueryError,
	classifyFlowError,
	errorMessage,
	renderExecutionDetail,
	stripErrorsForServing,
	stripForServing,
	stripRecordForServing,
	toExecutionDetail,
	toExecutionSummary,
} from 'flow-core';

import {
	DEFAULT_EXECUTION_LOG_LIMIT,
	DEFAULT_LOG_LINES,
	type FlowExecutionDetailQuery,
	type FlowExecutionLogsQuery,
	type FlowExecutionsQuery,
	type FlowLogsQuery,
	FLOW_DAEMON_API_ROUTES as routes,
} from '@app/shared/api/flow-daemon.contract';
import type { FLOW_DAEMON_API_ROUTES } from '@app/shared/api/flow-daemon.contract';
import {
	BadRequestException,
	ConflictException,
	HttpException,
	InternalServerErrorException,
	NotFoundException,
	UnprocessableEntityException,
} from '@app/shared/exceptions/http-exceptions';

import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import type { LazyController } from '../utils/lazy-controller-plugin';

/**
 * ===========================================================================================
 * FLOW DAEMON CONTROLLER - read-only view of what the `flow` CLI shows
 * ===========================================================================================
 *
 * Presentation layer only: validated input -> FlowQueryService (flow-core) -> response.
 * No flow logic lives here, and nothing here starts, stops or modifies a flow, worker or daemon.
 * flow-core errors already carry actionable messages: they are passed through with a status
 * derived from classifyFlowError. Text that came from a terminal (errors, step output, logs) is served
 * without ANSI escape sequences, which a browser would render as replacement characters.
 *
 * ===========================================================================================
 */
export default class FlowDaemonController implements LazyController<typeof FLOW_DAEMON_API_ROUTES> {
	static routes = routes;

	constructor(private readonly service: FlowQueryService) {}

	configureRoutes(add: RouteWrapperFunc<typeof FLOW_DAEMON_API_ROUTES>) {
		add('GET', '/api/flow-daemon/flows', async () => this.guard(() => ({ flows: this.service.listFlows() })));

		add('GET', '/api/flow-daemon/executions', async ({ query }: { query: FlowExecutionsQuery }) =>
			this.guard(() => {
				const limit = query.limit ?? DEFAULT_HISTORY_LIMIT;
				const offset = query.page === undefined ? query.offset : query.page * limit;
				if (offset !== undefined && !Number.isSafeInteger(offset)) {
					throw new InvalidQueryError(
						`'page' is too large: page ${query.page} of ${limit} rows is not a valid offset.`
					);
				}
				const result = this.service.listExecutions({
					limit,
					offset,
					status: query.status,
					flow: query.flow,
					id: query.id,
				});
				return {
					items: result.items.map(record => toExecutionSummary(stripErrorsForServing(record))),
					total: result.total,
					limit,
					offset: offset ?? 0,
				};
			})
		);

		add(
			'GET',
			'/api/flow-daemon/executions/:id',
			async ({ params, query }: { params: { id: string }; query: FlowExecutionDetailQuery }) =>
				this.guard(() => {
					const found = this.service.getExecution(params.id);
					// Stripped before rendering: the tail of a failed step's output is cut after, never through, an escape sequence.
					const resolved = { ...found, record: stripRecordForServing(found.record) };
					const text = renderExecutionDetail(resolved, {
						tail: query.tail ?? DEFAULT_TAIL_CHARS,
						full: query.full ?? false,
					});
					return toExecutionDetail(resolved, text);
				})
		);

		add(
			'GET',
			'/api/flow-daemon/executions/:id/logs',
			async ({ params, query }: { params: { id: string }; query: FlowExecutionLogsQuery }) =>
				this.guard(() => {
					const limit = query.limit ?? DEFAULT_EXECUTION_LOG_LIMIT;
					const page = query.page ?? 0;
					const logs = this.service.readExecutionLogs(params.id, {
						limit,
						page,
						stepId: query.step,
						level: query.level,
						search: query.q,
					});
					return {
						executionId: logs.executionId,
						flowId: logs.flowId,
						entries: logs.entries.map(entry => ({ ...entry, message: stripForServing(entry.message) })),
						total: logs.total,
						stepIds: logs.stepIds,
						daysRead: logs.daysRead,
						unreadableLines: logs.unreadableLines,
						logsDir: logs.logsDir,
						recordedOutput: stripForServing(logs.recordedOutput),
						limit,
						offset: page * limit,
					};
				})
		);

		add('GET', '/api/flow-daemon/workers', async () => this.guard(() => this.service.listWorkers()));

		add('GET', '/api/flow-daemon/logs', async ({ query }: { query: FlowLogsQuery }) =>
			this.guard(() => {
				const log = this.service.readLogs({
					date: query.date,
					lines: query.lines ?? DEFAULT_LOG_LINES,
					human: query.human ?? false,
				});
				return { ...log, text: stripForServing(log.text) };
			})
		);

		add('GET', '/api/flow-daemon/plugins', async () => this.guard(() => ({ plugins: this.service.listPlugins() })));

		add('GET', '/api/flow-daemon/plugins/:id', async ({ params }: { params: { id: string } }) =>
			this.guard(() => this.service.describePlugin(params.id))
		);
	}

	/** Runs a flow-core query and turns what it throws into the HTTP exception the error hook understands. */
	private async guard<T>(query: () => T | Promise<T>): Promise<T> {
		try {
			return await query();
		} catch (err) {
			throw this.toHttpException(err);
		}
	}

	private toHttpException(err: unknown): Error {
		const category = classifyFlowError(err);
		const message = errorMessage(err);
		switch (category) {
			case 'invalid-request':
				return new BadRequestException(message);
			case 'not-found':
				return new NotFoundException(message);
			case 'conflict':
				return new ConflictException(message);
			case 'unreadable-data':
				return new UnprocessableEntityException(message);
			case 'upstream-failure':
				// The daemon answered, but not with a worker list: a gateway failure, not a bug here.
				return new HttpException(502, message, 'FLOW_DAEMON_UPSTREAM_FAILURE');
			case 'internal':
				return new InternalServerErrorException(message);
			case 'unknown':
				// Not a flow-core error: a bug. Rethrown unchanged so the global handler logs the stack.
				return err instanceof Error ? err : new Error(message);
			default: {
				const unreachable: never = category;
				throw new Error(`Unmapped FlowErrorCategory '${String(unreachable)}': add it to FlowDaemonController.`);
			}
		}
	}
}
