import { ErrorAlert } from '@framework/components/feedback/ErrorAlert';
import { LoadingState } from '@framework/components/feedback/LoadingState';
import { Button } from '@framework/components/primitives/Button';
import { MonospaceBlock } from '@framework/components/primitives/MonospaceBlock';

import { countPages, formatLogEntryLine, getExecutionLogNotices } from '../flowDaemonFormat';
import { useFlowExecutionLogs } from '../hooks/useFlowExecutionLogs';
import { FlowExecutionLogsControls } from './FlowExecutionLogsControls';

export interface FlowExecutionLogsSectionProps {
	executionId: string;
	/** Step the filter starts on (from the steps table). Remount the section to apply a new one. */
	initialStep?: string;
}

/** Daemon log lines of one execution, filterable by step, level and text, paged from the newest. */
export function FlowExecutionLogsSection({ executionId, initialStep }: FlowExecutionLogsSectionProps) {
	const {
		step,
		level,
		searchText,
		page,
		limit,
		hasActiveFilter,
		setStep,
		setLevel,
		setSearchText,
		setPage,
		logs,
		loading,
		error,
		refresh,
	} = useFlowExecutionLogs(executionId, initialStep);

	const pageCount = logs === null ? 1 : countPages(logs.total, limit);
	const notices = logs === null ? [] : getExecutionLogNotices(logs, hasActiveFilter);

	return (
		<div>
			<FlowExecutionLogsControls
				step={step}
				stepIds={logs?.stepIds ?? []}
				level={level}
				searchText={searchText}
				loading={loading}
				onStepChange={setStep}
				onLevelChange={setLevel}
				onSearchTextChange={setSearchText}
				onRefresh={refresh}
			/>

			{error !== null && <ErrorAlert message={error} />}
			{error === null && logs === null && <LoadingState message="Loading logs..." />}

			{logs !== null && (
				<>
					{notices.map(notice => (
						<p
							key={notice}
							role="status"
							className="mb-3 rounded-md border border-border bg-muted/40 p-3 text-sm"
						>
							{notice}
						</p>
					))}

					{logs.entries.length === 0 && notices.length === 0 && (
						<p role="status" className="mb-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
							{`No log line was recorded for this run in the day file(s) read: ${logs.daysRead.join(', ')}.`}
						</p>
					)}

					{logs.entries.length > 0 && (
						<>
							<div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
								<span>{`${logs.total} matching line(s) - page ${page + 1} of ${pageCount} (page 1 is the most recent)`}</span>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setPage(page + 1)}
									disabled={loading || page + 1 >= pageCount}
								>
									Older
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setPage(page - 1)}
									disabled={loading || page === 0}
								>
									Newer
								</Button>
							</div>
							<MonospaceBlock
								label="Execution daemon logs"
								text={logs.entries.map(formatLogEntryLine).join('\n')}
							/>
						</>
					)}

					{logs.recordedOutput !== '' && (
						<div className="mt-4">
							<h3 className="mb-2 text-base font-semibold">Output kept in the execution record</h3>
							<MonospaceBlock label="Output kept in the execution record" text={logs.recordedOutput} />
						</div>
					)}
				</>
			)}
		</div>
	);
}
