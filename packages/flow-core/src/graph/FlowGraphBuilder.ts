import type { FlowDefinition, FlowStep } from 'flow-engine/types';

import { FlowCoreError } from '../errors.js';
import type { ExecutionState, StepState } from '../execution/ExecutionState.js';
import { formatDuration } from '../history/ExecutionFormat.js';
import type { FlowGraph, FlowGraphEdge, FlowGraphNode } from './FlowGraph.js';

const MAX_LABEL = 40;

type MetaValues = Record<string, string | number | boolean>;

function shortCondition(expression: string): string {
	// Same simplification as `flow show`: drop template syntax and the `steps.X.outputs.` prefix.
	const clean = expression
		.replace(/\$\{\{|\}\}/g, '')
		.trim()
		.replace(/steps\.[^.]+\.outputs\./g, '')
		.replace(/\s+/g, ' ');
	return clean.length > MAX_LABEL ? `${clean.slice(0, MAX_LABEL - 2)}..` : clean;
}

function invalid(flowId: string, message: string): FlowCoreError {
	return new FlowCoreError(`Flow '${flowId}' cannot be drawn: ${message}`, 'invalid-flow-graph');
}

function addStateMeta(meta: MetaValues, state: StepState): void {
	if (state.startedAt) meta.startedAt = state.startedAt;
	if (state.completedAt) meta.completedAt = state.completedAt;
	if (state.error) meta.error = state.error;
	if (state.workerId) meta.workerId = state.workerId;
	if (state.sourceId) meta.sourceId = state.sourceId;
	const stepMeta = state.meta as { cost?: { usd?: number }; model?: string } | undefined;
	if (stepMeta?.cost?.usd !== undefined) meta.costUsd = stepMeta.cost.usd;
	if (stepMeta?.model !== undefined) meta.model = stepMeta.model;
}

function stepMeta(step: FlowStep, state: StepState | undefined): MetaValues {
	const meta: MetaValues = { type: step.type };
	if (step.type === 'model') {
		if (step.provider) meta.provider = step.provider;
		if (step.model) meta.model = step.model;
	}
	if (step.type === 'subflow') meta.flowId = step.flowId;
	if (step.type === 'user_intervention') {
		meta.interventionType = step.interventionType;
		meta.blocking = step.blocking !== false;
	}
	if (step.when) meta.when = step.when;
	if (step.retry) meta.retryMaxAttempts = step.retry.maxAttempts;
	if (step.onFailure?.goto) {
		meta.onFailureGoto = step.onFailure.goto;
		meta.onFailureMaxIterations = step.onFailure.maxIterations ?? 3;
	}
	if (step.parent) meta.parent = step.parent;
	if (step.labels?.length) meta.labels = step.labels.join(', ');
	if (state) addStateMeta(meta, state);
	return meta;
}

function stateFields(
	state: StepState | undefined,
	hasExecution: boolean
): Pick<FlowGraphNode, 'status' | 'durationLabel' | 'attempts'> {
	if (!hasExecution) return {};
	if (!state) return { status: 'pending' };
	return {
		status: state.status,
		...(state.startedAt ? { durationLabel: formatDuration(state.startedAt, state.completedAt ?? null) } : {}),
		...(state.attempts !== undefined ? { attempts: state.attempts } : {}),
	};
}

/**
 * Pure conversion of a flow definition into nodes and edges (same edge semantics as the flow editor:
 * `depends`, `when`, `onFailure.goto`), optionally decorated with the step states of one execution.
 * Throws FlowCoreError('invalid-flow-graph') when the definition references a step that does not exist
 * or declares a step id twice: drawing a partial graph would hide the mistake.
 */
export function buildFlowGraph(flow: FlowDefinition, execution?: ExecutionState): FlowGraph {
	const hasExecution = execution !== undefined;
	const steps = flow.steps;
	const ids = new Set<string>();
	for (const step of steps) {
		if (ids.has(step.id)) throw invalid(flow.id, `step id '${step.id}' is declared twice. Make step ids unique.`);
		ids.add(step.id);
	}
	const requireStep = (from: string, field: string, target: string): void => {
		if (!ids.has(target)) {
			throw invalid(flow.id, `step '${from}' has ${field} '${target}', which is not a step of this flow.`);
		}
	};

	const nodes: FlowGraphNode[] = steps.map(step => {
		const state = execution?.steps[step.id];
		return {
			id: step.id,
			kind: step.type,
			label: step.name || step.id,
			...stateFields(state, hasExecution),
			meta: stepMeta(step, state),
		};
	});

	const edges: FlowGraphEdge[] = [];
	for (const step of steps) {
		for (const dep of step.depends ?? []) {
			requireStep(step.id, 'depends on', dep);
			edges.push(
				step.when
					? { from: dep, to: step.id, kind: 'conditional', label: shortCondition(step.when) }
					: { from: dep, to: step.id, kind: 'dependency' }
			);
		}
		if (step.parent) {
			requireStep(step.id, 'parent', step.parent);
			edges.push({ from: step.id, to: step.parent, kind: 'substep', label: 'sub-step of' });
		}
		if (step.onFailure?.goto) {
			requireStep(step.id, 'onFailure.goto', step.onFailure.goto);
			edges.push({
				from: step.id,
				to: step.onFailure.goto,
				kind: 'loop',
				label: `on failure (max ${step.onFailure.maxIterations ?? 3}x)`,
			});
		}
	}

	// Steps injected at run time (provideSteps) exist only in the state: show them rather than lose them.
	if (execution) {
		for (const [id, state] of Object.entries(execution.steps)) {
			if (ids.has(id)) continue;
			const meta: MetaValues = { type: 'injected', injected: true };
			addStateMeta(meta, state);
			nodes.push({ id, kind: 'injected', label: id, ...stateFields(state, true), meta });
		}
	}

	return { nodes, edges };
}
