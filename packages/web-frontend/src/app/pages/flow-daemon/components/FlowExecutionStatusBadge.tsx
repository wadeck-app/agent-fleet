import { Badge } from '@framework/components/primitives/Badge';
import type { FlowExecutionSummary } from '@shared/api/flow-daemon.contract';

import { getStatusBadgeVariant } from '../flowDaemonFormat';

export interface FlowExecutionStatusBadgeProps {
	status: string;
	/** `FlowExecutionSummary.paused`: set while the run is paused (its status stays `running`). */
	paused?: FlowExecutionSummary['paused'];
}

/**
 * Status of an execution or of a step; an unknown status throws (see getStatusBadgeVariant).
 * A paused run says `paused` in warning, with the reason (and since when) as the tooltip: it is stored as `running` but
 * starts nothing until `flow unpause`.
 */
export function FlowExecutionStatusBadge({ status, paused }: FlowExecutionStatusBadgeProps) {
	if (paused !== undefined) {
		const reason = paused.reason === undefined ? '' : ` Reason: ${paused.reason}.`;
		return (
			<Badge
				variant="warning"
				title={`Paused since ${paused.since}: no new step starts, the steps already running finish.${reason}`}
			>
				paused
			</Badge>
		);
	}
	return <Badge variant={getStatusBadgeVariant(status)}>{status}</Badge>;
}
