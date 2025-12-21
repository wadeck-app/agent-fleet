import type { Workspace } from '@shared';
import { Badge } from '@framework/components/primitives/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { Folder, GitBranch } from 'lucide-react';

/**
 * ===========================================================================================
 * WORKSPACES TABLE - Workspaces List Display
 * ===========================================================================================
 *
 * Displays:
 * - Path
 * - Mode (development/production/staging)
 * - Status (active/locked/cleaning/error)
 * - Git Branch
 * - Tasks Count
 * - Last Used (relative time)
 *
 * Status colors:
 * - Active: green
 * - Locked: yellow
 * - Cleaning: blue
 * - Error: red
 *
 * ===========================================================================================
 */

export interface WorkspacesTableProps {
	workspaces: Workspace[];
}

function getStatusVariant(status: Workspace['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
	switch (status) {
		case 'active':
			return 'default';
		case 'locked':
			return 'secondary';
		case 'cleaning':
			return 'outline';
		case 'error':
			return 'destructive';
		default:
			return 'outline';
	}
}

function getModeColor(mode: Workspace['mode']): string {
	switch (mode) {
		case 'production':
			return 'text-red-600 dark:text-red-400';
		case 'staging':
			return 'text-yellow-600 dark:text-yellow-400';
		case 'development':
			return 'text-blue-600 dark:text-blue-400';
		default:
			return '';
	}
}

function formatRelativeTime(isoString: string): string {
	const date = new Date(isoString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return 'Just now';
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	return `${diffDays}d ago`;
}

export function WorkspacesTable({ workspaces }: WorkspacesTableProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Workspaces List</CardTitle>
			</CardHeader>
			<CardContent>
				{workspaces.length === 0 ? (
					<div className="py-8 text-center text-sm text-muted-foreground">No workspaces available</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full">
							<thead>
								<tr className="border-b text-left text-sm font-medium text-muted-foreground">
									<th className="pb-3">Path</th>
									<th className="pb-3">Mode</th>
									<th className="pb-3">Status</th>
									<th className="pb-3">Git Branch</th>
									<th className="pb-3">Tasks</th>
									<th className="pb-3">Last Used</th>
								</tr>
							</thead>
							<tbody>
								{workspaces.map(workspace => (
									<tr key={workspace.id} className="border-b last:border-b-0">
										<td className="py-3">
											<div className="flex items-center gap-2">
												<Folder className="size-4 text-muted-foreground" />
												<span className="font-mono text-xs">{workspace.path}</span>
											</div>
										</td>
										<td className="py-3">
											<span className={`text-sm font-medium capitalize ${getModeColor(workspace.mode)}`}>
												{workspace.mode}
											</span>
										</td>
										<td className="py-3">
											<Badge variant={getStatusVariant(workspace.status)} className="capitalize">
												{workspace.status}
											</Badge>
										</td>
										<td className="py-3">
											{workspace.gitBranch ? (
												<div className="flex items-center gap-1">
													<GitBranch className="size-3 text-muted-foreground" />
													<span className="font-mono text-xs">{workspace.gitBranch}</span>
												</div>
											) : (
												<span className="text-sm text-muted-foreground">-</span>
											)}
										</td>
										<td className="py-3">
											<span className="text-sm font-medium">{workspace.tasksCount}</span>
										</td>
										<td className="py-3">
											<span className="text-sm text-muted-foreground">{formatRelativeTime(workspace.lastUsed)}</span>
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
