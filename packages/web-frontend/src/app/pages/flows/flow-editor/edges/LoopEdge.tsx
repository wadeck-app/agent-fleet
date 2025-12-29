import { memo } from 'react';

import type { Position } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';

import type { EdgeData } from '../types';

export interface LoopEdgeProps {
	id: string;
	sourceX: number;
	sourceY: number;
	targetX: number;
	targetY: number;
	sourcePosition: Position;
	targetPosition: Position;
	data?: EdgeData;
}

export const LoopEdge = memo(
	({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: LoopEdgeProps) => {
		// Create curved path with custom control points to route around nodes
		const offset = 150;
		const [edgePath] = getBezierPath({
			sourceX,
			sourceY,
			sourcePosition,
			targetX,
			targetY,
			targetPosition,
			curvature: 0.5, // More pronounced curve for better visibility
		});

		// Use CSS variable color for the arrow
		const warningColor = '#f59e0b'; // Fallback color

		// Position label to the right of the edge path, roughly in the middle vertically
		const labelX = Math.max(sourceX, targetX) + offset;
		const labelY = (sourceY + targetY) / 2;

		return (
			<>
				<defs>
					<marker
						id="arrow-loop"
						viewBox="0 0 10 10"
						refX="8"
						refY="5"
						markerWidth="6"
						markerHeight="6"
						orient="auto-start-reverse"
					>
						<path d="M 0 0 L 10 5 L 0 10 z" fill={warningColor} />
					</marker>
				</defs>
				<BaseEdge
					id={id}
					path={edgePath}
					style={{ stroke: warningColor, strokeWidth: 2, strokeDasharray: '5,5' }}
					markerEnd="url(#arrow-loop)"
				/>
				{data?.loopConfig && (
					<EdgeLabelRenderer>
						<div
							style={{
								position: 'absolute',
								transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
								pointerEvents: 'all',
							}}
							className="rounded bg-warning px-2 py-1 text-xs font-medium text-warning-foreground"
						>
							⚠️ on failure, retry (max: {data.loopConfig.maxIterations || 3})
						</div>
					</EdgeLabelRenderer>
				)}
			</>
		);
	}
);

LoopEdge.displayName = 'LoopEdge';
