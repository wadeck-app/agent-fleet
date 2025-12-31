import { memo } from 'react';

import type { Position } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';

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
		// Use smooth step path for failure loops - routed below the normal flow
		const [edgePath] = getSmoothStepPath({
			sourceX,
			sourceY,
			sourcePosition,
			targetX,
			targetY,
			targetPosition,
			borderRadius: 12,
			offset: 30, // Offset to route below
		});

		// Red color for failures/errors
		const errorColor = '#ef4444'; // red-500

		// Position label below the edge path
		const labelX = (sourceX + targetX) / 2;
		const labelY = Math.max(sourceY, targetY) + 80; // Below both nodes

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
						<path d="M 0 0 L 10 5 L 0 10 z" fill={errorColor} />
					</marker>
				</defs>
				<BaseEdge
					id={id}
					path={edgePath}
					style={{ stroke: errorColor, strokeWidth: 2, strokeDasharray: '5,5' }}
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
							className={`
         rounded bg-destructive px-2 py-1 text-xs font-medium
         text-destructive-foreground
       `}
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
