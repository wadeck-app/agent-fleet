import { Badge } from '@framework/components/primitives/Badge';
import type { FlowExecutionDetail } from '@shared/api/flow-daemon.contract';

import { formatCostUsd, formatStepCounts, formatTimestamp } from '../flowDaemonFormat';
import { FlowExecutionHeaderField as HeaderField } from './FlowExecutionHeaderField';
import { FlowExecutionStatusBadge } from './FlowExecutionStatusBadge';

export interface FlowExecutionHeaderProps {
	execution: FlowExecutionDetail;
}

/** Summary of one execution: identity, status, timing, cost, location of its files. */
export function FlowExecutionHeader({ execution }: FlowExecutionHeaderProps) {
	return (
		<dl
			className={`
     mb-6 grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-4
     sm:grid-cols-2
     lg:grid-cols-4
   `}
		>
			<HeaderField label="Flow">{execution.flowId}</HeaderField>
			<HeaderField label="Execution id">
				<span className="font-mono text-xs">{execution.executionId}</span>
			</HeaderField>
			<HeaderField label="Status">
				<FlowExecutionStatusBadge status={execution.status} />
			</HeaderField>
			<HeaderField label="Duration">{execution.duration}</HeaderField>
			<HeaderField label="Started">{formatTimestamp(execution.startedAt)}</HeaderField>
			<HeaderField label="Completed">{formatTimestamp(execution.completedAt)}</HeaderField>
			<HeaderField label="Failed / steps">
				{formatStepCounts(execution.failedStepCount, execution.stepCount)}
			</HeaderField>
			<HeaderField label="Total cost">{formatCostUsd(execution.totalCostUsd)}</HeaderField>
			<HeaderField label="Flow file">
				<span className="font-mono text-xs">{execution.flowFile}</span>
			</HeaderField>
			<HeaderField label="Execution file">
				<span className="font-mono text-xs">{execution.filePath}</span>
			</HeaderField>
			<HeaderField label="Project root">
				<span className="font-mono text-xs">{execution.projectRoot ?? '-'}</span>
			</HeaderField>
			<HeaderField label="Current steps">
				{execution.currentSteps.length === 0 ? '-' : execution.currentSteps.join(', ')}
			</HeaderField>
			{execution.lastError !== undefined && execution.lastError !== '' && (
				<div className="flex flex-col gap-0.5 sm:col-span-2 lg:col-span-4">
					<dt className="flex items-center gap-2 text-xs text-muted-foreground">
						Last error
						{execution.lastErrorRecovered && <Badge variant="outline">recovered</Badge>}
					</dt>
					<dd className="text-sm break-words whitespace-pre-wrap text-destructive">{execution.lastError}</dd>
				</div>
			)}
		</dl>
	);
}
