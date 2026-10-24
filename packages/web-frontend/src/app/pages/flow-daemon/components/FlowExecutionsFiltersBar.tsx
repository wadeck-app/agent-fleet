import { Label } from '@framework/components/forms/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { FLOW_EXECUTION_STATUSES } from '@shared/api/flow-daemon.contract';

import { ALL_FILTER_VALUE, type FlowExecutionStatus, toStatusFilter } from '../flowDaemonFormat';

export interface FlowExecutionsFiltersBarProps {
	status: FlowExecutionStatus | undefined;
	flow: string | undefined;
	flowOptions: string[];
	onStatusChange: (status: FlowExecutionStatus | undefined) => void;
	onFlowChange: (flow: string | undefined) => void;
}

export function FlowExecutionsFiltersBar({
	status,
	flow,
	flowOptions,
	onStatusChange,
	onFlowChange,
}: FlowExecutionsFiltersBarProps) {
	// A flow coming from the URL may not be in the list (no execution anymore): keep it selectable/visible
	const flowChoices = flow !== undefined && !flowOptions.includes(flow) ? [flow, ...flowOptions] : flowOptions;

	return (
		<div className="mb-4 flex flex-wrap items-end gap-4">
			<div className="flex w-48 flex-col gap-1">
				<Label htmlFor="flow-executions-status-filter">Status</Label>
				<Select
					value={status ?? ALL_FILTER_VALUE}
					onValueChange={value => onStatusChange(toStatusFilter(value))}
				>
					<SelectTrigger id="flow-executions-status-filter">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL_FILTER_VALUE}>All statuses</SelectItem>
						{FLOW_EXECUTION_STATUSES.map(option => (
							<SelectItem key={option} value={option}>
								{option}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex w-64 flex-col gap-1">
				<Label htmlFor="flow-executions-flow-filter">Flow</Label>
				<Select
					value={flow ?? ALL_FILTER_VALUE}
					onValueChange={value => onFlowChange(value === ALL_FILTER_VALUE ? undefined : value)}
				>
					<SelectTrigger id="flow-executions-flow-filter">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL_FILTER_VALUE}>All flows</SelectItem>
						{flowChoices.map(option => (
							<SelectItem key={option} value={option}>
								{option}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
