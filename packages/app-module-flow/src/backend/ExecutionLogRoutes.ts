import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import {
	type ExecutionLogsView,
	type FlowQueryService,
	type QueryParams,
	optionalInteger,
	optionalString,
} from 'flow-core';

import { replyWithError } from './ErrorReply.js';

export const DEFAULT_EXECUTION_LOG_LIMIT = 100;
export const MAX_EXECUTION_LOG_LIMIT = 1000;

// Lines about the run itself (started, step completed, failed...), not about one step: LogWriter.writeExecution.
const RUN_EVENTS_STEP = '__execution';

function stepLabel(stepId: string): string {
	return stepId === RUN_EVENTS_STEP ? `Run events (${RUN_EVENTS_STEP})` : stepId;
}

/** What an empty or incomplete list means, in one sentence; '' when there is nothing to explain. */
function noticeOf(logs: ExecutionLogsView, filtered: boolean): string {
	const sentences: string[] = [];
	if (logs.daysRead.length === 0) {
		sentences.push(
			`No daemon log file covers this run: the daemon writes one file per day under ${logs.logsDir} and rotates old ones away, or it never logged this run.`
		);
	} else if (logs.total === 0 && filtered) {
		sentences.push('No log line matches the filters: clear the step, level or text to see the run again.');
	} else if (logs.total === 0) {
		sentences.push(`The daemon logged nothing for this run in ${logs.logsDir}.`);
	}
	if (logs.unreadableLines > 0) {
		sentences.push(
			`${logs.unreadableLines} ${logs.unreadableLines === 1 ? 'line' : 'lines'} could not be read (damaged log file): this list may be incomplete.`
		);
	}
	return sentences.join(' ');
}

/**
 * `GET /executions/:id/logs?step&level&q&page&limit`: the daemon log lines of one execution (id or unique prefix), the
 * same lines `flow logs` shows for the day but narrowed to the run. `page` is zero-based from the END (page 0 = tail).
 *
 * The lines are served as the daemon wrote them. Nothing masks secrets before they reach the file (LogMasker is not
 * wired to the daemon's LogWriter), so this route exposes whatever a step printed, like `GET /logs` does.
 */
export function registerExecutionLogRoutes(ctx: ModuleContext, service: FlowQueryService): void {
	ctx.registerRoute('GET', '/executions/:id/logs', (req, reply) => {
		const { id } = req.params as { id: string };
		const query = (req as { query?: QueryParams }).query ?? {};
		try {
			const limit =
				optionalInteger(query, 'limit', { min: 1, max: MAX_EXECUTION_LOG_LIMIT }) ??
				DEFAULT_EXECUTION_LOG_LIMIT;
			const page = optionalInteger(query, 'page', { min: 0 }) ?? 0;
			const stepId = optionalString(query, 'step');
			const level = optionalString(query, 'level');
			const search = optionalString(query, 'q');
			const logs = service.readExecutionLogs(id, { limit, page, stepId, level, search });
			const notice = noticeOf(logs, stepId !== undefined || level !== undefined || search !== undefined);
			return reply.code(200).send({
				...logs,
				limit,
				offset: page * limit,
				stepOptions: logs.stepIds.map(value => ({ value, label: stepLabel(value) })),
				// Booleans for `$if`: an empty string or list is not falsy in every shell version.
				hasRecordedOutput: logs.recordedOutput !== '',
				notice,
				hasNotice: notice !== '',
			});
		} catch (err) {
			return replyWithError(reply, err);
		}
	});
}
