import dagre from 'dagre';

import type { FlowEdge, FlowNode } from '../types';

/**
 * Apply dagre hierarchical layout to nodes
 */
export function applyDagreLayout(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
	const dagreGraph = new dagre.graphlib.Graph();

	// Configure graph with larger spacing to avoid edge overlaps and node crossings
	dagreGraph.setGraph({
		rankdir: 'TB', // Top to Bottom
		nodesep: 200, // Horizontal spacing between nodes (increased for better edge routing)
		ranksep: 250, // Vertical spacing between ranks (increased to avoid crossings)
		edgesep: 100, // Spacing between edges (increased)
		ranker: 'network-simplex', // Use better ranking algorithm
		marginx: 50, // Margin on x-axis
		marginy: 50, // Margin on y-axis
	});

	dagreGraph.setDefaultEdgeLabel(() => ({}));

	// Add nodes with accurate sizing to help dagre calculate better layouts
	nodes.forEach(node => {
		// Increased node size to match actual rendered size for better spacing calculations
		const nodeWidth = 280; // Increased from 220 to match actual node width
		const nodeHeight = 120; // Increased from 100 to match actual node height
		dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
	});

	// Add edges
	edges.forEach(edge => {
		dagreGraph.setEdge(edge.source, edge.target);
	});

	// Run layout algorithm
	dagre.layout(dagreGraph);

	// Update node positions
	return nodes.map(node => {
		const dagreNode = dagreGraph.node(node.id);

		return {
			...node,
			position: {
				// Dagre returns center position, we need top-left
				x: dagreNode.x - (dagreNode.width || 280) / 2,
				y: dagreNode.y - (dagreNode.height || 120) / 2,
			},
		};
	});
}
