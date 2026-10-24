import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { Button } from '@framework/components/primitives/Button';

import { ALL_FILTER_VALUE, FLOW_LOG_LEVELS, formatLogStepLabel } from '../flowDaemonFormat';

export interface FlowExecutionLogsControlsProps {
	step: string | undefined;
	/** Every step that logged, as reported by the backend. */
	stepIds: string[];
	level: string | undefined;
	searchText: string;
	loading: boolean;
	onStepChange: (step: string | undefined) => void;
	onLevelChange: (level: string | undefined) => void;
	onSearchTextChange: (text: string) => void;
	onRefresh: () => void;
}

export function FlowExecutionLogsControls({
	step,
	stepIds,
	level,
	searchText,
	loading,
	onStepChange,
	onLevelChange,
	onSearchTextChange,
	onRefresh,
}: FlowExecutionLogsControlsProps) {
	// A step coming from the steps table may have no log line: keep it visible and selectable
	const stepChoices = step !== undefined && !stepIds.includes(step) ? [step, ...stepIds] : stepIds;

	return (
		<div className="mb-4 flex flex-wrap items-end gap-4">
			<div className="flex w-64 flex-col gap-1">
				<Label htmlFor="flow-execution-logs-step">Step</Label>
				<Select
					value={step ?? ALL_FILTER_VALUE}
					onValueChange={value => onStepChange(value === ALL_FILTER_VALUE ? undefined : value)}
				>
					<SelectTrigger id="flow-execution-logs-step">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL_FILTER_VALUE}>All steps</SelectItem>
						{stepChoices.map(option => (
							<SelectItem key={option} value={option}>
								{formatLogStepLabel(option)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex w-40 flex-col gap-1">
				<Label htmlFor="flow-execution-logs-level">Level</Label>
				<Select
					value={level ?? ALL_FILTER_VALUE}
					onValueChange={value => onLevelChange(value === ALL_FILTER_VALUE ? undefined : value)}
				>
					<SelectTrigger id="flow-execution-logs-level">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL_FILTER_VALUE}>All levels</SelectItem>
						{FLOW_LOG_LEVELS.map(option => (
							<SelectItem key={option} value={option}>
								{option}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex w-64 flex-col gap-1">
				<Label htmlFor="flow-execution-logs-search">Text</Label>
				<Input
					id="flow-execution-logs-search"
					type="search"
					placeholder="Search in messages"
					value={searchText}
					onChange={event => onSearchTextChange(event.target.value)}
				/>
			</div>
			<Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
				Refresh
			</Button>
		</div>
	);
}
