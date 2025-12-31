import { useCallback, useEffect, useMemo, useState } from 'react';

import { type EdgeMouseHandler, type Node, type OnConnect, addEdge, useEdgesState, useNodesState } from '@xyflow/react';

import { flowsApi } from '../flowsApi';
import type { ConstantNodeData } from '../nodes/ConstantNode';
import type { FlowEdge, FlowNode } from '../types';
import type { FlowDefinition, FlowStep, ModelFlowStep, ScriptFlowStep, SubFlowStep } from '../types/flow-engine.types';
import { areTypesCompatible, getHandleType } from '../utils/TypeValidator';
import { extractAllPorts } from '../utils/VariableExtractor';
import { flowDefinitionToReactFlow, reactFlowToFlowDefinition } from '../utils/flowToReactFlow';
import { applyDagreLayout } from '../utils/layoutAlgorithms';
import { useFlowValidation } from './useFlowValidation';

/**
 * Main hook for flow editor state management
 */
export function useFlowEditor(flowId: string | undefined) {
	const [flowDefinition, setFlowDefinition] = useState<FlowDefinition | null>(null);
	const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
	const [isDirty, setIsDirty] = useState(false);
	// Separate loading states: initialLoading for first load, loading for flow switches
	const [initialLoading, setInitialLoading] = useState(true);
	const [loading, setLoading] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { validationResult, validate } = useFlowValidation(flowDefinition);

	// Edge visibility toggles with localStorage persistence
	const [showDependencyEdges, setShowDependencyEdges] = useState<boolean>(() => {
		const stored = localStorage.getItem('flowEditor.showDependencyEdges');
		return stored === null ? true : stored === 'true';
	});

	const [showDataFlowEdges, setShowDataFlowEdges] = useState<boolean>(() => {
		const stored = localStorage.getItem('flowEditor.showDataFlowEdges');
		return stored === null ? true : stored === 'true';
	});

	const [showEdgeLabels, setShowEdgeLabels] = useState<boolean>(() => {
		const stored = localStorage.getItem('flowEditor.showEdgeInlineLabels');
		return stored === 'true';
	});

	// Persist toggle states to localStorage
	useEffect(() => {
		localStorage.setItem('flowEditor.showDependencyEdges', String(showDependencyEdges));
	}, [showDependencyEdges]);

	useEffect(() => {
		localStorage.setItem('flowEditor.showDataFlowEdges', String(showDataFlowEdges));
	}, [showDataFlowEdges]);

	useEffect(() => {
		localStorage.setItem('flowEditor.showEdgeInlineLabels', String(showEdgeLabels));
	}, [showEdgeLabels]);

	// Toggle handlers
	const toggleDependencyEdges = useCallback(() => {
		setShowDependencyEdges(prev => !prev);
	}, []);

	const toggleDataFlowEdges = useCallback(() => {
		setShowDataFlowEdges(prev => !prev);
	}, []);

	const toggleEdgeLabels = useCallback(() => {
		setShowEdgeLabels(prev => !prev);
	}, []);

	// Filter edges based on toggle states
	const filteredEdges = useMemo(() => {
		return edges.filter(edge => {
			const edgeType = edge.data?.edgeType;

			// Filter dependency/conditional/loop edges
			if (edgeType === 'dependency' || edgeType === 'conditional' || edgeType === 'loop') {
				return showDependencyEdges;
			}

			// Filter data flow edges
			if (edgeType === 'dataflow') {
				return showDataFlowEdges;
			}

			// Show unknown edge types by default
			return true;
		});
	}, [edges, showDependencyEdges, showDataFlowEdges]);

	// Function to load a flow from the API
	const loadFlow = useCallback(async (id: string) => {
		setLoading(true);
		setError(null);
		// Close properties panel when switching flows
		setSelectedNodeId(null);
		try {
			const flow = await flowsApi.getFlowById(id);
			setFlowDefinition(flow as unknown as FlowDefinition); // Cast to FlowDefinition type
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
			setInitialLoading(false);
			setLoading(false);
			return;
		}

		// Load existing flow from API
		loadFlow(flowId).finally(() => {
			// First load complete
			setInitialLoading(false);
		});
	}, [flowId, loadFlow]);

	// Convert flow to React Flow format when flow definition changes
	useEffect(() => {
		if (!flowDefinition) return;

		const { nodes: newNodes, edges: backendEdges } = flowDefinitionToReactFlow(flowDefinition);

		// Extract variable ports for all steps
		const portsMap = extractAllPorts(flowDefinition);

		// Inject ports into node data
		const nodesWithPorts = newNodes.map(node => {
			const ports = portsMap.get(node.id);
			if (!ports) return node;

			return {
				...node,
				data: {
					...node.data,
					inputPorts: ports.inputPorts,
					outputPorts: ports.outputPorts,
				},
			};
		});

		// Auto-generate data flow edges based on variable references in templates
		const autoGeneratedDataFlowEdges: FlowEdge[] = [];

		for (const targetNode of nodesWithPorts) {
			const inputPorts = targetNode.data.inputPorts || [];

			for (const inputPort of inputPorts) {
				// Parse input port name: "steps.stepId.outputs.varName"
				const match = inputPort.name.match(/^steps\.([^.]+)\.outputs\.([^.]+)$/);
				if (!match) continue; // Not a step output reference

				const [, sourceStepId, outputVarName] = match;

				// Find source node
				const sourceNode = nodesWithPorts.find(n => n.id === sourceStepId);
				if (!sourceNode) continue;

				// Find matching output port in source node
				const outputPorts = sourceNode.data.outputPorts || [];
				const outputPort = outputPorts.find(p => p.name === outputVarName);
				if (!outputPort) continue;

				// Create data flow edge
				const edgeId = `dataflow-${sourceNode.id}-${outputPort.id}-${targetNode.id}-${inputPort.id}`;
				autoGeneratedDataFlowEdges.push({
					id: edgeId,
					source: sourceNode.id,
					sourceHandle: outputPort.id,
					target: targetNode.id,
					targetHandle: inputPort.id,
					type: 'dataflow',
					data: {
						edgeType: 'dataflow' as const,
						sourceVarName: outputPort.name,
						targetVarName: inputPort.name,
						varType: outputPort.type,
						showEdgeLabels, // Pass the label visibility state
					},
				});
			}
		}

		// Load data flow edges from localStorage
		const storageKey = `flowEditor.dataFlowEdges.${flowDefinition.id}`;
		const storedDataFlowEdges = localStorage.getItem(storageKey);

		let manualDataFlowEdges: FlowEdge[] = [];
		if (storedDataFlowEdges) {
			try {
				manualDataFlowEdges = JSON.parse(storedDataFlowEdges) as FlowEdge[];
			} catch (err) {
				console.error('Failed to parse stored data flow edges:', err);
			}
		}

		// Merge auto-generated edges with manual edges (manual edges take priority)
		// Check if an edge already exists to avoid duplicates
		const edgeExists = (edge: FlowEdge, existingEdges: FlowEdge[]) => {
			return existingEdges.some(
				e =>
					e.source === edge.source &&
					e.sourceHandle === edge.sourceHandle &&
					e.target === edge.target &&
					e.targetHandle === edge.targetHandle
			);
		};

		// Add auto-generated edges that don't already exist as manual edges
		const finalDataFlowEdges = [
			...manualDataFlowEdges,
			...autoGeneratedDataFlowEdges.filter(edge => !edgeExists(edge, manualDataFlowEdges)),
		];

		// Merge backend edges (dependency/conditional/loop) with data flow edges
		const allEdges = [...backendEdges, ...finalDataFlowEdges];

		// Update all edges with the current showEdgeLabels state
		const edgesWithLabels: FlowEdge[] = allEdges.map(edge => ({
			...edge,
			data: {
				...edge.data,
				showEdgeLabels,
			},
		})) as FlowEdge[];

		setNodes(nodesWithPorts);
		setEdges(edgesWithLabels);
	}, [flowDefinition, setNodes, setEdges, showEdgeLabels]);

	// Handle connection creation
	const onConnect: OnConnect = useCallback(
		params => {
			// Prevent self-loops: a step cannot connect to itself
			if (params.source === params.target) {
				console.warn('Self-loops are not allowed: a step cannot connect to itself');
				// TODO: Show user-friendly error notification (toast/alert)
				return;
			}

			// Main handles are: 'left', 'right', 'bottom'
			// Variable port handles start with: 'input-' or 'output-'
			const isMainHandle = (handle: string | null | undefined) =>
				handle === 'left' || handle === 'right' || handle === 'bottom';

			const isDataFlowConnection = !isMainHandle(params.sourceHandle) || !isMainHandle(params.targetHandle);

			if (!isDataFlowConnection) {
				// Regular dependency edge - explicitly set handles for main dependency connection
				setEdges(eds =>
					addEdge(
						{
							...params,
							sourceHandle: params.sourceHandle || 'right',
							targetHandle: params.targetHandle || 'left',
							type: 'dependency',
							data: { edgeType: 'dependency' },
						},
						eds
					)
				);
				setIsDirty(true);
				return;
			}

			// Data flow connection - validate types
			const sourceNode = nodes.find(n => n.id === params.source);
			const targetNode = nodes.find(n => n.id === params.target);

			if (!sourceNode || !targetNode) return;

			const sourceType = getHandleType(params.sourceHandle!, sourceNode);
			const targetType = getHandleType(params.targetHandle!, targetNode);

			if (!sourceType || !targetType) {
				console.warn('Cannot determine types for connection');
				return;
			}

			// Check type compatibility
			if (!areTypesCompatible(sourceType, targetType)) {
				// Show error notification
				console.error(`Type mismatch: Cannot connect ${sourceType} to ${targetType}`);
				// TODO: Show user-friendly error notification (toast/alert)
				return;
			}

			// Create data flow edge
			setEdges(eds =>
				addEdge(
					{
						...params,
						type: 'dataflow',
						data: {
							edgeType: 'dataflow',
							varType: sourceType,
							showEdgeLabels, // Pass the label visibility state
						},
					},
					eds
				)
			);
			setIsDirty(true);
		},
		[setEdges, nodes, showEdgeLabels]
	);

	// Handle node click
	const onNodeClick = useCallback((event: React.MouseEvent, node: FlowNode) => {
		setSelectedNodeId(node.id);
		setSelectedEdgeId(null); // Deselect edges when selecting a node
	}, []);

	// Handle edge selection (can be called from edge click or programmatically)
	const handleEdgeSelection = useCallback((edgeId: string) => {
		setSelectedEdgeId(edgeId);
		setSelectedNodeId(null); // Deselect nodes when selecting an edge
	}, []);

	// Handle edge click
	const onEdgeClick: EdgeMouseHandler = useCallback(
		(_event, edge) => {
			handleEdgeSelection(edge.id);
		},
		[handleEdgeSelection]
	);

	// Handle pane click (deselect)
	const onPaneClick = useCallback(() => {
		setSelectedNodeId(null);
		setSelectedEdgeId(null);
	}, []);

	// Get selected node
	const selectedNode = useMemo(() => {
		return nodes.find(n => n.id === selectedNodeId) || null;
	}, [nodes, selectedNodeId]);

	// Get selected edge
	const selectedEdge = useMemo(() => {
		return edges.find(e => e.id === selectedEdgeId) || null;
	}, [edges, selectedEdgeId]);

	// Add new node
	const addNode = useCallback(
		(type: 'model' | 'script' | 'subflow' | 'constant') => {
			const newId = `step-${Date.now()}`;

			// Handle constant nodes (UI-only, not FlowSteps)
			if (type === 'constant') {
				const constantNode: Node<ConstantNodeData> = {
					id: newId,
					type: 'constant',
					position: { x: Math.random() * 400, y: Math.random() * 400 },
					data: {
						value: '',
						type: 'string',
						label: 'New Constant',
					},
				};

				setNodes(nds => [...nds, constantNode as unknown as FlowNode]);
				setIsDirty(true);
				return;
			}

			// Handle regular flow steps
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

					// Handle constant nodes (UI-only, different data structure)
					if (node.type === 'constant') {
						return {
							...node,
							data: {
								...node.data,
								...updates,
							},
						} as FlowNode;
					}

					// Handle regular step nodes
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

	// Save data flow edges to localStorage when they change
	useEffect(() => {
		if (!flowDefinition) return;

		// Extract only data flow edges
		const dataFlowEdges = edges.filter(e => e.data?.edgeType === 'dataflow');

		// Save to localStorage
		const storageKey = `flowEditor.dataFlowEdges.${flowDefinition.id}`;
		localStorage.setItem(storageKey, JSON.stringify(dataFlowEdges));
	}, [edges, flowDefinition]);

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
		edges: filteredEdges, // Return filtered edges instead of all edges
		selectedNodeId,
		selectedNode,
		selectedEdgeId,
		selectedEdge,
		isDirty,
		initialLoading,
		loading,
		isSaving,
		error,
		validationResult,

		// Edge visibility toggles
		showDependencyEdges,
		showDataFlowEdges,
		showEdgeLabels,

		// Handlers
		onNodesChange,
		onEdgesChange,
		onConnect,
		onNodeClick,
		onEdgeClick,
		onPaneClick,
		handleEdgeSelection,
		toggleDependencyEdges,
		toggleDataFlowEdges,
		toggleEdgeLabels,

		// Actions
		loadFlow,
		addNode,
		updateNodeData,
		deleteNode,
		autoLayout,
		validateFlow,
		saveFlow,
		focusNodeFromIssue,
		setEdges, // Export setEdges for edge deletion
	};
}
