import { useMemo } from 'react';

import { Button } from '@framework/components/primitives/Button';
import type { ScriptProcessStatus } from '@shared/api/workspaceScripts.contract';
import { AlertTriangle, Circle, ExternalLink, Play, RefreshCw, Square } from 'lucide-react';

import { useWorkspaceScripts } from './useWorkspaceScripts';
import { workspaceScriptsApi } from './workspaceScripts.api';

interface WorkspaceScriptsInlineProps {
	workspaceId: string;
	onScriptClick: (scriptName: string) => void;
}

/**
 * Displays workspace scripts horizontally inline in the workspace panel header
 *
 * Features:
 * - Horizontal compact display of all scripts
 * - Status indicators (running, crashed, stopped)
 * - Clickable script names (opens Scripts tab)
 * - Clickable URLs (opens in new tab)
 * - Control buttons (Start/Stop/Restart) based on status
 *
 * Example:
 * Scripts: • backend(:3001) [Stop][Restart]  • frontend(:3000) [Stop][Restart]  ⚠ typecheck [Start]  ○ test [Start]
 */
export function WorkspaceScriptsInline({ workspaceId, onScriptClick }: WorkspaceScriptsInlineProps) {
	const { scripts, loading, error } = useWorkspaceScripts({ workspaceId });

	// Handle script control actions
	const handleStart = async (scriptId: string, event: React.MouseEvent) => {
		event.stopPropagation();
		try {
			await workspaceScriptsApi.startScript(workspaceId, scriptId);
		} catch (err) {
			console.error('[WorkspaceScriptsInline] Error starting script:', err);
		}
	};

	const handleStop = async (scriptId: string, event: React.MouseEvent) => {
		event.stopPropagation();
		try {
			await workspaceScriptsApi.stopScript(workspaceId, scriptId);
		} catch (err) {
			console.error('[WorkspaceScriptsInline] Error stopping script:', err);
		}
	};

	const handleRestart = async (scriptId: string, event: React.MouseEvent) => {
		event.stopPropagation();
		try {
			await workspaceScriptsApi.restartScript(workspaceId, scriptId);
		} catch (err) {
			console.error('[WorkspaceScriptsInline] Error restarting script:', err);
		}
	};

	// Get status indicator component
	const getStatusIcon = (status: ScriptProcessStatus) => {
		switch (status) {
			case 'running':
			case 'starting':
				return <Circle className="h-3 w-3 fill-success text-success" />;
			case 'error':
			case 'crashed':
				return <AlertTriangle className="h-3 w-3 text-warning" />;
			case 'stopped':
			case 'stopping':
				return <Circle className="h-3 w-3 text-muted-foreground" />;
			default:
				throw new Error(`Unknown script status: ${status as string}`);
		}
	};

	// Extract URL display info (port number from URL)
	const extractUrlInfo = (url?: string): string | null => {
		if (!url) {
			return null;
		}
		const match = url.match(/:(\d+)/);
		return match ? `:${match[1]}` : null;
	};

	// Determine if script is running
	const isRunning = (status?: ScriptProcessStatus): boolean => {
		return status === 'running' || status === 'starting';
	};

	// Sort scripts by order
	const sortedScripts = useMemo(() => {
		return [...scripts].sort((a, b) => a.script.order - b.script.order);
	}, [scripts]);

	if (loading || error || scripts.length === 0) {
		return null;
	}

	return (
		<div
			className={`
    flex flex-1 flex-wrap items-start gap-x-3 gap-y-1.5 text-xs
    text-muted-foreground
  `}
		>
			{sortedScripts.map(scriptConfig => {
				const { script, process } = scriptConfig;
				const status = process?.status || 'stopped';
				const running = isRunning(status);
				const urlInfo = extractUrlInfo(script.url);
				const displayName = script.displayName || script.scriptName;

				return (
					<div key={script.id} className="flex items-center gap-1.5">
						{/* Status Icon */}
						{getStatusIcon(status)}

						{/* Script Name (clickable) */}
						<Button
							onClick={e => {
								e.preventDefault();
								console.log('[WorkspaceScriptsInline] Script clicked:', script.scriptName);
								onScriptClick(script.scriptName);
							}}
							variant="link"
							className={`
         h-auto cursor-pointer p-0 underline-offset-2
         hover:underline
       `}
						>
							{displayName}
						</Button>

						{/* URL/Port (clickable if present) */}
						{script.url && urlInfo && (
							<a
								href={script.url}
								target="_blank"
								rel="noopener noreferrer"
								className={`
          flex items-center gap-0.5 text-primary
          hover:underline
        `}
								onClick={e => e.stopPropagation()}
							>
								<span>({urlInfo})</span>
								<ExternalLink className="h-3 w-3" />
							</a>
						)}

						{/* Control Buttons */}
						<div className="flex items-center gap-1">
							{running ? (
								<>
									<Button
										variant="ghost"
										size="sm"
										onClick={e => handleStop(script.id, e)}
										className="h-5 px-1.5 text-xs"
										title="Stop"
									>
										<Square className="h-3 w-3" />
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onClick={e => handleRestart(script.id, e)}
										className="h-5 px-1.5 text-xs"
										title="Restart"
									>
										<RefreshCw className="h-3 w-3" />
									</Button>
								</>
							) : (
								<Button
									variant="ghost"
									size="sm"
									onClick={e => handleStart(script.id, e)}
									className="h-5 px-1.5 text-xs"
									title="Start"
								>
									<Play className="h-3 w-3" />
								</Button>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}
