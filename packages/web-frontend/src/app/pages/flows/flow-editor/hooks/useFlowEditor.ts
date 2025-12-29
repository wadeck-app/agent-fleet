import { useCallback, useEffect, useMemo, useState } from 'react';

import { type OnConnect, addEdge, useEdgesState, useNodesState } from '@xyflow/react';

import { flowsApi } from '../flowsApi';
import type { FlowNode } from '../types';
import type { FlowDefinition, FlowStep, ModelFlowStep, ScriptFlowStep, SubFlowStep } from '../types/flow-engine.types';
import { flowDefinitionToReactFlow, reactFlowToFlowDefinition } from '../utils/flowToReactFlow';
import { applyDagreLayout } from '../utils/layoutAlgorithms';
import { useFlowValidation } from './useFlowValidation';

/**
 * Main hook for flow editor state management
 */
export function useFlowEditor(flowId: string | undefined) {
	const [flowDefinition, setFlowDefinition] = useState<FlowDefinition | null>(null);
	const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [isDirty, setIsDirty] = useState(false);
	const [loading, setLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { validationResult, validate } = useFlowValidation(flowDefinition);

	// Function to load a flow from the API
	const loadFlow = useCallback(async (id: string) => {
		setLoading(true);
		setError(null);
		try {
			const flow = await flowsApi.getFlowById(id);
			setFlowDefinition(flow as any); // Cast to FlowDefinition type
			setIsDirty(false);
		} catch (err) {
			setError(`Failed to load flow: ${err instanceof Error ? err.message : 'Unknown error'}`);
			setFlowDefinition(null);
		} finally {
			setLoading(false);
		}
	}, []);

	// Load flow from backend/file
	useEffect(() => {
		if (!flowId) {
			// New flow
			const newFlow: FlowDefinition = {
				id: 'new-flow',
				version: '1.0.0',
				name: 'New Flow',
				description: 'A new flow',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'always',
				},
				inputs: {},
				steps: [],
			};
			setFlowDefinition(newFlow);
			setLoading(false);
			return;
		}

		// Load existing flow from API
		loadFlow(flowId);
	}, [flowId, loadFlow]);

	// Convert flow to React Flow format when flow definition changes
	useEffect(() => {
		if (!flowDefinition) return;

		const { nodes: newNodes, edges: newEdges } = flowDefinitionToReactFlow(flowDefinition);
		setNodes(newNodes);
		setEdges(newEdges);
	}, [flowDefinition, setNodes, setEdges]);

	// Handle connection creation
	const onConnect: OnConnect = useCallback(
		params => {
			setEdges(eds => addEdge({ ...params, type: 'dependency', data: { edgeType: 'dependency' } }, eds));
			setIsDirty(true);
		},
		[setEdges]
	);

	// Handle node click
	const onNodeClick = useCallback((event: React.MouseEvent, node: FlowNode) => {
		setSelectedNodeId(node.id);
	}, []);

	// Handle pane click (deselect)
	const onPaneClick = useCallback(() => {
		setSelectedNodeId(null);
	}, []);

	// Get selected node
	const selectedNode = useMemo(() => {
		return nodes.find(n => n.id === selectedNodeId) || null;
	}, [nodes, selectedNodeId]);

	// Add new node
	const addNode = useCallback(
		(type: 'model' | 'script' | 'subflow') => {
			const newId = `step-${Date.now()}`;

			let newStep: FlowStep;
			if (type === 'model') {
				newStep = {
					type: 'model',
					id: newId,
					name: 'New Model Step',
					model: 'sonnet',
					prompt: '',
				} as ModelFlowStep;
			} else if (type === 'script') {
				newStep = {
					type: 'script',
					id: newId,
					name: 'New Script Step',
					script: '',
				} as ScriptFlowStep;
			} else {
				newStep = {
					type: 'subflow',
					id: newId,
					name: 'New SubFlow Step',
					flowId: '',
					inputs: {},
				} as SubFlowStep;
			}

			const newNode: FlowNode = {
				id: newId,
				type,
				position: { x: Math.random() * 400, y: Math.random() * 400 },
				data: {
					step: newStep,
					validationIssues: [],
				},
			};

			setNodes(nds => [...nds, newNode]);
			setIsDirty(true);
		},
		[setNodes]
	);

	// Update node data
	const updateNodeData = useCallback(
		(nodeId: string, updates: Partial<FlowStep>) => {
			setNodes(nds =>
				nds.map(node => {
					if (node.id !== nodeId) return node;

					return {
						...node,
						data: {
							...node.data,
							step: {
								...node.data.step,
								...updates,
							} as FlowStep,
						},
					} as FlowNode;
				})
			);
			setIsDirty(true);
		},
		[setNodes]
	);

	// Delete node
	const deleteNode = useCallback(
		(nodeId: string) => {
			setNodes(nds => nds.filter(n => n.id !== nodeId));
			setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
			if (selectedNodeId === nodeId) {
				setSelectedNodeId(null);
			}
			setIsDirty(true);
		},
		[setNodes, setEdges, selectedNodeId]
	);

	// Auto-layout
	const autoLayout = useCallback(() => {
		const layoutedNodes = applyDagreLayout(nodes, edges);
		setNodes(layoutedNodes);
		setIsDirty(true);
	}, [nodes, edges, setNodes]);

	// Validate flow
	const validateFlow = useCallback(() => {
		validate();
	}, [validate]);

	// Save flow
	const saveFlow = useCallback(async () => {
		if (!flowDefinition) return;

		setIsSaving(true);
		setError(null);

		try {
			// Convert nodes/edges back to flow definition
			const updatedFlow = reactFlowToFlowDefinition(flowDefinition, nodes, edges);

			// Save to API
			await flowsApi.saveFlow(flowDefinition.id, updatedFlow);

			// Update local state with saved flow
			setFlowDefinition(updatedFlow);
			setIsDirty(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save flow');
		} finally {
			setIsSaving(false);
		}
	}, [flowDefinition, nodes, edges]);

	// Focus node from validation issue
	const focusNodeFromIssue = useCallback((stepId: string) => {
		setSelectedNodeId(stepId);
		// TODO: Pan/zoom to node
	}, []);

	// Update validation issues on nodes
	useEffect(() => {
		if (!validationResult) return;

		setNodes(nds =>
			nds.map(node => ({
				...node,
				data: {
					...node.data,
					validationIssues: validationResult.issues.filter(issue => issue.location?.stepId === node.id),
				},
			}))
		);
	}, [validationResult, setNodes]);

	return {
		// State
		flowDefinition,
		nodes,
		edges,
		selectedNodeId,
		selectedNode,
		isDirty,
		loading,
		isSaving,
		error,
		validationResult,

		// Handlers
		onNodesChange,
		onEdgesChange,
		onConnect,
		onNodeClick,
		onPaneClick,

		// Actions
		loadFlow,
		addNode,
		updateNodeData,
		deleteNode,
		autoLayout,
		validateFlow,
		saveFlow,
		focusNodeFromIssue,
	};
}
