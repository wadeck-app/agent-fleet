import type { StepStatus } from '../execution/ExecutionState.js';

/**
 * Step kinds of the flow DSL (`type:` of a step), plus `injected` for steps an execution created at
 * run time (provideSteps) that have no counterpart in the flow file, and `removed` for steps the run recorded
 * that the flow file no longer declares (the file was edited or regenerated after the run).
 */
export type FlowGraphNodeKind = 'model' | 'script' | 'subflow' | 'user_intervention' | 'injected' | 'removed';

/**
 * - dependency: `depends` without `when`
 * - conditional: `depends` on a step with a `when` condition (label = the condition)
 * - loop: `onFailure.goto` (from the failing step back to the target)
 * - substep: `parent` (from the sub-step to its parent step)
 * - sequence: inferred from the order the steps ran, for steps whose dependencies are not recorded anywhere
 */
export type FlowGraphEdgeKind = 'dependency' | 'conditional' | 'loop' | 'substep' | 'sequence';

export interface FlowGraphNode {
	/** Step id, unique within the graph. */
	id: string;
	kind: FlowGraphNodeKind;
	/** Step name, or the id when the step has none. */
	label: string;
	/** Only present when the graph was built with an execution state. A step absent from the state is `pending`. */
	status?: StepStatus;
	/** Same wording as `flow show` (`12.3s`, `2m5s`, `running`); only for steps that started. */
	durationLabel?: string;
	attempts?: number;
	/** Display details; values are plain scalars so a UI can list them without knowing the shape. */
	meta?: Record<string, string | number | boolean>;
}

export interface FlowGraphEdge {
	from: string;
	to: string;
	kind: FlowGraphEdgeKind;
	label?: string;
}

export interface FlowGraph {
	nodes: FlowGraphNode[];
	edges: FlowGraphEdge[];
	/** Things a reader must know to interpret the chart correctly (stale flow file, inferred edges); absent when none. */
	warnings?: string[];
}

/** What a graph request is about: one run (definition + step states), or a definition alone. */
export type FlowGraphTarget = { executionId: string } | { flowId: string } | { flowFile: string };

export interface FlowGraphResult {
	graph: FlowGraph;
	flowId: string;
	flowName: string;
	/** The flow file the definition was read from. */
	flowFile: string;
	/** Set when the graph carries step states. */
	execution?: { executionId: string; status: string; startedAt: string; completedAt: string | null };
}
