import { Badge } from '@framework/components/primitives/Badge';
import type { Task } from '@shared/api/tasks.contract';

interface TaskInfoCardProps {
	task: Task;
	collapsible?: boolean;
	defaultOpen?: boolean;
}

/**
 * Parse input key that may contain default value syntax
 * @example
 * parseInputKey('reference_url || "None provided"')
 * // => { name: 'reference_url', defaultValue: 'None provided' }
 *
 * parseInputKey('completion_percent || 0')
 * // => { name: 'completion_percent', defaultValue: '0' }
 *
 * parseInputKey('simpleKey')
 * // => { name: 'simpleKey' }
 */
export function parseInputKey(key: string): { name: string; defaultValue?: string } {
	const parts = key.split(' || ');
	if (parts.length === 1) {
		return { name: key.trim() };
	}

	const name = parts[0].trim();
	let defaultValue = parts[1].trim();

	// Strip surrounding quotes (single or double)
	if (
		(defaultValue.startsWith("'") && defaultValue.endsWith("'")) ||
		(defaultValue.startsWith('"') && defaultValue.endsWith('"'))
	) {
		defaultValue = defaultValue.slice(1, -1);
	}

	return { name, defaultValue };
}

/**
 * Collapsible card with task details (for stacked layout)
 */
export function TaskInfoCard({ task, collapsible = true, defaultOpen: _defaultOpen = true }: TaskInfoCardProps) {
	const formatDate = (isoString: string) => {
		return new Date(isoString).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	};

	const getStatusVariant = (status: Task['status']) => {
		const statusMap: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
			approved: 'success',
			merged: 'success',
			in_progress: 'default',
			awaiting_user: 'warning',
			testing: 'default',
			review: 'secondary',
			reviewing: 'secondary',
			blocked: 'destructive',
			cancelled: 'destructive',
			changes_requested: 'warning',
		};
		return statusMap[status] || 'secondary';
	};

	const getPriorityVariant = (priority: Task['priority']) => {
		const priorityMap: Record<string, 'default' | 'secondary' | 'warning' | 'destructive'> = {
			urgent: 'destructive',
			high: 'warning',
			medium: 'default',
			low: 'secondary',
		};
		return priorityMap[priority] || 'secondary';
	};

	const renderInputValue = (value: unknown): string => {
		if (value === null || value === undefined) {
			return 'null';
		}
		if (typeof value === 'string') {
			return value;
		}
		if (typeof value === 'number' || typeof value === 'boolean') {
			return String(value);
		}
		return JSON.stringify(value, null, 2);
	};

	const hasFlowInputs = task.flowInputs && Object.keys(task.flowInputs).length > 0;

	return (
		<div className="rounded-lg border border-border bg-card">
			{/* Header (always visible) */}
			<div
				className={`
      flex items-center gap-4 p-4
      ${
			collapsible
				? `
      cursor-pointer
      hover:bg-muted/50
    `
				: ''
		}
    `}
			>
				<div className="flex-1">
					<div className="mb-2 flex items-center gap-2">
						<h2 className="text-lg font-semibold text-foreground">{task.description}</h2>
					</div>
					<div className="flex flex-wrap items-center gap-3 text-sm">
						<Badge variant={getStatusVariant(task.status)}>{task.status.replace('_', ' ')}</Badge>
						<Badge variant={getPriorityVariant(task.priority)}>{task.priority}</Badge>
						{task.assignedWorker && (
							<span className="text-muted-foreground">
								Worker: <span className="font-mono text-xs">{task.assignedWorker.workerId}</span>
							</span>
						)}
						{task.flowId && (
							<span className="text-muted-foreground">
								Flow: <span className="font-mono text-xs">{task.flowId}</span>
							</span>
						)}
						<span className="text-muted-foreground">Created: {formatDate(task.createdAt)}</span>
						<span className="text-muted-foreground">Updated: {formatDate(task.updatedAt)}</span>
					</div>
				</div>
			</div>

			{/* Flow Inputs Section */}
			{hasFlowInputs && (
				<div className="border-t border-border p-4">
					<h3 className="mb-3 text-sm font-semibold text-foreground">Flow Inputs</h3>
					<table className="w-full table-fixed text-sm">
						<tbody>
							{Object.entries(task.flowInputs!).map(([key, value]) => {
								const { name, defaultValue } = parseInputKey(key);
								const renderedValue = renderInputValue(value);
								const isEmpty = !renderedValue || renderedValue === 'null' || renderedValue === '';

								return (
									<tr
										key={key}
										className={`
            border-b border-border/50
            last:border-b-0
          `}
									>
										<td
											className={`
             w-1/4 py-1.5 pr-4 align-top text-xs font-medium whitespace-nowrap
             text-muted-foreground
           `}
										>
											{name}
											{defaultValue && (
												<span className="ml-1 text-muted-foreground/60">
													(default: {defaultValue})
												</span>
											)}
										</td>
										<td className="py-1.5 text-sm text-foreground">
											{isEmpty ? (
												<span className="text-muted-foreground/40">—</span>
											) : (
												<div className="break-words whitespace-pre-wrap">{renderedValue}</div>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
