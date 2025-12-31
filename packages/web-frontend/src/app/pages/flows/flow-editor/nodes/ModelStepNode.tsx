import { memo } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { Handle, Position } from '@xyflow/react';
import { AlertCircle, Brain } from 'lucide-react';

import type { StepNodeData } from '../types';
import { cn } from '../utils/cn';

export interface ModelStepNodeProps {
	data: StepNodeData;
	selected?: boolean;
}

export const ModelStepNode = memo(({ data, selected }: ModelStepNodeProps) => {
	const { step, validationIssues, inputPorts = [], outputPorts = [] } = data;
	const hasErrors = validationIssues.some(i => i.severity === 'error');
	const hasWarnings = validationIssues.some(i => i.severity === 'warning');

	if (step.type !== 'model') return null;

	// Calculate dynamic node height based on port count
	const maxPorts = Math.max(inputPorts.length, outputPorts.length);
	const nodeHeight = Math.max(120, 60 + maxPorts * 24);
	// Position main handles below all ports to avoid overlap
	const mainHandleTop = 20 + maxPorts * 24 + 10;

	return (
		<div
			className={cn(
				'min-w-[200px] rounded-lg border-2 bg-card p-4 shadow-sm',
				'transition-all duration-200',
				selected && 'ring-2 ring-primary ring-offset-2',
				hasErrors && 'border-destructive',
				!hasErrors && hasWarnings && 'border-warning',
				!hasErrors &&
					!hasWarnings &&
					`
      border-border
      hover:border-primary/50
    `
			)}
			style={{ minHeight: `${nodeHeight}px` }}
		>
			{/* === DATA INPUT PORTS (Left side, above main handle) === */}
			{inputPorts.map((port, index) => (
				<Handle
					key={port.id}
					type="target"
					position={Position.Left}
					id={port.id}
					className={cn(
						'!h-3 !w-3 !bg-blue-500',
						port.uncertain &&
							`
       !border-2 !border-yellow-500
     `
					)}
					style={{
						top: `${20 + index * 24}px`,
					}}
					title={`${port.name} (${port.type})${port.uncertain ? ' - Warning: Output not defined' : ''}`}
				/>
			))}

			{/* Left Handle (main dependency input) */}
			<Handle
				type="target"
				position={Position.Left}
				id="left"
				className="!bg-primary"
				style={{ top: `${mainHandleTop}px` }}
			/>

			{/* Bottom Handle (loop target) */}
			<Handle
				type="target"
				position={Position.Bottom}
				id="bottom"
				className={`
     !bg-destructive
   `}
			/>

			{/* Header */}
			<div className="mb-3 flex items-center gap-2">
				<Brain className="size-4 text-primary" />
				<span className="truncate text-sm font-semibold">{step.name}</span>
			</div>

			{/* Model Badge */}
			<Badge variant="secondary" className="text-xs">
				{step.model}
			</Badge>

			{/* Conditional indicator */}
			{step.when && (
				<Badge variant="outline" className="ml-2 text-xs">
					conditional
				</Badge>
			)}

			{/* Validation Issues Indicator */}
			{validationIssues.length > 0 && (
				<div
					className={cn(
						'mt-3 flex items-center gap-1 text-xs',
						hasErrors ? 'text-destructive' : 'text-warning'
					)}
				>
					<AlertCircle className="size-3" />
					<span>
						{validationIssues.length} issue{validationIssues.length > 1 ? 's' : ''}
					</span>
				</div>
			)}

			{/* === DATA OUTPUT PORTS (Right side, above main handle) === */}
			{outputPorts.map((port, index) => (
				<Handle
					key={port.id}
					type="source"
					position={Position.Right}
					id={port.id}
					className="!h-3 !w-3 !bg-green-500"
					style={{
						top: `${20 + index * 24}px`,
					}}
					title={`${port.name} (${port.type})${port.required ? ' - Required' : ''}`}
				/>
			))}

			{/* Right Handle (main dependency output) */}
			<Handle
				type="source"
				position={Position.Right}
				id="right"
				className="!bg-primary"
				style={{ top: `${mainHandleTop}px` }}
			/>

			{/* Bottom Handle (loop source) */}
			<Handle
				type="source"
				position={Position.Bottom}
				id="bottom"
				className={`
     !bg-destructive
   `}
			/>
		</div>
	);
});

ModelStepNode.displayName = 'ModelStepNode';
