import { MetricItem } from '@framework/components/data/MetricItem';
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
					<MetricItem
						icon={<Users />}
						label="Connected"
						value={connected}
						valueClassName="text-2xl font-bold"
					/>

					{/* Idle/Busy Grid */}
					<div className="grid grid-cols-2 gap-4">
						{/* Idle Workers */}
						<MetricItem
							icon={<UserCheck />}
							label="Idle"
							value={idle}
							iconClassName="size-5 text-green-600 dark:text-green-400"
							valueClassName="text-xl font-semibold text-green-600 dark:text-green-400"
						/>

						{/* Busy Workers */}
						<MetricItem
							icon={<UserX />}
							label="Busy"
							value={busy}
							iconClassName="size-5 text-orange-600 dark:text-orange-400"
							valueClassName="text-xl font-semibold text-orange-600 dark:text-orange-400"
						/>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
