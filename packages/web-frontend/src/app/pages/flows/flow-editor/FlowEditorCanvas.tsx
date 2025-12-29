import { useCallback } from 'react';

import {
	Background,
	Controls,
	type Edge,
	type EdgeMouseHandler,
	MiniMap,
	type Node,
	type NodeMouseHandler,
	type OnConnect,
	type OnEdgesChange,
	type OnEdgesDelete,
	type OnNodesChange,
	ReactFlow,
} from '@xyflow/react';

import { edgeTypes } from './edges';
import { nodeTypes } from './nodes';

interface FlowEditorCanvasProps {
	nodes: Node[];
	edges: Edge[];
	onNodesChange: OnNodesChange;
	onEdgesChange: OnEdgesChange;
	onConnect: OnConnect;
	onNodeClick: NodeMouseHandler;
	onPaneClick: () => void;
	selectedNodeId: string | null;
}

export function FlowEditorCanvas({
	nodes,
	edges,
	onNodesChange,
	onEdgesChange,
	onConnect,
	onNodeClick,
	onPaneClick,
}: FlowEditorCanvasProps) {
	const onDragOver = useCallback((event: React.DragEvent) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
	}, []);

	const onDrop = useCallback((event: React.DragEvent) => {
		event.preventDefault();

		const type = event.dataTransfer.getData('application/reactflow');
		if (!type) return;

		// This will be handled by the parent component via onNodesChange
		// For now, just prevent default behavior
	}, []);

	const onEdgesDelete: OnEdgesDelete = useCallback(
		deletedEdges => {
			console.log('[FlowEditorCanvas] Edges deleted:', deletedEdges);
		},
		[]
	);

	const onEdgeClick: EdgeMouseHandler = useCallback(
		(_event, _edge) => {
			// Deselect any selected node when an edge is clicked
			onPaneClick();
		},
		[onPaneClick]
	);

	return (
		<ReactFlow
			nodes={nodes}
			edges={edges}
			onNodesChange={onNodesChange}
			onEdgesChange={onEdgesChange}
			onConnect={onConnect}
			onNodeClick={onNodeClick}
			onEdgeClick={onEdgeClick}
			onPaneClick={onPaneClick}
			onDragOver={onDragOver}
			onDrop={onDrop}
			onEdgesDelete={onEdgesDelete}
			nodeTypes={nodeTypes}
			edgeTypes={edgeTypes}
			fitView
			edgesFocusable={true}
			selectNodesOnDrag={false}
			className="bg-muted/20 w-full h-full"
			deleteKeyCode="Delete"
		>
			<Background />
			<Controls />
			<MiniMap
				nodeColor={node => {
					if (node.type === 'model') return 'hsl(var(--primary))';
					if (node.type === 'script') return 'hsl(var(--secondary))';
					if (node.type === 'subflow') return 'hsl(var(--accent))';
					return 'hsl(var(--muted))';
				}}
				className="!bg-card !border-border"
			/>
		</ReactFlow>
	);
}
