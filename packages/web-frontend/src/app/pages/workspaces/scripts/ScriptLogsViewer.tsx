import { useRef, useState } from 'react';

import { Input } from '@framework/components/forms/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { LoadingDots } from '@framework/components/loading/LoadingDots';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@framework/components/overlays/Dialog';
import { Button } from '@framework/components/primitives/Button';
import { Toggle } from '@framework/components/primitives/Toggle';
import type { ScriptLogEntry } from '@shared/api/workspaceScripts.contract';
import { Download, RefreshCw, Trash2 } from 'lucide-react';

import { useAutoScroll } from '@/app/pages/tasks/hooks/useAutoScroll';

import { ScriptLogEntry as ScriptLogEntryComponent } from './ScriptLogEntry';
import { workspaceScriptsApi } from './workspaceScripts.api';

type ScriptLogLevel = 'stdout' | 'stderr' | 'info' | 'error';

interface ScriptLogsViewerProps {
	workspaceId: string;
	scriptId: string;
	logs: ScriptLogEntry[];
	isRunning: boolean;
	isLoading: boolean;
	hasMore: boolean;
	isLoadingMore: boolean;
	onLoadMore: () => void;
	onRefresh: () => void;
	// Filters
	level?: ScriptLogLevel;
	search?: string;
	onLevelChange?: (level: ScriptLogLevel | undefined) => void;
	onSearchChange?: (search: string) => void;
}

/**
 * Main logs viewer component for script processes
 * Adapted from TaskLogsViewer with script-specific features
 */
export function ScriptLogsViewer({
	workspaceId,
	scriptId,
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
}: ScriptLogsViewerProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const { isAutoScrollEnabled, handleScroll, toggleAutoScroll } = useAutoScroll(logs, containerRef, isRunning);

	const [expandedLog, setExpandedLog] = useState<ScriptLogEntry | null>(null);
	const [isClearing, setIsClearing] = useState(false);

	const handleExport = () => {
		const jsonStr = JSON.stringify(logs, null, 2);
		const blob = new Blob([jsonStr], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `script-logs-${scriptId}-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const handleClearLogs = async () => {
		if (!confirm('Are you sure you want to clear all logs for this script?')) {
			return;
		}

		try {
			setIsClearing(true);
			await workspaceScriptsApi.clearScriptLogs(workspaceId, scriptId);
			onRefresh();
		} catch (err) {
			console.error('[ScriptLogsViewer] Failed to clear logs:', err);
			alert('Failed to clear logs. Please try again.');
		} finally {
			setIsClearing(false);
		}
	};

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center">
					<RefreshCw className={`mx-auto mb-2 size-8 animate-spin text-muted-foreground`} />
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
					<Select
						value={level || 'all'}
						onValueChange={value => onLevelChange(value === 'all' ? undefined : (value as ScriptLogLevel))}
					>
						<SelectTrigger size="sm" className="w-32 text-xs">
							<SelectValue placeholder="All Levels" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Levels</SelectItem>
							<SelectItem value="stdout">Stdout</SelectItem>
							<SelectItem value="stderr">Stderr</SelectItem>
							<SelectItem value="info">Info</SelectItem>
							<SelectItem value="error">Error</SelectItem>
						</SelectContent>
					</Select>
				)}

				<div className="flex-1" />

				{/* Status indicator */}
				{isRunning && (
					<span
						className="flex items-center gap-1 text-xs text-success"
						title="Script is currently running and receiving real-time log updates"
					>
						<span className={`inline-block size-2 animate-pulse rounded-full bg-success`} />
						Live
					</span>
				)}

				{/* Auto-scroll toggle */}
				<Toggle
					pressed={isAutoScrollEnabled}
					onPressedChange={toggleAutoScroll}
					variant="outline"
					size="sm"
					className={`
       gap-2 text-xs
       ${isAutoScrollEnabled ? `[&>span:last-child]:!text-success` : ''}
     `}
				>
					<span>Auto-scroll</span>
					<span className="font-semibold">{isAutoScrollEnabled ? 'ON' : 'OFF'}</span>
				</Toggle>

				{/* Refresh */}
				<Button variant="outline" size="sm" onClick={onRefresh}>
					<RefreshCw className="mr-1 size-4" />
					Refresh
				</Button>

				{/* Clear logs */}
				<Button variant="outline" size="sm" onClick={handleClearLogs} disabled={isClearing}>
					<Trash2 className="mr-1 size-4" />
					Clear
				</Button>

				{/* Export */}
				<Button variant="outline" size="sm" onClick={handleExport}>
					<Download className="mr-1 size-4" />
					Export
				</Button>
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
							<ScriptLogEntryComponent key={log.id} log={log} onExpand={setExpandedLog} />
						))}

						{/* Running indicator */}
						{isRunning && (
							<div className="flex justify-center py-4">
								<LoadingDots size="small" className="text-muted-foreground" />
							</div>
						)}

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

			{/* Expanded Log Dialog */}
			<Dialog open={expandedLog !== null} onOpenChange={open => !open && setExpandedLog(null)}>
				<DialogContent className="max-w-3xl">
					<DialogHeader>
						<DialogTitle>Log Entry Details</DialogTitle>
						<DialogDescription>
							Full details for this log entry. You can copy this information for debugging.
						</DialogDescription>
					</DialogHeader>

					<div className="max-h-[60vh] overflow-auto">
						<pre className="rounded bg-muted p-4 font-mono text-xs">
							{JSON.stringify(expandedLog, null, 2)}
						</pre>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
