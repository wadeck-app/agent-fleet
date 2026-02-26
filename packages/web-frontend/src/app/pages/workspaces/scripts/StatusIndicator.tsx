import type { ScriptProcessStatus } from '@shared/api/workspaceScripts.contract';

interface StatusIndicatorProps {
	status?: ScriptProcessStatus;
	className?: string;
}

const STATUS_CONFIG: Record<
	ScriptProcessStatus,
	{
		label: string;
		icon: string;
		color: string;
		bgColor: string;
	}
> = {
	running: {
		label: 'Running',
		icon: 'O',
		color: 'text-success',
		bgColor: 'bg-success/10',
	},
	stopped: {
		label: 'Stopped',
		icon: 'o',
		color: 'text-muted-foreground',
		bgColor: 'bg-muted/10',
	},
	starting: {
		label: 'Starting',
		icon: '~',
		color: 'text-warning',
		bgColor: 'bg-warning/10',
	},
	stopping: {
		label: 'Stopping',
		icon: '~',
		color: 'text-info',
		bgColor: 'bg-info/10',
	},
	crashed: {
		label: 'Crashed',
		icon: '!',
		color: 'text-warning',
		bgColor: 'bg-warning/10',
	},
	error: {
		label: 'Error',
		icon: 'X',
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
			<span
				className={`
      ${status === 'starting' || status === 'stopping' ? 'animate-pulse' : ''}
    `}
			>
				{config.icon}
			</span>
			<span>{config.label}</span>
		</div>
	);
}
