import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { Button } from '@framework/components/primitives/Button';

import { LINES_OPTIONS } from '../hooks/useFlowLogs';

export interface FlowLogsControlsProps {
	/** UTC day `YYYY-MM-DD`. */
	date: string;
	lines: number;
	loading: boolean;
	onDateChange: (date: string) => void;
	onLinesChange: (lines: number) => void;
	onRefresh: () => void;
}

export function FlowLogsControls({
	date,
	lines,
	loading,
	onDateChange,
	onLinesChange,
	onRefresh,
}: FlowLogsControlsProps) {
	return (
		<div className="mb-4 flex flex-wrap items-end gap-4">
			<div className="flex w-48 flex-col gap-1">
				<Label htmlFor="flow-logs-date">Day (UTC)</Label>
				<Input
					id="flow-logs-date"
					type="date"
					value={date}
					onChange={event => onDateChange(event.target.value)}
				/>
			</div>
			<div className="flex w-36 flex-col gap-1">
				<Label htmlFor="flow-logs-lines">Lines</Label>
				<Select value={String(lines)} onValueChange={value => onLinesChange(Number(value))}>
					<SelectTrigger id="flow-logs-lines">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{LINES_OPTIONS.map(option => (
							<SelectItem key={option} value={String(option)}>
								{option}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
				Refresh
			</Button>
		</div>
	);
}
