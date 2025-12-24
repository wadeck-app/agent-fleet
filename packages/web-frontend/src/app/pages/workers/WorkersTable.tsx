import { Badge } from '@framework/components/primitives/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import type { Worker } from '@shared/api/workers.contract';
import { Activity, AlertCircle, Circle } from 'lucide-react';

/**
 * ===========================================================================================
 * WORKERS TABLE - Workers List Display
 * ===========================================================================================
 *
 * Displays:
 * - Worker ID
 * - Type
 * - Connection status (badge with icon)
 * - State (idle/busy with icon)
 * - Current task ID (if busy)
 *
 * Icons:
 * - Circle (connected status - green/red)
 * - Activity (busy state - orange)
 * - AlertCircle (idle state - blue)
 *
 * ===========================================================================================
 */

export interface WorkersTableProps {
	workers: Worker[];
}

export function WorkersTable({ workers }: WorkersTableProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Workers List</CardTitle>
			</CardHeader>
			<CardContent>
				{workers.length === 0 ? (
					<div className="py-8 text-center text-sm text-muted-foreground">No workers available</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full">
							<thead>
								<tr
									className={`
           border-b text-left text-sm font-medium text-muted-foreground
         `}
								>
									<th className="pb-3">Worker ID</th>
									<th className="pb-3">Type</th>
									<th className="pb-3">Connection</th>
									<th className="pb-3">State</th>
									<th className="pb-3">Current Task</th>
								</tr>
							</thead>
							<tbody>
								{workers.map(worker => (
									<tr
										key={worker.workerId}
										className={`
            border-b
            last:border-b-0
          `}
									>
										<td className="py-3">
											<div className="flex items-center gap-2">
												<Circle
													className={`
               size-2
               ${
					worker.connected
						? `
        fill-green-600 text-green-600
        dark:fill-green-400 dark:text-green-400
      `
						: `
        fill-red-600 text-red-600
        dark:fill-red-400 dark:text-red-400
      `
				}
             `}
												/>
												<span className="font-mono text-sm">{worker.workerId}</span>
											</div>
										</td>
										<td className="py-3">
											<Badge variant={worker.connected ? 'default' : 'destructive'}>
												{worker.connected ? 'Connected' : 'Disconnected'}
											</Badge>
										</td>
										<td className="py-3">
											<div className="flex items-center gap-2">
												{worker.state === 'busy' ? (
													<>
														<Activity
															className={`
                 size-4 text-orange-600
                 dark:text-orange-400
               `}
														/>
														<span
															className={`
                 text-sm font-medium text-orange-600
                 dark:text-orange-400
               `}
														>
															Busy
														</span>
													</>
												) : (
													<>
														<AlertCircle
															className={`
                 size-4 text-blue-600
                 dark:text-blue-400
               `}
														/>
														<span
															className={`
                 text-sm font-medium text-blue-600
                 dark:text-blue-400
               `}
														>
															Idle
														</span>
													</>
												)}
											</div>
										</td>
										<td className="py-3">
											{worker.taskId ? (
												<span className="font-mono text-sm">{worker.taskId}</span>
											) : (
												<span className="text-sm text-muted-foreground">—</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
