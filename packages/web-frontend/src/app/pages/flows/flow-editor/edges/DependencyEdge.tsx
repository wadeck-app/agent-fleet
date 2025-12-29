import { memo } from 'react';

import type { Position } from '@xyflow/react';
import { BaseEdge, getBezierPath } from '@xyflow/react';

export interface DependencyEdgeProps {
	id: string;
	sourceX: number;
	sourceY: number;
	targetX: number;
	targetY: number;
	sourcePosition: Position;
	targetPosition: Position;
}

export const DependencyEdge = memo(
	({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }: DependencyEdgeProps) => {
		const [edgePath] = getBezierPath({
			sourceX,
			sourceY,
			sourcePosition,
			targetX,
			targetY,
			targetPosition,
		});

		return (
			<>
				<defs>
					<marker
						id="arrow-dependency"
						viewBox="0 0 10 10"
						refX="8"
						refY="5"
						markerWidth="6"
						markerHeight="6"
						orient="auto-start-reverse"
					>
						<path d="M 0 0 L 10 5 L 0 10 z" fill="#888" />
					</marker>
				</defs>
				<BaseEdge
					id={id}
					path={edgePath}
					style={{ stroke: '#888', strokeWidth: 2 }}
					markerEnd="url(#arrow-dependency)"
				/>
			</>
		);
	}
);

DependencyEdge.displayName = 'DependencyEdge';
