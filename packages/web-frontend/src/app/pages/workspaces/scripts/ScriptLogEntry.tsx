import type { ScriptLogEntry as ScriptLogEntryType } from '@shared/api/workspaceScripts.contract';

interface ScriptLogEntryProps {
	log: ScriptLogEntryType;
	onExpand?: (log: ScriptLogEntryType) => void;
}

/**
 * Individual script log entry renderer
 * Displays timestamp, level, message with color coding
 *
 * Adapted from LogEntry for script process logs
 */
export function ScriptLogEntry({ log, onExpand }: ScriptLogEntryProps) {
	const timestamp = new Date(log.timestamp).toLocaleTimeString('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	});

	// Color coding by log level
	const levelColors = {
		stdout: 'text-foreground',
		stderr: 'text-destructive',
		info: 'text-info',
		error: 'text-destructive',
	};

	const levelIcons = {
		stdout: '>',
		stderr: '!',
		info: 'i',
		error: 'X',
	};

	const levelLabels = {
		stdout: 'OUT',
		stderr: 'ERR',
		info: 'INFO',
		error: 'ERROR',
	};

	return (
		<div
			data-log-id={log.id}
			className={`
     flex gap-3 border-b border-border px-4 py-2 font-mono text-xs
     hover:bg-muted/50
     ${onExpand ? 'cursor-pointer' : ''}
   `}
			onClick={() => onExpand?.(log)}
		>
			{/* Timestamp */}
			<span className="text-muted-foreground">{timestamp}</span>

			{/* Level icon + color */}
			<span className={levelColors[log.level]} title={levelLabels[log.level]}>
				{levelIcons[log.level]}
			</span>

			{/* Level label */}
			<span
				className={`
      w-12
      ${levelColors[log.level]}
    `}
			>
				[{levelLabels[log.level]}]
			</span>

			{/* Message */}
			<span className="flex-1 break-words text-foreground">{log.message}</span>
		</div>
	);
}
