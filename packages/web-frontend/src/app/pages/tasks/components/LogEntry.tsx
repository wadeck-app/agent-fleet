import type { LogEntry as LogEntryType } from '@shared/api/tasks.contract';
import { Info } from 'lucide-react';

interface LogEntryProps {
	log: LogEntryType;
	onExpand?: (log: LogEntryType) => void;
}

/**
 * Individual log entry renderer
 * Displays timestamp, level, message with color coding
 */
export function LogEntry({ log, onExpand }: LogEntryProps) {
	const timestamp = new Date(log.timestamp).toLocaleTimeString('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	});

	// Color coding by log level
	const levelColors = {
		debug: 'text-muted-foreground',
		info: 'text-info',
		warning: 'text-warning',
		error: 'text-destructive',
	};

	const levelIcons = {
		debug: '🔍',
		info: 'ℹ️',
		warning: '⚠️',
		error: '❌',
	};

	const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

	return (
		<div
			data-log-id={log.id}
			className={`
     flex gap-3 border-b border-border px-4 py-2 font-mono text-xs
     hover:bg-muted/50
   `}
		>
			{/* Timestamp */}
			<span className="text-muted-foreground">{timestamp}</span>

			{/* Level icon + color */}
			<span className={levelColors[log.level]}>{levelIcons[log.level]}</span>

			{/* Step name */}
			<span className="text-primary">[{log.stepName}]</span>

			{/* Message */}
			<span className="flex-1 text-foreground">{log.message}</span>

			{/* Expand icon if has metadata - only icon is clickable, not selectable */}
			{hasMetadata && onExpand && (
				<span className="cursor-pointer select-none" title="View full log details">
					<Info
						className={`
        size-4 text-muted-foreground
        hover:text-info
      `}
						onClick={e => {
							e.stopPropagation();
							onExpand(log);
						}}
					/>
				</span>
			)}
		</div>
	);
}
