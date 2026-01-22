import { useMemo, useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import type { ScriptProcessWithConfig } from '@shared/api/workspaceScripts.contract';
import { ExternalLink, Play, RefreshCw, Square, X } from 'lucide-react';

import { ScriptLogsViewer } from './ScriptLogsViewer';
import { ScriptSelector } from './ScriptSelector';
import { StatusIndicator } from './StatusIndicator';
import { useScriptLogs } from './useScriptLogs';
import { useScriptProcess } from './useScriptProcess';

interface ScriptPanelProps {
	panelId: string;
	scriptId: string | null;
	workspaceId: string;
	scripts: ScriptProcessWithConfig[];
	onScriptChange: (scriptId: string | null) => void;
	onRemove: () => void;
}

/**
 * Single panel component for displaying and controlling a script process
 *
 * Features:
 * - Script selector dropdown
 * - Process status indicator
 * - Start/stop/restart controls
 * - Link to script URL (if configured)
 * - Real-time logs viewer
 */
export function ScriptPanel({ panelId, scriptId, workspaceId, scripts, onScriptChange, onRemove }: ScriptPanelProps) {
	const [logLevel, setLogLevel] = useState<'stdout' | 'stderr' | 'info' | 'error' | undefined>(undefined);
	const [logSearch, setLogSearch] = useState<string | undefined>(undefined);

	// Find the selected script config
	const selectedScriptConfig = useMemo(() => scripts.find(s => s.script.id === scriptId), [scripts, scriptId]);

	const process = selectedScriptConfig?.process;
	const script = selectedScriptConfig?.script;

	// Process control hook
	const {
		start,
		stop,
		restart,
		starting,
		stopping,
		restarting,
		error: processError,
	} = useScriptProcess({
		workspaceId,
		scriptId: scriptId || '',
	});

	// Logs hook
	const {
		logs,
		isRunning,
		isLoading: logsLoading,
		hasMore,
		isLoadingMore,
		loadMore,
		refetch: refetchLogs,
	} = useScriptLogs({
		workspaceId,
		scriptId: scriptId || '',
		level: logLevel,
		search: logSearch,
		enabled: !!scriptId,
	});

	const canStart = process?.status === 'stopped' || process?.status === 'crashed' || process?.status === 'error';
	const canStop = process?.status === 'running' || process?.status === 'starting';
	const canRestart = process?.status === 'running';

	return (
		<div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card">
			{/* Panel Header */}
			<div className="flex items-center gap-2 border-b border-border bg-muted/30 p-3">
				{/* Script Selector */}
				<ScriptSelector
					workspaceId={workspaceId}
					scripts={scripts}
					value={scriptId}
					onChange={onScriptChange}
				/>

				{scriptId && script && (
					<>
						{/* Status Indicator */}
						<StatusIndicator status={process?.status} />

						{/* URL Link */}
						{script.url && (
							<Button variant="ghost" size="sm" asChild title={`Open ${script.url}`}>
								<a href={script.url} target="_blank" rel="noopener noreferrer">
									<ExternalLink className="size-4" />
								</a>
							</Button>
						)}

						{/* Control Buttons */}
						<div className="flex items-center gap-1">
							{canStart && (
								<Button
									variant="outline"
									size="sm"
									onClick={start}
									disabled={starting}
									title="Start script"
								>
									<Play className="size-4" />
								</Button>
							)}
							{canStop && (
								<Button
									variant="outline"
									size="sm"
									onClick={stop}
									disabled={stopping}
									title="Stop script"
								>
									<Square className="size-4" />
								</Button>
							)}
							{canRestart && (
								<Button
									variant="outline"
									size="sm"
									onClick={restart}
									disabled={restarting}
									title="Restart script"
								>
									<RefreshCw className="size-4" />
								</Button>
							)}
						</div>
					</>
				)}

				{/* Remove Panel Button */}
				<Button variant="ghost" size="sm" onClick={onRemove} title="Remove panel">
					<X className="size-4" />
				</Button>
			</div>

			{/* Panel Content */}
			<div className="flex-1 overflow-hidden">
				{scriptId ? (
					<>
						{processError && (
							<div className="border-b border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
								<strong>Error:</strong> {processError.message}
							</div>
						)}
						<ScriptLogsViewer
							workspaceId={workspaceId}
							scriptId={scriptId}
							logs={logs}
							isRunning={isRunning}
							isLoading={logsLoading}
							hasMore={hasMore}
							isLoadingMore={isLoadingMore}
							onLoadMore={loadMore}
							onRefresh={refetchLogs}
							level={logLevel}
							search={logSearch}
							onLevelChange={setLogLevel}
							onSearchChange={setLogSearch}
						/>
					</>
				) : (
					<div className="flex h-full items-center justify-center">
						<div className="text-center">
							<div className="mb-2 text-4xl text-muted-foreground">📜</div>
							<p className="text-sm text-muted-foreground">Select a script to view logs</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
