import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { ErrorAlert } from '@framework/components/feedback/ErrorAlert';
import { LoadingState } from '@framework/components/feedback/LoadingState';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { Button } from '@framework/components/primitives/Button';
import { MonospaceBlock } from '@framework/components/primitives/MonospaceBlock';

import { useFlowExecutionDetail } from '../hooks/useFlowExecutionDetail';
import { FlowExecutionHeader } from './FlowExecutionHeader';
import { FlowExecutionLogsSection } from './FlowExecutionLogsSection';
import { FlowExecutionStepsTable } from './FlowExecutionStepsTable';

const EXECUTIONS_PATH = '/flow/executions';

interface LogsRequest {
	/** Step the logs section starts filtered on; undefined means every step. */
	step: string | undefined;
	/** Incremented per shortcut click: used as the section key so each click re-applies its step. */
	requestCount: number;
}

export interface FlowExecutionDetailContentProps {
	executionId: string;
}

/** Loads and displays one execution: header, steps, logs and the `flow show` text. */
export function FlowExecutionDetailContent({ executionId }: FlowExecutionDetailContentProps) {
	const navigate = useNavigate();
	const location = useLocation();
	const { data: execution, loading, error, refresh } = useFlowExecutionDetail(executionId);
	const [logsRequest, setLogsRequest] = useState<LogsRequest>({ step: undefined, requestCount: 0 });
	const logsSectionRef = useRef<HTMLDivElement>(null);

	const showStepLogs = (stepId: string) =>
		setLogsRequest(previous => ({ step: stepId, requestCount: previous.requestCount + 1 }));

	// Bring the logs into view after a step shortcut (not on the initial render)
	useEffect(() => {
		if (logsRequest.requestCount > 0) {
			logsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}, [logsRequest.requestCount]);

	// Go back in history to keep the list filters/page; a direct visit has no history to go back to
	const goBack = () => (location.key === 'default' ? navigate(EXECUTIONS_PATH) : navigate(-1));

	return (
		<Page>
			<PageHeader
				title={execution === null ? 'Flow execution' : `Execution of ${execution.flowId}`}
				onRefresh={refresh}
				isRefreshing={loading}
				action={
					<Button variant="outline" size="sm" onClick={goBack}>
						Back to executions
					</Button>
				}
			/>

			{error !== null && <ErrorAlert message={error} />}
			{error === null && execution === null && <LoadingState message="Loading execution..." />}

			{execution !== null && (
				<>
					<FlowExecutionHeader execution={execution} />

					<h2 className="mb-2 text-xl font-semibold">Steps</h2>
					<div className="mb-6">
						<FlowExecutionStepsTable steps={execution.steps} onShowStepLogs={showStepLogs} />
					</div>

					<div ref={logsSectionRef} className="mb-6">
						<h2 className="mb-2 text-xl font-semibold">Logs</h2>
						{/* Remounted on each step shortcut so that the filter starts on that step */}
						<FlowExecutionLogsSection
							key={logsRequest.requestCount}
							executionId={executionId}
							initialStep={logsRequest.step}
						/>
					</div>

					<h2 className="mb-2 text-xl font-semibold">Output (flow show)</h2>
					<MonospaceBlock label="flow show output" text={execution.text} />
				</>
			)}
		</Page>
	);
}
