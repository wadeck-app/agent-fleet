import type { Edge, Node } from '@xyflow/react';

import type { FlowDefinition, FlowStep, ValidationIssue } from './types/flow-engine.types';

/**
 * Custom data attached to each node
 */
export interface StepNodeData extends Record<string, unknown> {
	/** The flow step this node represents */
	step: FlowStep;
	/** Validation issues for this step */
	validationIssues: ValidationIssue[];
}

/**
 * Custom data attached to each edge
 */
export interface EdgeData extends Record<string, unknown> {
	/** Type of edge */
	edgeType: 'dependency' | 'conditional' | 'loop';
	/** Condition expression (for conditional edges) */
	condition?: string;
	/** Loop configuration (for loop edges) */
	loopConfig?: FlowStep['onFailure'];
}

/**
 * Node type with our custom data
 */
export type FlowNode = Node<StepNodeData, string | undefined>;

/**
 * Edge type with our custom data
 */
export type FlowEdge = Edge<EdgeData, string | undefined>;

/**
 * Position for node layout
 */
export interface NodePosition {
	x: number;
	y: number;
}

/**
 * Flow editor state
 */
export interface FlowEditorState {
	// Flow data
	flowDefinition: FlowDefinition | null;
	nodes: FlowNode[];
	edges: FlowEdge[];

	// UI state
	selectedNodeId: string | null;
	isDirty: boolean;
	loading: boolean;
	isSaving: boolean;
	error: string | null;

	// Validation
	validationResult: any | null;
}
