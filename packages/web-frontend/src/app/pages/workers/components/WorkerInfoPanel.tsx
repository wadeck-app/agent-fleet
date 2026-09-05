import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '@framework/components/primitives/Badge';
import { EditableText } from '@framework/features/inline-editing/EditableText';
import { useToast } from '@framework/features/toast/ToastContext';
import { cn } from '@framework/lib/utils';
import type { Worker } from '@shared/api/workers.contract';

import { workersService } from '@/app/pages/workers/WorkersService';

interface WorkerInfoPanelProps {
	worker: Worker;
	onRename?: () => void;
}

/**
 * Sidebar panel with full worker details (for split layout)
 */
export function WorkerInfoPanel({ worker, onRename }: WorkerInfoPanelProps) {
	const { showToast } = useToast();
	const [isSavingName, setIsSavingName] = useState(false);

	const formatDate = (isoString: string) => {
		return new Date(isoString).toISOString().replace('T', ' ').slice(0, 19);
	};

	const handleRenameWorker = async (newName: string) => {
		setIsSavingName(true);
		try {
			// Pass version for optimistic locking (1 for first rename when no metadata exists)
			const version = worker.version ?? 1;
			await workersService.renameWorker(worker.workerId, newName, version);
			await onRename?.();
			showToast('Worker renamed successfully', 'success');
		} catch (error) {
			console.error('Failed to rename worker:', error);
			throw error; // Re-throw to show error in EditableText
		} finally {
			setIsSavingName(false);
		}
	};

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto bg-card p-4">
			{/* Identity */}
			<div>
				<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Worker ID</h3>
				<p className="font-mono text-xs text-foreground">{worker.workerId}</p>
			</div>

			<div className={cn('transition-opacity', isSavingName && 'pointer-events-none opacity-50 blur-sm')}>
				<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Name</h3>
				<EditableText
					value={worker.name}
					placeholder="Set name..."
					onSave={handleRenameWorker}
					maxLength={100}
					displayClassName="text-sm font-medium"
				/>
			</div>

			{/* State & Connection */}
			<div className="flex gap-2">
				<div className="flex-1">
					<h3 className="mb-2 text-sm font-semibold text-muted-foreground">State</h3>
					<Badge variant={worker.state === 'busy' ? 'warning' : 'success'} className="font-medium">
						{worker.state === 'busy' ? 'Busy' : 'Idle'}
					</Badge>
				</div>
				<div className="flex-1">
					<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Connection</h3>
					<Badge variant={worker.connected ? 'success' : 'destructive'} className="font-medium">
						{worker.connected ? 'Connected' : 'Disconnected'}
					</Badge>
				</div>
			</div>

			{/* Workspace Info */}
			{worker.connected && (worker.projectId || worker.workspacePath) ? (
				<div>
					<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Workspace</h3>
					{worker.projectId && <p className="text-xs text-foreground">Project: {worker.projectId}</p>}
					{worker.workspacePath && (
						<p className="font-mono text-xs text-muted-foreground">{worker.workspacePath}</p>
					)}
				</div>
			) : !worker.connected ? (
				<div>
					<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Workspace</h3>
					<p className="text-xs text-muted-foreground">Offline</p>
				</div>
			) : null}

			{/* Current Task */}
			{worker.taskId && (
				<div>
					<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Current Task</h3>
					<Link to={`/tasks/${worker.taskId}`} className="font-mono text-xs text-primary hover:underline">
						{worker.taskId}
					</Link>
					{worker.taskStartedAt && (
						<p className="mt-1 text-xs text-muted-foreground">
							Started: {formatDate(worker.taskStartedAt)}
						</p>
					)}
				</div>
			)}

			{/* Version */}
			{worker.version && (
				<div>
					<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Version</h3>
					<p className="text-xs text-foreground">{worker.version}</p>
				</div>
			)}
		</div>
	);
}
