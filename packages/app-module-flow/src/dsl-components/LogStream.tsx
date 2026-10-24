import {
	LOG_STREAM_KEYS,
	type LogStreamEntry,
	type LogStreamProps,
	type LogStreamStep,
	parseLogStreamEntries,
	parseLogStreamSteps,
} from './LogStreamProps.js';
import { LogStreamView } from './LogStreamView.js';

function refusal(children: string) {
	return (
		<span role="alert" className="text-xs text-danger-text">
			{children}
		</span>
	);
}

/**
 * The lines of one execution log with their step identity, order and timing (grouping, navigation, time and density
 * are experiments of the dev dock, see LogStreamChoices). The route sends everything it needs: `entries` with the order,
 * depth and attempt of their step and their offset in the run, `steps` as the index of the run.
 *
 * Local component because a DataTable cannot colour a cell per row, group rows in collapsible sections, keep a sticky
 * index or fold runs of lines. Props are closed (entries, steps, runDurationMs, emptyMessage): anything else renders an
 * error, so nobody restyles it.
 */
export function LogStream({ entries, steps, runDurationMs, emptyMessage, unexpectedKeys }: LogStreamProps) {
	if (unexpectedKeys.length > 0) {
		return refusal(
			`flow:LogStream does not accept ${unexpectedKeys.join(', ')}: its style is fixed. Keep only ${LOG_STREAM_KEYS.join(', ')}.`
		);
	}
	if (typeof emptyMessage !== 'string') {
		return refusal(
			`flow:LogStream emptyMessage must be a text (for example emptyMessage: $sources.logs.notice), got ${JSON.stringify(emptyMessage) ?? 'nothing'}.`
		);
	}
	if (typeof runDurationMs !== 'number' || !Number.isFinite(runDurationMs) || runDurationMs < 0) {
		return refusal(
			`flow:LogStream runDurationMs must be a number of milliseconds >= 0 (for example runDurationMs: $sources.logs.runDurationMs), got ${JSON.stringify(runDurationMs) ?? 'nothing'}.`
		);
	}
	let parsedEntries: LogStreamEntry[];
	let parsedSteps: LogStreamStep[];
	try {
		parsedEntries = parseLogStreamEntries(entries);
		parsedSteps = parseLogStreamSteps(steps);
	} catch (err) {
		return refusal((err as Error).message);
	}
	return (
		<LogStreamView
			entries={parsedEntries}
			steps={parsedSteps}
			runDurationMs={runDurationMs}
			emptyMessage={emptyMessage}
		/>
	);
}
