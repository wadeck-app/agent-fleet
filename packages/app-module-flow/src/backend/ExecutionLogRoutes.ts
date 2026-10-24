import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import {
	type ExecutionLogsView,
	type FlowQueryService,
	type QueryParams,
	optionalInteger,
	optionalString,
	stripForServing,
} from 'flow-core';

import { replyWithError } from './ErrorReply.js';
import { displayLogMessage } from './LogMessageDisplay.js';
import { buildLogTimeline } from './LogTimeline.js';

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
	if (logs.nestingError !== undefined) {
		sentences.push(`Sub-steps are not nested under their parent step: ${logs.nestingError}`);
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
 * Each message and the recorded output are served with ANSI stripped and nothing else: no secret guessing. Secrets are
 * masked by exact value when the daemon writes (declared secrets only); older lines may still hold some. The `q`
 * filter matches the stored message.
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
			const timeline = buildLogTimeline({
				runStartedAt: logs.startedAt,
				runCompletedAt: logs.completedAt,
				now: Date.now(),
				recordSteps: logs.steps,
				attemptStarts: logs.attemptStarts,
				stepLineCounts: logs.stepLineCounts,
				entries: logs.entries.map(entry => {
					const message = stripForServing(entry.message);
					return { ...entry, message, ...displayLogMessage(message) };
				}),
			});
			const recordedOutput = stripForServing(logs.recordedOutput);
			return reply.code(200).send({
				...logs,
				entries: timeline.entries,
				steps: timeline.steps,
				runDurationMs: timeline.runDurationMs,
				recordedOutput,
				limit,
				offset: page * limit,
				stepOptions: logs.stepIds.map(value => ({ value, label: stepLabel(value) })),
				// Booleans for `$if`: an empty string or list is not falsy in every shell version.
				hasRecordedOutput: recordedOutput !== '',
				notice,
				hasNotice: notice !== '',
			});
		} catch (err) {
			return replyWithError(reply, err);
		}
	});
}
