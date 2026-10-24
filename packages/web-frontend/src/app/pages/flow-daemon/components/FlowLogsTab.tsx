import { ErrorAlert } from '@framework/components/feedback/ErrorAlert';
import { LoadingState } from '@framework/components/feedback/LoadingState';
import { MonospaceBlock } from '@framework/components/primitives/MonospaceBlock';

import { useFlowLogs } from '../hooks/useFlowLogs';
import { FlowLogsControls } from './FlowLogsControls';

/** Daemon logs of one UTC day (last N lines, human-formatted). */
export function FlowLogsTab() {
	const { date, lines, setDate, setLines, logs, loading, error, refresh } = useFlowLogs();

	return (
		<div>
			<FlowLogsControls
				date={date}
				lines={lines}
				loading={loading}
				onDateChange={setDate}
				onLinesChange={setLines}
				onRefresh={refresh}
			/>

			{error !== null && <ErrorAlert message={error} />}
			{error === null && logs === null && <LoadingState message="Loading logs..." />}

			{logs !== null && !logs.exists && (
				<p className="rounded-md border border-border bg-muted/40 p-4 text-sm">
					{`No log file for this day (looked for ${logs.filePath}). Pick another day, or check that the daemon has run on that day.`}
				</p>
			)}
			{logs !== null && logs.exists && (
				<>
					<p className="mb-2 font-mono text-xs break-all text-muted-foreground">{logs.filePath}</p>
					<MonospaceBlock
						label="Daemon logs"
						text={logs.text === '' ? '(the log file is empty)' : logs.text}
					/>
				</>
			)}
		</div>
	);
}
