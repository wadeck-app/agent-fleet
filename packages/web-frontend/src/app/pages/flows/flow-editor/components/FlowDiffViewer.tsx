import { Minus, Plus } from 'lucide-react';

import { cn } from '../utils/cn';
import type { DiffLine, DiffSegment, DiffSummary } from '../utils/computeFlowDiff';

interface FlowDiffViewerProps {
	lines: DiffLine[];
	summary: DiffSummary;
}

/**
 * Render character-level diff segments with highlighting
 */
function renderSegments(segments: DiffSegment[]) {
	return segments.map((segment, idx) => {
		if (segment.type === 'added') {
			return (
				<span key={idx} className="bg-success/30 text-success">
					{segment.text}
				</span>
			);
		}
		if (segment.type === 'removed') {
			return (
				<span key={idx} className="bg-destructive/30 text-destructive line-through">
					{segment.text}
				</span>
			);
		}
		return <span key={idx}>{segment.text}</span>;
	});
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
							'flex gap-2 border-l-2 px-3 py-0.5',
							line.type === 'added' && 'border-success bg-success/10 text-success',
							line.type === 'removed' &&
								`border-destructive bg-destructive/10 text-destructive line-through`,
							line.type === 'modified' && 'border-warning bg-muted/10',
							line.type === 'unchanged' && 'border-transparent text-muted-foreground'
						)}
					>
						{/* Icon */}
						<span className="flex w-4 flex-shrink-0 items-center justify-center">
							{line.type === 'added' && <Plus className="size-3 text-success" />}
							{line.type === 'removed' && <Minus className="size-3 text-destructive" />}
							{line.type === 'modified' && <span className="text-warning">~</span>}
						</span>

						{/* Line Number */}
						<span className="w-8 flex-shrink-0 text-right opacity-50">{line.lineNumber}</span>

						{/* Content */}
						<span className="flex-1 whitespace-pre">
							{line.segments ? renderSegments(line.segments) : line.content}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
