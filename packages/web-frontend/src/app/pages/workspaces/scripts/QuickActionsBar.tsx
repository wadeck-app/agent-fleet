import { useMemo, useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import type { ScriptProcessWithConfig } from '@shared/api/workspaceScripts.contract';
import { Settings, Square } from 'lucide-react';

import { workspaceScriptsApi } from './workspaceScripts.api';

interface QuickActionsBarProps {
	workspaceId: string;
	scripts: ScriptProcessWithConfig[];
	onConfigure: () => void;
}

/**
 * Top bar showing script statistics and quick actions
 *
 * Features:
 * - Running/total count indicator
 * - Stop All button (stops all running processes)
 * - Configure Scripts button (opens ConfigureScriptsDialog)
 */
export function QuickActionsBar({ workspaceId, scripts, onConfigure }: QuickActionsBarProps) {
	const [stoppingAll, setStoppingAll] = useState(false);

	// Count running scripts
	const runningCount = useMemo(() => {
		return scripts.filter(s => s.process?.status === 'running').length;
	}, [scripts]);

	const totalCount = scripts.length;

	const handleStopAll = async () => {
		if (!confirm(`Are you sure you want to stop all ${runningCount} running scripts?`)) {
			return;
		}

		try {
			setStoppingAll(true);

			// Stop all running scripts in parallel
			const runningScripts = scripts.filter(s => s.process?.status === 'running');
			await Promise.all(runningScripts.map(s => workspaceScriptsApi.stopScript(workspaceId, s.script.id)));
		} catch (err) {
			console.error('[QuickActionsBar] Failed to stop all scripts:', err);
			alert('Failed to stop some scripts. Please try again.');
		} finally {
			setStoppingAll(false);
		}
	};

	return (
		<div className="flex items-center gap-3 border-b border-border bg-card p-3">
			{/* Status Summary */}
			<div className="flex items-center gap-2 text-sm">
				<span className="font-semibold">{totalCount}</span>
				<span className="text-muted-foreground">configured scripts</span>
				{runningCount > 0 && (
					<>
						<span className="text-muted-foreground">•</span>
						<span className="flex items-center gap-1">
							<span
								className={`
          inline-block size-2 animate-pulse rounded-full bg-success
        `}
							/>
							<span className="font-semibold text-success">{runningCount}</span>
							<span className="text-muted-foreground">running</span>
						</span>
					</>
				)}
			</div>

			<div className="flex-1" />

			{/* Stop All Button */}
			{runningCount > 0 && (
				<Button variant="outline" size="sm" onClick={handleStopAll} disabled={stoppingAll}>
					<Square className="mr-1 size-4" />
					Stop All
				</Button>
			)}

			{/* Configure Scripts Button */}
			<Button variant="outline" size="sm" onClick={onConfigure}>
				<Settings className="mr-1 size-4" />
				Configure Scripts
			</Button>
		</div>
	);
}
