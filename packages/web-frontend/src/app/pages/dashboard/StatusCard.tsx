import { Badge } from '@framework/components/primitives/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { formatUptime } from '@framework/utils/formatting/formatUptime';
import type { OrchestratorStatus } from '@shared/api/dashboard.contract';
import { Activity, Clock, Package } from 'lucide-react';

/**
 * ===========================================================================================
 * STATUS CARD - Orchestrator Status Display
 * ===========================================================================================
 *
 * Displays:
 * - Status badge (green=ready, orange=starting/stopping, red=offline)
 * - Uptime (formatted as "Xh Ym")
 * - Version
 *
 * Icons:
 * - Activity (status)
 * - Clock (uptime)
 * - Package (version)
 *
 * ===========================================================================================
 */

export interface StatusCardProps {
	status: OrchestratorStatus;
	uptime: number; // milliseconds
	version: string;
}

/**
 * Get badge variant based on status
 */
function getStatusVariant(status: OrchestratorStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
	switch (status) {
		case 'ready':
			return 'default';
		case 'starting':
		case 'stopping':
			return 'secondary';
		case 'offline':
			return 'destructive';
		default:
			return 'outline';
	}
}

export function StatusCard({ status, uptime, version }: StatusCardProps) {
	const statusVariant = getStatusVariant(status);
	const uptimeFormatted = formatUptime(uptime);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Orchestrator Status</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					{/* Status */}
					<div className="flex items-center gap-3">
						<Activity className="size-5 text-muted-foreground" />
						<div className="flex flex-col gap-1">
							<span className="text-sm text-muted-foreground">Status</span>
							<Badge variant={statusVariant} className="w-fit">
								{status}
							</Badge>
						</div>
					</div>

					{/* Uptime */}
					<div className="flex items-center gap-3">
						<Clock className="size-5 text-muted-foreground" />
						<div className="flex flex-col gap-1">
							<span className="text-sm text-muted-foreground">Uptime</span>
							<span className="text-base font-medium">{uptimeFormatted}</span>
						</div>
					</div>

					{/* Version */}
					<div className="flex items-center gap-3">
						<Package className="size-5 text-muted-foreground" />
						<div className="flex flex-col gap-1">
							<span className="text-sm text-muted-foreground">Version</span>
							<span className="text-base font-medium">{version}</span>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
