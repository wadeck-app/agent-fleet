import { memo } from 'react';

import { Handle, Position } from '@xyflow/react';
import { CheckSquare, Hash, Type } from 'lucide-react';

import type { VariableType } from '../types/flow-engine.types';
import { cn } from '../utils/cn';

/**
 * Data for constant value nodes (UI-only, not stored in FlowDefinition)
 */
export interface ConstantNodeData extends Record<string, unknown> {
	value: string | number | boolean | object;
	type: VariableType;
	label?: string;
}

export interface ConstantNodeProps {
	data: ConstantNodeData;
	selected?: boolean;
}

/**
 * Get icon for variable type
 */
function getTypeIcon(type: VariableType) {
	switch (type) {
		case 'string':
			return <Type className="size-3" />;
		case 'number':
			return <Hash className="size-3" />;
		case 'boolean':
			return <CheckSquare className="size-3" />;
		case 'object':
			return <span className="font-mono text-xs">{'{}'}</span>;
		default:
			throw new Error(`Unexpected switch value`);
	}
}

/**
 * Format value for display
 */
function formatValue(value: string | number | boolean | object, type: VariableType): string {
	if (value === null || value === undefined) return 'null';
	if (type === 'string') return `"${value}"`;
	if (type === 'object') return JSON.stringify(value);
	return String(value);
}

/**
 * Constant value node - represents hardcoded values in the flow
 * These are UI-only nodes and not stored in the backend FlowDefinition
 */
export const ConstantNode = memo(({ data, selected }: ConstantNodeProps) => {
	const { value, type, label } = data;

	return (
		<div
			className={cn(
				'max-w-[120px] min-w-[80px] rounded-md border-2 bg-card p-2 shadow-sm',
				'transition-all duration-200',
				selected && 'ring-2 ring-primary ring-offset-2',
				`
      border-border
      hover:border-primary/50
    `
			)}
		>
			{/* Output handle only (constants produce values) */}
			<Handle
				type="source"
				position={Position.Right}
				id="output"
				className="!h-3 !w-3 !bg-accent"
				title={`Constant ${type}`}
			/>

			{/* Icon + Label */}
			<div className="mb-1 flex items-center gap-1">
				<div className="text-muted-foreground">{getTypeIcon(type)}</div>
				{label && <span className="truncate text-xs font-medium">{label}</span>}
			</div>

			{/* Value */}
			<div className="truncate font-mono text-xs text-muted-foreground" title={formatValue(value, type)}>
				{formatValue(value, type)}
			</div>
		</div>
	);
});

ConstantNode.displayName = 'ConstantNode';
