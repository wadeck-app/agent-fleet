import { useState } from 'react';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@framework/components/overlays/Dialog';
import { Button } from '@framework/components/primitives/Button';
import type { FlowProposal } from '@shared/api/flow-proposals.contract';
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { FlowEditorPropertiesPanel } from '../flows/flow-editor/FlowEditorPropertiesPanel';
import { edgeTypes } from '../flows/flow-editor/edges/EdgeTypes';
import { nodeTypes } from '../flows/flow-editor/nodes/NodeTypes';
import type { FlowEdge, FlowNode } from '../flows/flow-editor/types';
import { flowDefinitionToReactFlow } from '../flows/flow-editor/utils/flowToReactFlow';

interface VisualizeFlowDialogProps {
	proposal: FlowProposal;
}

export function VisualizeFlowDialog({ proposal }: VisualizeFlowDialogProps) {
	const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);

	const flowName =
		typeof (proposal.proposedFlow as Record<string, unknown>)['name'] === 'string'
			? String((proposal.proposedFlow as Record<string, unknown>)['name'])
			: 'Flow preview';

	let nodes: FlowNode[] = [];
	let edges: FlowEdge[] = [];
	try {
		const converted = flowDefinitionToReactFlow(
			proposal.proposedFlow as unknown as Parameters<typeof flowDefinitionToReactFlow>[0]
		);
		nodes = converted.nodes;
		edges = converted.edges;
	} catch {
		// Fallback: if conversion fails, show nothing (canvas will be empty)
	}

	return (
		<Dialog>
			<DialogTrigger asChild>
				{/* violations-suppress: tailwind/no-button-classname-style-override no matching compact variant */}
				<Button variant="outline" size="sm" className="h-auto py-1 text-xs">
					Visualize
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[85vw] w-[85vw]">
				<DialogHeader>
					<DialogTitle>{flowName}</DialogTitle>
				</DialogHeader>
				<div className="grid grid-cols-[1fr_384px] overflow-hidden rounded-md border">
					<div className="h-[75vh] w-full overflow-hidden">
						<ReactFlowProvider>
							<ReactFlow
								nodes={nodes}
								edges={edges}
								nodeTypes={nodeTypes}
								edgeTypes={edgeTypes}
								fitView
								nodesDraggable={false}
								nodesConnectable={false}
								elementsSelectable={true}
								panOnDrag={true}
								zoomOnScroll={true}
								proOptions={{ hideAttribution: true }}
								className="h-full w-full bg-muted/20"
								onNodeClick={(_event, node) => setSelectedNode(node as FlowNode)}
								onPaneClick={() => setSelectedNode(null)}
							>
								<Background />
								<Controls position="bottom-left" />
								<MiniMap
									nodeColor={node => {
										if (node.type === 'model') return 'hsl(var(--primary))';
										if (node.type === 'script') return 'hsl(var(--secondary))';
										if (node.type === 'subflow') return 'hsl(var(--accent))';
										return 'hsl(var(--muted))';
									}}
									className="!border-border !bg-card"
									zoomable
									pannable
								/>
							</ReactFlow>
						</ReactFlowProvider>
					</div>
					<FlowEditorPropertiesPanel
						selectedNode={selectedNode}
						readOnly
						onUpdateNode={() => {}}
						onDeleteNode={() => {}}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
