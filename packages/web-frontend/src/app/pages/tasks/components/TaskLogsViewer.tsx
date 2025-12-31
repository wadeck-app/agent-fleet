import { useRef, useState } from 'react';

import { Input } from '@framework/components/forms/Input';
import { Button } from '@framework/components/primitives/Button';
import { Toggle } from '@framework/components/primitives/Toggle';
import type { LogEntry as LogEntryType, LogLevel } from '@shared/api/tasks.contract';
import { Download, RefreshCw } from 'lucide-react';

import { useAutoScroll } from '../hooks/useAutoScroll';
import { LogEntry } from './LogEntry';

interface TaskLogsViewerProps {
	logs: LogEntryType[];
	isRunning: boolean;
	isLoading: boolean;
	hasMore: boolean;
	isLoadingMore: boolean;
	onLoadMore: () => void;
	onRefresh: () => void;
	// Filters
	level?: LogLevel;
	search?: string;
	onLevelChange?: (level: LogLevel | undefined) => void;
	onSearchChange?: (search: string) => void;
}

/**
 * Main logs viewer component with virtualization and filtering
 */
export function TaskLogsViewer({
	logs,
	isRunning,
	isLoading,
	hasMore,
	isLoadingMore,
	onLoadMore,
	onRefresh,
	level,
	search,
	onLevelChange,
	onSearchChange,
}: TaskLogsViewerProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const {
		isAutoScrollEnabled,
		handleScroll,
		toggleAutoScroll,
		scrollToBottom: _scrollToBottom,
	} = useAutoScroll(logs, containerRef, isRunning);

	const [expandedLog, setExpandedLog] = useState<LogEntryType | null>(null);

	const handleExport = () => {
		const jsonStr = JSON.stringify(logs, null, 2);
		const blob = new Blob([jsonStr], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `task-logs-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	};

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center">
					<RefreshCw className="mx-auto mb-2 size-8 animate-spin text-muted-foreground" />
					<p className="text-sm text-muted-foreground">Loading logs...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			{/* Controls Bar */}
			<div className="flex items-center gap-2 border-b border-border bg-card p-3">
				{/* Search */}
				{onSearchChange && (
					<Input
						type="text"
						placeholder="Search logs..."
						value={search || ''}
						onChange={e => onSearchChange(e.target.value)}
						className="w-64 text-xs"
					/>
				)}

				{/* Level Filter */}
				{onLevelChange && (
					<select
						value={level || ''}
						onChange={e => onLevelChange((e.target.value as LogLevel) || undefined)}
						className="rounded border border-input px-2 py-1 text-xs"
					>
						<option value="">All Levels</option>
						<option value="debug">🔍 Debug</option>
						<option value="info">ℹ️ Info</option>
						<option value="warning">⚠️ Warning</option>
						<option value="error">❌ Error</option>
					</select>
				)}

				<div className="flex-1" />

				{/* Auto-scroll toggle */}
				<Toggle
					pressed={isAutoScrollEnabled}
					onPressedChange={toggleAutoScroll}
					variant="outline"
					size="sm"
					className={`gap-2 text-xs ${isAutoScrollEnabled ? '[&>span:last-child]:!text-success' : ''}`}
				>
					<span>Auto-scroll</span>
					<span className="font-semibold">{isAutoScrollEnabled ? 'ON' : 'OFF'}</span>
				</Toggle>

				{/* Refresh */}
				<Button variant="outline" size="sm" onClick={onRefresh}>
					<RefreshCw className="mr-1 size-4" />
					Refresh
				</Button>

				{/* Export */}
				<Button variant="outline" size="sm" onClick={handleExport}>
					<Download className="mr-1 size-4" />
					Export
				</Button>

				{/* Status indicator */}
				{isRunning && (
					<span className="flex items-center gap-1 text-xs text-success">
						<span className="inline-block size-2 animate-pulse rounded-full bg-success" />
						Live
					</span>
				)}
			</div>

			{/* Logs Container */}
			<div ref={containerRef} className="flex-1 overflow-y-auto bg-muted/50" onScroll={handleScroll}>
				{logs.length === 0 ? (
					<div className="flex h-full items-center justify-center">
						<p className="text-sm text-muted-foreground">No logs available</p>
					</div>
				) : (
					<>
						{logs.map(log => (
							<LogEntry key={log.id} log={log} onExpand={setExpandedLog} />
						))}

						{/* Load More Button */}
						{hasMore && (
							<div className="flex justify-center p-4">
								<Button variant="outline" size="sm" onClick={onLoadMore} disabled={isLoadingMore}>
									{isLoadingMore ? 'Loading...' : 'Load More'}
								</Button>
							</div>
						)}
					</>
				)}
			</div>

			{/* Expanded Log Modal (simple version) */}
			{expandedLog && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
					onClick={() => setExpandedLog(null)}
				>
					<div
						className="max-h-[80vh] w-[800px] overflow-auto rounded-lg bg-card p-6"
						onClick={e => e.stopPropagation()}
					>
						<div className="mb-4 flex items-center justify-between">
							<h3 className="font-semibold">Log Details</h3>
							<Button variant="ghost" size="sm" onClick={() => setExpandedLog(null)}>
								×
							</Button>
						</div>
						<pre className="overflow-x-auto rounded bg-muted p-4 text-xs">
							{JSON.stringify(expandedLog, null, 2)}
						</pre>
					</div>
				</div>
			)}
		</div>
	);
}
