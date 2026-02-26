import type { ScriptProcessStatus } from '@shared/api/workspaceScripts.contract';
import { AlertTriangle, Circle, CircleDashed, CircleDot, type LucideIcon, X } from 'lucide-react';

interface StatusIndicatorProps {
	status?: ScriptProcessStatus;
	className?: string;
}

const STATUS_CONFIG: Record<
	ScriptProcessStatus,
	{
		label: string;
		icon: LucideIcon;
		color: string;
		bgColor: string;
	}
> = {
	running: {
		label: 'Running',
		icon: CircleDot,
		color: 'text-success',
		bgColor: 'bg-success/10',
	},
	stopped: {
		label: 'Stopped',
		icon: Circle,
		color: 'text-muted-foreground',
		bgColor: 'bg-muted/10',
	},
	starting: {
		label: 'Starting',
		icon: CircleDashed,
		color: 'text-warning',
		bgColor: 'bg-warning/10',
	},
	stopping: {
		label: 'Stopping',
		icon: CircleDashed,
		color: 'text-info',
		bgColor: 'bg-info/10',
	},
	crashed: {
		label: 'Crashed',
		icon: AlertTriangle,
		color: 'text-warning',
		bgColor: 'bg-warning/10',
	},
	error: {
		label: 'Error',
		icon: X,
		color: 'text-destructive',
		bgColor: 'bg-destructive/10',
	},
};

/**
 * Visual indicator for script process status
 *
 * Displays a colored icon and label based on the process status:
 * - Running: Green circle
 * - Stopped: Gray circle
 * - Starting: Yellow half-circle (animated)
 * - Stopping: Blue half-circle (animated)
 * - Crashed: Yellow warning
 * - Error: Red X
 */
export function StatusIndicator({ status, className = '' }: StatusIndicatorProps) {
	if (!status) {
		return null;
	}

	const config = STATUS_CONFIG[status];
	const IconComponent = config.icon;

	return (
		<div
			className={`
     flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium
     ${config.bgColor}
     ${config.color}
     ${className}
   `}
			title={config.label}
		>
			<IconComponent
				className={`
      size-3
      ${status === 'starting' || status === 'stopping' ? 'animate-pulse' : ''}
    `}
			/>
			<span>{config.label}</span>
		</div>
	);
}
