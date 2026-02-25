import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

import type { LogEntry as LogEntryType } from '@shared/api/tasks.contract';
import { ChevronsDownUp, ChevronsUpDown, Info } from 'lucide-react';
import remarkGfm from 'remark-gfm';

interface LogEntryProps {
	log: LogEntryType;
	onExpand?: (log: LogEntryType) => void;
	isSelected?: boolean;
	onClick?: (logId: string, shiftKey: boolean) => void;
}

const MESSAGE_TRUNCATE_LENGTH = 500;

/**
 * Individual log entry renderer
 * Displays timestamp, level, message with color coding
 * Supports selection for GitHub-style permalinks
 */
export function LogEntry({ log, onExpand, isSelected = false, onClick }: LogEntryProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const timestamp = new Date(log.timestamp).toLocaleTimeString('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	});

	// Detect stream-json event types
	const eventType = log.metadata?.eventType as string | undefined;
	const isToolUse = eventType === 'tool_use';

	// Color coding by log level
	const levelColors = {
		debug: 'text-muted-foreground',
		info: 'text-info',
		warning: 'text-warning',
		error: 'text-destructive',
	};

	// Level label mapping
	const levelLabels = {
		debug: '[DEBUG]',
		info: '[ INFO]',
		warning: '[ WARN]',
		error: '[ERROR]',
	};

	const levelLabel = levelLabels[log.level];

	// Parse tool name from message for tool_use events
	// Message format: "Tool: Read(file_path=/src/index.ts)"
	const renderMessage = () => {
		if (isToolUse && log.message.startsWith('Tool: ')) {
			const match = log.message.match(/^Tool: ([A-Za-z_]+)(\(.*\))$/);
			if (match) {
				return (
					<>
						Tool: <strong>{match[1]}</strong>
						<span className="text-muted-foreground">{match[2]}</span>
					</>
				);
			}
		}
		// Render markdown for non-tool_use messages
		const displayMessage =
			!isExpanded && log.message.length > MESSAGE_TRUNCATE_LENGTH
				? log.message.substring(0, MESSAGE_TRUNCATE_LENGTH) + '...'
				: log.message;

		return (
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				components={{
					// Paragraphs: render as div to allow block content, compact spacing
					p: ({ children }) => <div className="my-0.5">{children}</div>,
					// Headings: distinct sizes, bold, with slight top margin
					h1: ({ children }) => (
						<div
							className={`
       mt-2 mb-1 text-base font-bold text-foreground
     `}
						>
							{children}
						</div>
					),
					h2: ({ children }) => (
						<div
							className={`
       mt-2 mb-1 text-sm font-bold text-foreground
     `}
						>
							{children}
						</div>
					),
					h3: ({ children }) => (
						<div
							className={`
       mt-1.5 mb-0.5 text-xs font-bold text-foreground
     `}
						>
							{children}
						</div>
					),
					h4: ({ children }) => (
						<div className="mt-1 mb-0.5 text-xs font-semibold text-muted-foreground">{children}</div>
					),
					// Inline formatting
					strong: ({ children }) => <strong className="font-bold">{children}</strong>,
					em: ({ children }) => <em className="italic">{children}</em>,
					// Code: inline and block
					code: ({ children, className }) => {
						// Block code (inside <pre>) has a className with "language-xxx"
						const isBlock = className?.startsWith('language-');
						if (isBlock) {
							return <code className={className}>{children}</code>;
						}
						return (
							<code
								className={`
        rounded bg-muted/70 px-1 py-0.5 text-[0.85em] text-orange-300
      `}
							>
								{children}
							</code>
						);
					},
					pre: ({ children }) => (
						<pre
							className={`
        my-1 overflow-x-auto rounded border border-border bg-muted/50 p-2
        text-xs
      `}
						>
							{children}
						</pre>
					),
					// Links
					a: ({ href, children }) => (
						<a
							href={href}
							className={`
        text-info underline
        hover:text-info/80
      `}
							target="_blank"
							rel="noopener noreferrer"
						>
							{children}
						</a>
					),
					// Lists: list-inside keeps text aligned with surrounding paragraphs
					ul: ({ children }) => <ul className="my-0.5 list-inside list-disc">{children}</ul>,
					ol: ({ children }) => <ol className="my-0.5 list-inside list-decimal">{children}</ol>,
					li: ({ children }) => <li className="my-0">{children}</li>,
					// Blockquotes
					blockquote: ({ children }) => (
						<blockquote
							className={`
        my-1 border-l-2 border-muted-foreground/50 pl-3 text-muted-foreground
        italic
      `}
						>
							{children}
						</blockquote>
					),
					// Horizontal rule
					hr: () => <hr className="my-2 border-border" />,
					// Tables
					table: ({ children }) => <table className="my-1 border-collapse text-xs">{children}</table>,
					th: ({ children }) => (
						<th
							className={`
        border border-border bg-muted/50 px-2 py-1 text-left font-semibold
      `}
						>
							{children}
						</th>
					),
					td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
				}}
			>
				{displayMessage}
			</ReactMarkdown>
		);
	};

	const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;
	const shouldShowExpandButton = !isToolUse && log.message.length > MESSAGE_TRUNCATE_LENGTH;

	return (
		<div
			data-log-id={log.id}
			className={`
     flex items-start gap-3 px-4 py-1 font-mono text-sm
     hover:bg-muted/50
     ${onClick ? 'cursor-pointer' : ''}
     ${isSelected ? 'bg-primary/10' : ''}
   `}
			onClick={e => onClick?.(log.id, e.shiftKey)}
		>
			{/* Timestamp */}
			<span className="text-muted-foreground">{timestamp}</span>

			{/* Level label */}
			<span
				className={`
     font-mono
     ${levelColors[log.level]}
   `}
			>
				{levelLabel}
			</span>

			{/* Step name */}
			<span className="text-primary" title={log.stepId}>
				[{log.stepName}]
			</span>

			{/* Message */}
			<div className="min-w-0 flex-1 text-foreground">{renderMessage()}</div>

			{/* Action icons stacked vertically */}
			<div className="flex flex-col items-center gap-1">
				{hasMetadata && onExpand && (
					<span
						className="cursor-pointer select-none"
						title="View full log details"
						data-testid="log-details"
						onClick={e => {
							e.stopPropagation();
							onExpand(log);
						}}
					>
						<Info className="size-4 text-muted-foreground hover:text-info" />
					</span>
				)}
				{shouldShowExpandButton && (
					<span
						className="cursor-pointer select-none"
						title={isExpanded ? 'Collapse message' : 'Expand full message'}
						data-testid="log-expand"
						onClick={e => {
							e.stopPropagation();
							setIsExpanded(!isExpanded);
						}}
					>
						{isExpanded ? (
							<ChevronsDownUp className="size-4 text-muted-foreground hover:text-info" />
						) : (
							<ChevronsUpDown className="size-4 text-muted-foreground hover:text-info" />
						)}
					</span>
				)}
			</div>
		</div>
	);
}
