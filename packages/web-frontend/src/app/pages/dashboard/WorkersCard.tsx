import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { UserCheck, UserX, Users } from 'lucide-react';

/**
 * ===========================================================================================
 * WORKERS CARD - Worker Metrics Display
 * ===========================================================================================
 *
 * Displays:
 * - Connected count (large, text-2xl)
 * - Idle count (green, text-xl)
 * - Busy count (orange, text-xl)
 *
 * Icons:
 * - Users (connected)
 * - UserCheck (idle)
 * - UserX (busy)
 *
 * Layout: 2-column grid for idle/busy
 *
 * ===========================================================================================
 */

export interface WorkersCardProps {
	connected: number;
	idle: number;
	busy: number;
}

export function WorkersCard({ connected, idle, busy }: WorkersCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Workers</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					{/* Connected Workers */}
					<div className="flex items-center gap-3">
						<Users className="size-5 text-muted-foreground" />
						<div className="flex flex-col gap-1">
							<span className="text-sm text-muted-foreground">Connected</span>
							<span className="text-2xl font-bold">{connected}</span>
						</div>
					</div>

					{/* Idle/Busy Grid */}
					<div className="grid grid-cols-2 gap-4">
						{/* Idle Workers */}
						<div className="flex items-center gap-3">
							<UserCheck className="size-5 text-green-600 dark:text-green-400" />
							<div className="flex flex-col gap-1">
								<span className="text-sm text-muted-foreground">Idle</span>
								<span className="text-xl font-semibold text-green-600 dark:text-green-400">{idle}</span>
							</div>
						</div>

						{/* Busy Workers */}
						<div className="flex items-center gap-3">
							<UserX className="size-5 text-orange-600 dark:text-orange-400" />
							<div className="flex flex-col gap-1">
								<span className="text-sm text-muted-foreground">Busy</span>
								<span className="text-xl font-semibold text-orange-600 dark:text-orange-400">{busy}</span>
							</div>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
