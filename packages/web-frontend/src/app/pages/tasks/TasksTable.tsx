import { useState } from 'react';

import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import type { Task } from '@shared/api/tasks.contract';
import {
	AlertCircle,
	CheckCircle2,
	Circle,
	CircleDashed,
	Clock,
	FileCheck,
	GitMerge,
	Trash2,
	XCircle,
} from 'lucide-react';

import { tasksService } from './TasksService';

/**
 * ===========================================================================================
 * TASKS TABLE - Tasks List Display
 * ===========================================================================================
 *
 * Displays:
 * - Task ID
 * - Description
 * - Status (badge with icon and color)
 * - Priority (badge)
 * - Assigned Worker
 * - Created/Updated dates
 *
 * Status Colors:
 * - IN_PROGRESS: blue
 * - REVIEW: purple
 * - DONE (APPROVED/MERGED): green
 * - BLOCKED: red
 * - FAILED (CANCELLED): red
 * - TODO: gray
 * - Other: gray
 *
 * ===========================================================================================
 */

export interface TasksTableProps {
	tasks: Task[];
	onTaskDeleted?: () => void;
}

// Helper to get status badge variant and icon
function getStatusDisplay(status: Task['status']): {
	variant: 'default' | 'secondary' | 'destructive' | 'outline';
	color: string;
	icon: React.ReactNode;
	label: string;
} {
	switch (status) {
		case 'in_progress':
		case 'testing':
			return {
				variant: 'default',
				color: 'text-info ',
				icon: <Clock className="size-3" />,
				label: 'In Progress',
			};
		case 'review':
		case 'reviewing':
			return {
				variant: 'default',
				color: 'text-primary ',
				icon: <FileCheck className="size-3" />,
				label: 'Review',
			};
		case 'approved':
			return {
				variant: 'default',
				color: 'text-success ',
				icon: <CheckCircle2 className="size-3" />,
				label: 'Approved',
			};
		case 'merged':
			return {
				variant: 'default',
				color: 'text-success ',
				icon: <GitMerge className="size-3" />,
				label: 'Merged',
			};
		case 'blocked':
			return {
				variant: 'destructive',
				color: 'text-destructive ',
				icon: <AlertCircle className="size-3" />,
				label: 'Blocked',
			};
		case 'cancelled':
			return {
				variant: 'destructive',
				color: 'text-destructive ',
				icon: <XCircle className="size-3" />,
				label: 'Failed',
			};
		case 'todo':
			return {
				variant: 'outline',
				color: 'text-gray-600 dark:text-gray-400',
				icon: <CircleDashed className="size-3" />,
				label: 'To Do',
			};
		case 'changes_requested':
			return {
				variant: 'outline',
				color: 'text-orange-600 dark:text-orange-400',
				icon: <AlertCircle className="size-3" />,
				label: 'Changes Requested',
			};
		default:
			return {
				variant: 'outline',
				color: 'text-gray-600 dark:text-gray-400',
				icon: <Circle className="size-3" />,
				label: status,
			};
	}
}

// Helper to get priority badge variant
function getPriorityVariant(priority: Task['priority']): 'default' | 'secondary' | 'destructive' | 'outline' {
	switch (priority) {
		case 'urgent':
			return 'destructive';
		case 'high':
			return 'default';
		case 'medium':
			return 'secondary';
		case 'low':
			return 'outline';
		default:
			return 'outline';
	}
}

// Format date to relative time or short date
function formatDate(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return 'Just now';
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;

	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function TasksTable({ tasks, onTaskDeleted }: TasksTableProps) {
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [taskToDelete, setTaskToDelete] = useState<string | null>(null);

	const handleDeleteClick = (taskId: string) => {
		setTaskToDelete(taskId);
		setDeleteDialogOpen(true);
	};

	const handleConfirmDelete = async () => {
		if (!taskToDelete) return;

		try {
			await tasksService.deleteTask(taskToDelete);
			onTaskDeleted?.();
		} catch (error) {
			console.error('Failed to delete task:', error);
			alert('Failed to delete task');
		} finally {
			setTaskToDelete(null);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Tasks List</CardTitle>
			</CardHeader>
			<CardContent>
				{tasks.length === 0 ? (
					<div className="py-8 text-center text-sm text-muted-foreground">No tasks available</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full">
							<thead>
								<tr
									className={`
           border-b text-left text-sm font-medium text-muted-foreground
         `}
								>
									<th className="pb-3">Task ID</th>
									<th className="pb-3">Description</th>
									<th className="pb-3">Status</th>
									<th className="pb-3">Priority</th>
									<th className="pb-3">Assigned To</th>
									<th className="pb-3">Flow ID</th>
									<th className="pb-3">Updated</th>
									<th className="pb-3">Actions</th>
								</tr>
							</thead>
							<tbody>
								{tasks.map(task => {
									const statusDisplay = getStatusDisplay(task.status);
									return (
										<tr
											key={task.id}
											className={`
             border-b
             last:border-b-0
           `}
										>
											<td className="py-3">
												<span className="font-mono text-sm">{task.id}</span>
											</td>
											<td className="py-3">
												<div className="max-w-md">
													<p className="line-clamp-2 text-sm">{task.description}</p>
												</div>
											</td>
											<td className="py-3">
												<Badge variant={statusDisplay.variant} className="gap-1">
													{statusDisplay.icon}
													<span>{statusDisplay.label}</span>
												</Badge>
											</td>
											<td className="py-3">
												<Badge
													variant={getPriorityVariant(task.priority)}
													className="capitalize"
												>
													{task.priority}
												</Badge>
											</td>
											<td className="py-3">
												{task.assignedWorker ? (
													<div className="text-sm">
														<div className="font-medium">
															{task.assignedWorker.workerId}
														</div>
													</div>
												) : (
													<span className="text-sm text-muted-foreground">Unassigned</span>
												)}
											</td>
											<td className="py-3">
												{task.flowId ? (
													<span className="font-mono text-sm">{task.flowId}</span>
												) : (
													<span className="text-sm text-muted-foreground">-</span>
												)}
											</td>
											<td className="py-3">
												<span className="text-sm text-muted-foreground">
													{formatDate(task.updatedAt)}
												</span>
											</td>
											<td className="py-3">
												<Button
													variant="ghost"
													size="sm"
													onClick={() => handleDeleteClick(task.id)}
													className="size-8 p-0"
												>
													<Trash2 className="size-4 text-destructive" />
												</Button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</CardContent>

			<AlertDialogWrapper
				open={deleteDialogOpen}
				onOpenChange={setDeleteDialogOpen}
				title="Delete Task"
				description="Are you sure you want to delete this task? This action cannot be undone."
				confirmLabel="Delete"
				cancelLabel="Cancel"
				variant="danger"
				onConfirm={handleConfirmDelete}
			/>
		</Card>
	);
}
