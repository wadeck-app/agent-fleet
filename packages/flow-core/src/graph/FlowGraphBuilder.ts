import type { FlowDefinition, FlowStep } from 'flow-engine/types';

import { FlowCoreError } from '../errors.js';
import type { ExecutionState, StepState } from '../execution/ExecutionState.js';
import { formatStepCost, summarizeStepCost } from '../execution/StepCost.js';
import { formatDuration } from '../history/ExecutionFormat.js';
import { stripForServing } from '../logs/ServingText.js';
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
	if (state.startedAt) {
		meta.startedAt = state.startedAt;
	}
	if (state.completedAt) {
		meta.completedAt = state.completedAt;
	}
	if (state.error) {
		// Served like the rest of a run's free text: ANSI stripped, nothing else.
		meta.error = stripForServing(state.error);
	}
	if (state.workerId) {
		meta.workerId = state.workerId;
	}
	if (state.sourceId) {
		meta.sourceId = state.sourceId;
	}
	const stepMeta = state.meta as { model?: string } | undefined;
	// The cost of the whole step (all attempts, session-cumulative values resolved), not the last meta alone
	const cost = summarizeStepCost(state);
	const costLabel = formatStepCost(cost);
	if (costLabel !== undefined) {
		meta.costLabel = costLabel;
		meta.costComplete = cost.complete;
	}
	if (cost.totalUsd !== undefined) {
		meta.costUsd = cost.totalUsd;
	}
	if (cost.lastAttemptUsd !== undefined) {
		meta.lastAttemptCostUsd = cost.lastAttemptUsd;
	}
	if (stepMeta?.model !== undefined) {
		meta.model = stepMeta.model;
	}
}

function stepMeta(step: FlowStep, state: StepState | undefined): MetaValues {
	const meta: MetaValues = { type: step.type };
	if (step.type === 'model') {
		if (step.provider) {
			meta.provider = step.provider;
		}
		if (step.model) {
			meta.model = step.model;
		}
	}
	if (step.type === 'subflow') {
		meta.flowId = step.flowId;
	}
	if (step.type === 'user_intervention') {
		meta.interventionType = step.interventionType;
		meta.blocking = step.blocking !== false;
	}
	if (step.when) {
		meta.when = step.when;
	}
	if (step.retry) {
		meta.retryMaxAttempts = step.retry.maxAttempts;
	}
	if (step.onFailure?.goto) {
		meta.onFailureGoto = step.onFailure.goto;
		meta.onFailureMaxIterations = step.onFailure.maxIterations ?? 3;
	}
	if (step.parent) {
		meta.parent = step.parent;
	}
	if (step.labels?.length) {
		meta.labels = step.labels.join(', ');
	}
	if (state) {
		addStateMeta(meta, state);
	}
	return meta;
}

function stateFields(
	state: StepState | undefined,
	hasExecution: boolean
): Pick<FlowGraphNode, 'status' | 'durationLabel' | 'attempts'> {
	if (!hasExecution) {
		return {};
	}
	if (!state) {
		return { status: 'pending' };
	}
	return {
		status: state.status,
		...(state.startedAt ? { durationLabel: formatDuration(state.startedAt, state.completedAt ?? null) } : {}),
		...(state.attempts !== undefined ? { attempts: state.attempts } : {}),
	};
}

function startTime(state: StepState | undefined): number {
	if (state?.startedAt === undefined) {
		return Number.POSITIVE_INFINITY;
	}
	const time = Date.parse(state.startedAt);
	return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

/**
 * Adds the steps only the run knows about: injected at run time (provideSteps), or recorded by a run whose flow
 * file was edited afterwards ('removed'). Their edges come from what the record holds (`dependsOn`, `parent`);
 * when it holds neither, the steps are chained in the order they ran, as 'sequence' edges, and a warning says so.
 * When any such step exists the nodes are reordered by start time (ties: record order, steps the run never
 * recorded last) so the list reads in execution order instead of definition-first.
 * Returns the warnings.
 */
function addRecordedOnlySteps(
	flow: FlowDefinition,
	execution: ExecutionState,
	nodes: FlowGraphNode[],
	edges: FlowGraphEdge[]
): string[] {
	const known = new Set(nodes.map(n => n.id));
	const orphans = Object.entries(execution.steps).filter(([id]) => !known.has(id));
	if (orphans.length === 0) {
		return [];
	}

	for (const [id, state] of orphans) {
		const removed = state.injected !== true;
		const meta: MetaValues = removed ? { type: 'removed', removed: true } : { type: 'injected', injected: true };
		addStateMeta(meta, state);
		nodes.push({
			id,
			kind: removed ? 'removed' : 'injected',
			label: id,
			...stateFields(state, true),
			meta,
		});
		known.add(id);
	}

	const recordOrder = new Map(Object.keys(execution.steps).map((id, index) => [id, index]));
	const rank = (id: string): number => recordOrder.get(id) ?? Number.POSITIVE_INFINITY;
	nodes.sort((a, b) => {
		const byStart = startTime(execution.steps[a.id]) - startTime(execution.steps[b.id]);
		if (byStart !== 0 && !Number.isNaN(byStart)) {
			return byStart;
		}
		return rank(a.id) - rank(b.id);
	});

	const unlinked: string[] = [];
	for (const [id, state] of orphans) {
		const fail = (field: string, target: string): FlowCoreError =>
			invalid(
				flow.id,
				`step '${id}' of execution ${execution.executionId} has ${field} '${target}', which is not a step of this run.`
			);
		for (const dep of state.dependsOn ?? []) {
			if (!known.has(dep)) {
				throw fail('recorded dependency', dep);
			}
			edges.push({ from: dep, to: id, kind: 'dependency' });
		}
		if (state.parent !== undefined) {
			if (!known.has(state.parent)) {
				throw fail('recorded parent', state.parent);
			}
			edges.push({ from: id, to: state.parent, kind: 'substep', label: 'sub-step of' });
		}
		if (state.dependsOn === undefined && state.parent === undefined) {
			unlinked.push(id);
		}
	}

	const order = new Map(nodes.map((n, index) => [n.id, index]));
	const warnings: string[] = [];
	const removedIds = orphans
		.filter(([, state]) => state.injected !== true)
		.map(([id]) => id)
		.sort((a, b) => order.get(a)! - order.get(b)!);
	if (removedIds.length > 0) {
		warnings.push(
			`The flow file ${execution.flowFile} changed since this run: step(s) ${removedIds.join(', ')} are not in it anymore, ` +
				'so their dependencies are unknown. ' +
				(unlinked.length > 1
					? 'They are linked in the order they ran (dashed "recorded order" edges), not by real dependencies.'
					: '')
		);
	}
	unlinked.sort((a, b) => order.get(a)! - order.get(b)!);
	for (let i = 1; i < unlinked.length; i++) {
		edges.push({ from: unlinked[i - 1]!, to: unlinked[i]!, kind: 'sequence', label: 'recorded order' });
	}
	return warnings;
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
		if (ids.has(step.id)) {
			throw invalid(flow.id, `step id '${step.id}' is declared twice. Make step ids unique.`);
		}
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

	if (!execution) {
		return { nodes, edges };
	}
	const warnings = addRecordedOnlySteps(flow, execution, nodes, edges);
	return warnings.length > 0 ? { nodes, edges, warnings } : { nodes, edges };
}
