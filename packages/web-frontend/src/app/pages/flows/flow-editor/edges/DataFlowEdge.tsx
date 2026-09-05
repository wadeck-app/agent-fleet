import { memo } from 'react';

import type { Position } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';

import { useEdgeSelection } from '../contexts/EdgeSelectionContext';
import type { VariableType } from '../types/flow-engine.types';

/**
 * Data for data flow edges
 */
export interface DataFlowEdgeData {
	edgeType: 'dataflow';
	sourceVarName?: string;
	targetVarName?: string;
	varType?: VariableType;
	showEdgeLabels?: boolean;
}

export interface DataFlowEdgeProps {
	id: string;
	sourceX: number;
	sourceY: number;
	targetX: number;
	targetY: number;
	sourcePosition: Position;
	targetPosition: Position;
	data?: DataFlowEdgeData;
	selected?: boolean;
}

/**
 * Get color for variable type
 */
function getTypeColor(type?: VariableType): string {
	switch (type) {
		case 'string':
			return '#3b82f6'; // blue-500
		case 'number':
			return '#10b981'; // green-500
		case 'boolean':
			return '#f59e0b'; // amber-500
		case 'object':
			return '#8b5cf6'; // purple-500
		default:
			throw new Error(`Unexpected switch value`); // gray-500
	}
}

/**
 * Data flow edge component - visualizes data connections between variable ports
 * These edges are stored in localStorage and not persisted to the backend
 */
export const DataFlowEdge = memo(
	({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: DataFlowEdgeProps) => {
		const { selectEdge } = useEdgeSelection();

		const [edgePath] = getBezierPath({
			sourceX,
			sourceY,
			sourcePosition,
			targetX,
			targetY,
			targetPosition,
		});

		const color = getTypeColor(data?.varType);

		// Check if inline labels are enabled (from edge data)
		const showInlineLabels = data?.showEdgeLabels === true;

		// Calculate middle position for label
		const labelX = (sourceX + targetX) / 2;
		const labelY = (sourceY + targetY) / 2;

		// Handle label click to select the edge
		const handleLabelClick = (e: React.MouseEvent) => {
			e.stopPropagation();
			e.preventDefault();
			selectEdge(id);
		};

		return (
			<>
				<defs>
					<marker
						id={`arrow-dataflow-${id}`}
						viewBox="0 0 10 10"
						refX="8"
						refY="5"
						markerWidth="5"
						markerHeight="5"
						orient="auto-start-reverse"
					>
						<path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
					</marker>
				</defs>
				<BaseEdge
					id={id}
					path={edgePath}
					style={{
						stroke: color,
						strokeWidth: selected ? 3 : 2,
						strokeDasharray: '5,5', // More visible dashed line
						opacity: 0.9,
					}}
					markerEnd={`url(#arrow-dataflow-${id})`}
				/>

				{/* Inline label (when toggle enabled) */}
				{showInlineLabels && data?.sourceVarName && (
					<EdgeLabelRenderer>
						<div
							onClick={handleLabelClick}
							style={{
								position: 'absolute',
								transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
								background: 'rgba(30, 41, 59, 0.95)', // Dark slate background
								border: `2px solid ${color}`,
								borderRadius: '6px',
								padding: '4px 10px',
								fontSize: '11px',
								fontFamily: 'monospace',
								fontWeight: selected ? 700 : 600,
								pointerEvents: 'auto',
								cursor: 'pointer',
								boxShadow: selected ? '0 3px 12px rgba(0,0,0,0.25)' : '0 2px 8px rgba(0,0,0,0.15)',
								whiteSpace: 'nowrap',
								color: '#e2e8f0', // Light text for contrast on dark background
								transition: 'all 0.2s ease',
							}}
							onMouseEnter={e => {
								e.currentTarget.style.transform = `translate(-50%, -50%) translate(${labelX}px,${labelY}px) scale(1.05)`;
							}}
							onMouseLeave={e => {
								e.currentTarget.style.transform = `translate(-50%, -50%) translate(${labelX}px,${labelY}px) scale(1)`;
							}}
						>
							{data.sourceVarName}: {data.varType || 'unknown'}
						</div>
					</EdgeLabelRenderer>
				)}
			</>
		);
	}
);

DataFlowEdge.displayName = 'DataFlowEdge';
