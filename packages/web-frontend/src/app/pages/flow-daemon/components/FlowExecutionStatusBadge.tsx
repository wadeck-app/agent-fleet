import { Badge } from '@framework/components/primitives/Badge';

import { getStatusBadgeVariant } from '../flowDaemonFormat';

export interface FlowExecutionStatusBadgeProps {
	status: string;
}

/** Status of an execution or of a step; an unknown status throws (see getStatusBadgeVariant). */
export function FlowExecutionStatusBadge({ status }: FlowExecutionStatusBadgeProps) {
	return <Badge variant={getStatusBadgeVariant(status)}>{status}</Badge>;
}
