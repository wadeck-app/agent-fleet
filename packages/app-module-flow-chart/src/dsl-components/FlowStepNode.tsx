import { Handle, type NodeProps, Position } from '@xyflow/react';

import { statusStyle } from './StatusStyle.js';
import type { StepNode } from './ToFlowElements.js';

// Handles are the anchors of the edges, not controls: invisible, and not connectable (the chart is read-only).
const HANDLE_CLASS = '!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent';

/**
 * One step. The status is carried by the border and fill AND by a glyph and a word, so it reads without color.
 * A retry loop leaves from and returns to the side opposite to the flow (bottom when the flow runs left to right).
 */
export function FlowStepNode({ data, selected }: NodeProps<StepNode>) {
	const { step, direction } = data;
	const style = statusStyle(step.status);
	const horizontal = direction === 'LR';
	const details = [
		step.durationLabel,
		step.attempts !== undefined && step.attempts > 1 ? `${step.attempts} attempts` : undefined,
	]
		.filter(Boolean)
		.join(' - ');

	return (
		<div
			className={`flex h-full w-full flex-col justify-center rounded-lg border-2 px-3 py-2 text-left shadow-sm ${style.nodeClass} ${
				selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-bg' : ''
			}`}
			aria-label={`${step.label}, ${style.label}`}
			data-status={step.status ?? 'none'}
			data-testid={`step-${step.id}`}
		>
			<Handle
				id="in"
				type="target"
				position={horizontal ? Position.Left : Position.Top}
				isConnectable={false}
				className={HANDLE_CLASS}
			/>
			<Handle
				id="out"
				type="source"
				position={horizontal ? Position.Right : Position.Bottom}
				isConnectable={false}
				className={HANDLE_CLASS}
			/>
			<Handle
				id="loop-in"
				type="target"
				position={horizontal ? Position.Bottom : Position.Right}
				isConnectable={false}
				className={HANDLE_CLASS}
				style={horizontal ? { left: '30%' } : { top: '30%' }}
			/>
			<Handle
				id="loop-out"
				type="source"
				position={horizontal ? Position.Bottom : Position.Right}
				isConnectable={false}
				className={HANDLE_CLASS}
				style={horizontal ? { left: '70%' } : { top: '70%' }}
			/>

			<div className="flex items-center justify-between gap-2 text-xs">
				<span className="font-medium">
					<span aria-hidden="true">{style.glyph}</span> {style.label}
				</span>
				{step.kind === 'removed' ? (
					<span className="text-[10px] italic text-muted" title="This step is not in the current flow file">
						not in file
					</span>
				) : (
					<span className="rounded border border-border bg-surface px-1.5 text-[10px] uppercase text-muted">
						{step.kind.replace('_', ' ')}
					</span>
				)}
			</div>
			<div className="mt-1 truncate text-sm font-semibold" title={step.label}>
				{step.label}
			</div>
			<div className="mt-0.5 h-4 truncate text-xs">{details}</div>
		</div>
	);
}
