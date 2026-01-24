import { Label } from '@framework/components/forms/Label';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { Separator } from '@framework/components/primitives/Separator';
import { ArrowRight, Trash2 } from 'lucide-react';

import type { FlowEdge, FlowNode } from './types';
import type { VariableType } from './types/flow-engine.types';

interface FlowEditorEdgePanelProps {
	selectedEdge: FlowEdge | null;
	nodes: FlowNode[];
	onDeleteEdge?: (edgeId: string) => void;
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
			return '#6b7280'; // gray-500
	}
}

export function FlowEditorEdgePanel({ selectedEdge, nodes, onDeleteEdge }: FlowEditorEdgePanelProps) {
	if (!selectedEdge) {
		return (
			<div
				className={`
      flex w-96 items-center justify-center border-l bg-card p-4
      text-muted-foreground
    `}
			>
				Select an edge to view details
			</div>
		);
	}

	const sourceNode = nodes.find(n => n.id === selectedEdge.source);
	const targetNode = nodes.find(n => n.id === selectedEdge.target);
	const edgeData = selectedEdge.data;

	// Get node names
	const getNodeName = (node: FlowNode | undefined) => {
		if (!node) return 'Unknown';
		if (node.type === 'constant') {
			// Constant nodes have different data structure
			const constantData = node.data as { label?: string };
			return constantData.label || 'Constant';
		}
		return node.data.step?.name || node.id;
	};

	const sourceNodeName = getNodeName(sourceNode);
	const targetNodeName = getNodeName(targetNode);

	return (
		<div className="w-96 overflow-auto border-l bg-card">
			<div className="space-y-4 p-4">
				{/* Header */}
				<div>
					<h3 className="mb-1 text-lg font-semibold">Edge Details</h3>
					<p className="text-xs text-muted-foreground">
						Type: <span className="font-mono">{edgeData?.edgeType || 'unknown'}</span>
					</p>
				</div>

				<Separator />

				{/* Data Flow Details (if dataflow edge) */}
				<div className="space-y-3">
					{edgeData?.edgeType === 'dataflow' && (
						<div className="space-y-2">
							<Label className="text-sm font-semibold">Data Flow</Label>
							<div className="space-y-3 rounded-md border bg-muted/30 p-3">
								{/* Source Variable */}
								{edgeData.sourceVarName && (
									<div>
										<div className="mb-1 text-xs text-muted-foreground">Source Variable</div>
										<div className="flex items-center gap-2">
											<code
												className={`
              flex-1 rounded bg-background px-2 py-1 font-mono text-xs
            `}
											>
												{edgeData.sourceVarName}
											</code>
											{edgeData.varType && (
												<Badge variant="outline" className="text-xs">
													{edgeData.varType}
												</Badge>
											)}
										</div>
									</div>
								)}

								{/* Target Variable */}
								{edgeData.targetVarName && (
									<div>
										<div className="mb-1 text-xs text-muted-foreground">Target Variable</div>
										<code className={`block rounded bg-background px-2 py-1 font-mono text-xs`}>
											{edgeData.targetVarName}
										</code>
									</div>
								)}

								{/* Type Color Indicator */}
								{edgeData.varType && (
									<div className="flex items-center gap-2">
										<div
											className="size-4 rounded-full border-2"
											style={{
												borderColor: getTypeColor(edgeData.varType),
												backgroundColor: `${getTypeColor(edgeData.varType)}33`,
											}}
										/>
										<span className="text-xs text-muted-foreground">
											Color coding for {edgeData.varType} type
										</span>
									</div>
								)}
							</div>
						</div>
					)}

					{/* Conditional Details (if conditional edge) */}
					{edgeData?.edgeType === 'conditional' && edgeData.condition && (
						<div className="space-y-2">
							<Label className="text-sm font-semibold">Condition</Label>
							<div className="rounded-md border bg-muted/30 p-3">
								<code className="block font-mono text-xs break-all">{edgeData.condition}</code>
							</div>
						</div>
					)}

					{/* Loop Details (if loop edge) */}
					{edgeData?.edgeType === 'loop' && edgeData.loopConfig && (
						<div className="space-y-2">
							<Label className="text-sm font-semibold">Loop Configuration</Label>
							<div className="rounded-md border bg-muted/30 p-3">
								<pre className="font-mono text-xs">{JSON.stringify(edgeData.loopConfig, null, 2)}</pre>
							</div>
						</div>
					)}

					{/* Dependency Edge Info */}
					{edgeData?.edgeType === 'dependency' && (
						<div className="space-y-2">
							<Label className="text-sm font-semibold">Dependency</Label>
							<div className="rounded-md border bg-muted/30 p-3">
								<p className="text-xs text-muted-foreground">
									This is a dependency edge. The target step will execute after the source step
									completes.
								</p>
							</div>
						</div>
					)}

					{/* Connection Info - Always show */}
					<div className="space-y-2">
						<Label className="text-sm font-semibold">Connection</Label>
						<div className="rounded-md border bg-muted/30 p-3">
							{/* Single line with From -> To */}
							<div className="flex items-center gap-2">
								<div className="flex-1">
									<div className="text-xs text-muted-foreground">From</div>
									<div className="text-sm font-medium">{sourceNodeName}</div>
									<div className="font-mono text-xs text-muted-foreground">{selectedEdge.source}</div>
								</div>
								<ArrowRight className="size-5 flex-shrink-0 text-muted-foreground" />
								<div className="flex-1">
									<div className="text-xs text-muted-foreground">To</div>
									<div className="text-sm font-medium">{targetNodeName}</div>
									<div className="font-mono text-xs text-muted-foreground">{selectedEdge.target}</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<Separator />

				{/* Actions */}
				{onDeleteEdge && (
					<Button
						variant="destructive"
						size="sm"
						onClick={() => onDeleteEdge(selectedEdge.id)}
						className="w-full"
					>
						<Trash2 className="mr-2 size-4" />
						Delete Connection
					</Button>
				)}
			</div>
		</div>
	);
}
