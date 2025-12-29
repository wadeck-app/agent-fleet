import { memo } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { Handle, Position } from '@xyflow/react';
import { AlertCircle, Terminal } from 'lucide-react';

import type { StepNodeData } from '../types';
import { cn } from '../utils/cn';

export interface ScriptStepNodeProps {
	data: StepNodeData;
	selected?: boolean;
}

export const ScriptStepNode = memo(({ data, selected }: ScriptStepNodeProps) => {
	const { step, validationIssues } = data;
	const hasErrors = validationIssues.some(i => i.severity === 'error');
	const hasWarnings = validationIssues.some(i => i.severity === 'warning');

	if (step.type !== 'script') return null;

	return (
		<div
			className={cn(
				'border-2 rounded-lg p-4 bg-card min-w-[200px] shadow-sm',
				'transition-all duration-200',
				selected && 'ring-2 ring-primary ring-offset-2',
				hasErrors && 'border-destructive',
				!hasErrors && hasWarnings && 'border-warning',
				!hasErrors && !hasWarnings && 'border-border hover:border-primary/50'
			)}
		>
			{/* Top Handle */}
			<Handle type="target" position={Position.Top} className="!bg-secondary" />

			{/* Header */}
			<div className="flex items-center gap-2 mb-3">
				<Terminal className="size-4 text-secondary-foreground" />
				<span className="font-semibold text-sm truncate">{step.name}</span>
			</div>

			{/* Script Badge */}
			<Badge variant="secondary" className="text-xs">
				script
			</Badge>

			{/* Conditional indicator */}
			{step.when && (
				<Badge variant="outline" className="text-xs ml-2">
					conditional
				</Badge>
			)}

			{/* Validation Issues Indicator */}
			{validationIssues.length > 0 && (
				<div
					className={cn(
						'mt-3 text-xs flex items-center gap-1',
						hasErrors ? 'text-destructive' : 'text-warning'
					)}
				>
					<AlertCircle className="size-3" />
					<span>
						{validationIssues.length} issue{validationIssues.length > 1 ? 's' : ''}
					</span>
				</div>
			)}

			{/* Bottom Handle */}
			<Handle type="source" position={Position.Bottom} className="!bg-secondary" />
		</div>
	);
});

ScriptStepNode.displayName = 'ScriptStepNode';
