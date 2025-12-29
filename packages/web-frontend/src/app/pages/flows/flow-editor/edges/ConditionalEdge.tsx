import { memo } from 'react';

import type { Position } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';

export interface ConditionalEdgeProps {
	id: string;
	sourceX: number;
	sourceY: number;
	targetX: number;
	targetY: number;
	sourcePosition: Position;
	targetPosition: Position;
	data?: {
		condition?: string;
	};
}

export const ConditionalEdge = memo(
	({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: ConditionalEdgeProps) => {
		const [edgePath] = getBezierPath({
			sourceX,
			sourceY,
			sourcePosition,
			targetX,
			targetY,
			targetPosition,
		});

		const conditionalColor = '#3b82f6'; // Blue color for conditionals

		return (
			<>
				<defs>
					<marker
						id="arrow-conditional"
						viewBox="0 0 10 10"
						refX="8"
						refY="5"
						markerWidth="6"
						markerHeight="6"
						orient="auto-start-reverse"
					>
						<path d="M 0 0 L 10 5 L 0 10 z" fill={conditionalColor} />
					</marker>
				</defs>
				<BaseEdge
					id={id}
					path={edgePath}
					style={{ stroke: conditionalColor, strokeWidth: 2, strokeDasharray: '3,3' }}
					markerEnd="url(#arrow-conditional)"
				/>
				{data?.condition && (
					<EdgeLabelRenderer>
						<div
							style={{
								position: 'absolute',
								transform: `translate(-50%, -50%) translate(${(sourceX + targetX) / 2}px, ${(sourceY + targetY) / 2}px)`,
								pointerEvents: 'all',
							}}
							className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
						>
							when: {data.condition}
						</div>
					</EdgeLabelRenderer>
				)}
			</>
		);
	}
);

ConditionalEdge.displayName = 'ConditionalEdge';
