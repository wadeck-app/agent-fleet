import type { Edge, Node } from '@xyflow/react';
import type { ValidationIssue } from 'flow-engine/validation/ValidationTypes';

import type { FlowDefinition, FlowStep, VariableType } from './types/flow-engine.types';
import type { VariablePort } from './utils/VariableExtractor';

/**
 * Custom data attached to each node
 */
export interface StepNodeData extends Record<string, unknown> {
	/** The flow step this node represents */
	step: FlowStep;
	/** Validation issues for this step */
	validationIssues: ValidationIssue[];
	/** Input variable ports for data flow visualization */
	inputPorts?: VariablePort[];
	/** Output variable ports for data flow visualization */
	outputPorts?: VariablePort[];
}

/**
 * Custom data attached to each edge
 */
export interface EdgeData extends Record<string, unknown> {
	/** Type of edge */
	edgeType: 'dependency' | 'conditional' | 'loop' | 'dataflow';
	/** Condition expression (for conditional edges) */
	condition?: string;
	/** Loop configuration (for loop edges) */
	loopConfig?: FlowStep['onFailure'];
	/** Source variable name (for data flow edges) */
	sourceVarName?: string;
	/** Target variable name (for data flow edges) */
	targetVarName?: string;
	/** Variable type (for data flow edges) */
	varType?: VariableType;
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
