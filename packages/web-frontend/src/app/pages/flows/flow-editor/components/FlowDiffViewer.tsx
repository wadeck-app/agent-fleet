import { Minus, Plus } from 'lucide-react';

import { cn } from '../utils/cn';
import type { DiffLine, DiffSummary } from '../utils/computeFlowDiff';

interface FlowDiffViewerProps {
	lines: DiffLine[];
	summary: DiffSummary;
}

export function FlowDiffViewer({ lines, summary }: FlowDiffViewerProps) {
	if (lines.length === 0) {
		return (
			<div className={`flex h-full items-center justify-center text-muted-foreground`}>No changes detected</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			{/* Summary Header */}
			<div className="flex gap-2 border-b bg-muted/30 p-2 text-xs">
				<span className="flex items-center gap-1 text-success">
					<Plus className="size-3" />+{summary.additions}
				</span>
				<span className="flex items-center gap-1 text-destructive">
					<Minus className="size-3" />−{summary.deletions}
				</span>
				<span className="flex items-center gap-1 text-warning">~{summary.modifications}</span>
			</div>

			{/* Diff Lines */}
			<div className="flex-1 overflow-auto font-mono text-xs">
				{lines.map((line, idx) => (
					<div
						key={idx}
						className={cn(
							'flex gap-2 px-3 py-0.5',
							line.type === 'added' && 'bg-success/10 text-success',
							line.type === 'removed' && `bg-destructive/10 text-destructive line-through`,
							line.type === 'modified' && 'bg-warning/10 text-warning',
							line.type === 'unchanged' && 'text-muted-foreground'
						)}
					>
						{/* Icon */}
						<span className="flex w-4 items-center justify-center">
							{line.type === 'added' && <Plus className="size-3 text-success" />}
							{line.type === 'removed' && <Minus className="size-3 text-destructive" />}
							{line.type === 'modified' && <span className="text-warning">~</span>}
						</span>

						{/* Line Number */}
						<span className="w-8 text-right opacity-50">{line.lineNumber}</span>

						{/* Content */}
						<span className="flex-1">{line.content}</span>
					</div>
				))}
			</div>
		</div>
	);
}
