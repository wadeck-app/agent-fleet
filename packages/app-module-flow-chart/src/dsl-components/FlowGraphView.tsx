import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Badge, ButtonLink } from '@wadeck-app/dsl-ui';
import {
	Background,
	ReactFlow,
	ReactFlowProvider,
	getNodesBounds,
	getViewportForBounds,
	useReactFlow,
	useStore,
} from '@xyflow/react';
import type { FlowGraphResult } from 'flow-core';

import { FIT_PADDING, MAX_FIT_ZOOM, planChartView } from './ChartViewPlan.js';
import { FlowStepNode } from './FlowStepNode.js';
import { pickFocusStep } from './FocusStep.js';
import type { LayoutDirection } from './GraphLayout.js';
import { GraphLegend } from './GraphLegend.js';
import { useShellColorMode } from './ShellColorMode.js';
import { summarizeStatuses } from './StatusSummary.js';
import { StepDetailsPanel } from './StepDetailsPanel.js';
import { toFlowElements } from './ToFlowElements.js';

const NODE_TYPES = { step: FlowStepNode };
const FIT_OPTIONS = { padding: FIT_PADDING, minZoom: 0.1, maxZoom: MAX_FIT_ZOOM };
const FOCUS_ZOOM = 0.85;
const FOCUS_TOP_SHARE = 0.15;

/**
 * Fits the whole chart once the nodes are measured. When the plan says the chart cannot be readable even fitted
 * on the tallest canvas (`focus`), it opens on the step that matters (first failed, running, or first) and says
 * so; "Fit to view" shows everything.
 */
function InitialViewport({
	focusId,
	focus,
	onFocused,
}: {
	focusId: string;
	focus: boolean;
	onFocused: (focusedOn: boolean) => void;
}) {
	const flow = useReactFlow();
	const width = useStore(state => state.width);
	const height = useStore(state => state.height);
	const done = useRef(false);
	useEffect(() => {
		// Wait for the canvas to be measured; the node sizes are known from the layout.
		if (width === 0 || height === 0 || done.current) return;
		done.current = true;
		const nodes = flow.getNodes();
		const fitted = getViewportForBounds(
			getNodesBounds(nodes),
			width,
			height,
			FIT_OPTIONS.minZoom,
			FIT_OPTIONS.maxZoom,
			FIT_OPTIONS.padding
		);
		const target = nodes.find(node => node.id === focusId);
		if (!focus || target === undefined) {
			void flow.setViewport(fitted);
			return;
		}
		// The step is centered horizontally and sits in the upper part, so its successors are visible below it.
		const centerX = target.position.x + (target.width ?? 0) / 2;
		const topY = target.position.y;
		void flow.setViewport({
			x: width / 2 - centerX * FOCUS_ZOOM,
			y: height * FOCUS_TOP_SHARE - topY * FOCUS_ZOOM,
			zoom: FOCUS_ZOOM,
		});
		onFocused(true);
	}, [width, height, flow, focusId, focus, onFocused]);
	return null;
}

type BadgeVariant = NonNullable<Parameters<typeof Badge>[0]['variant']>;

const EXECUTION_BADGES: Record<string, BadgeVariant> = {
	completed: 'success',
	failed: 'danger',
	running: 'primary',
	queued: 'default',
	're-queued': 'default',
};

function executionBadge(status: string): BadgeVariant {
	const variant = EXECUTION_BADGES[status];
	if (variant === undefined) {
		throw new Error(`Unknown execution status '${status}': add it to EXECUTION_BADGES in FlowGraphView.tsx.`);
	}
	return variant;
}

/** Above the canvas, not over it: a floating toolbar covers the first steps of the chart. */
function Toolbar({
	direction,
	onToggleDirection,
	onFit,
	hint,
}: {
	direction: LayoutDirection;
	onToggleDirection: () => void;
	onFit: () => void;
	hint: string | undefined;
}) {
	const flow = useReactFlow();
	const button =
		'rounded-md border border-border bg-surface px-2 py-1 text-xs text-content hover:bg-muted-bg focus:outline-none focus:ring-2 focus:ring-primary';
	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<p className="min-w-0 text-xs text-muted">{hint}</p>
			<div className="flex flex-wrap gap-1" role="toolbar" aria-label="Chart controls">
				<button type="button" className={button} onClick={() => void flow.zoomIn()} aria-label="Zoom in">
					+
				</button>
				<button type="button" className={button} onClick={() => void flow.zoomOut()} aria-label="Zoom out">
					-
				</button>
				<button
					type="button"
					className={button}
					onClick={() => {
						onFit();
						void flow.fitView({ ...FIT_OPTIONS, duration: 200 });
					}}
				>
					Fit to view
				</button>
				<button type="button" className={button} onClick={onToggleDirection}>
					{direction === 'LR' ? 'Switch to vertical layout' : 'Switch to horizontal layout'}
				</button>
			</div>
		</div>
	);
}

/**
 * The chart of a loaded graph: header, canvas (pan, zoom, fit; read-only), legend and the details of the selected
 * step. Only draws; loading and errors are FlowGraph's job.
 */
export function FlowGraphView({ result, refreshError }: { result: FlowGraphResult; refreshError?: string }) {
	const { graph, execution } = result;
	const columnRef = useRef<HTMLDivElement>(null);
	// The plan is made once, from the first measured width and the graph then loaded: a refresh of a running flow
	// must not flip the layout under the reader's eyes.
	const [baseline, setBaseline] = useState<{ graph: FlowGraphResult['graph']; width: number } | undefined>(undefined);
	const [chosenDirection, setChosenDirection] = useState<LayoutDirection | undefined>(undefined);
	useLayoutEffect(() => {
		const width = columnRef.current?.offsetWidth ?? 0;
		if (baseline === undefined && width > 0 && graph.nodes.length > 0) setBaseline({ graph, width });
	}, [baseline, graph]);
	const plan = useMemo(
		() =>
			baseline ? planChartView(baseline.graph, baseline.width, window.innerHeight, chosenDirection) : undefined,
		[baseline, chosenDirection]
	);
	const direction: LayoutDirection = plan?.direction ?? 'LR';
	const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
	const colorMode = useShellColorMode();
	const [focusedOnStep, setFocusedOnStep] = useState(false);
	const focusId = useMemo(() => (graph.nodes.length > 0 ? pickFocusStep(graph) : ''), [graph]);

	const elements = useMemo(() => toFlowElements(graph, direction, selectedId), [graph, direction, selectedId]);
	const focusLabel = graph.nodes.find(n => n.id === focusId)?.label;
	const selected = graph.nodes.find(node => node.id === selectedId);
	const edgeKinds = useMemo(() => new Set(graph.edges.map(edge => edge.kind)), [graph]);

	const back = execution
		? {
				to: `/modules/flow/executions/${encodeURIComponent(execution.executionId)}`,
				label: 'Back to the execution',
			}
		: { to: '/modules/flow-chart/flows', label: 'Back to flow charts' };

	if (graph.nodes.length === 0) {
		return (
			<div className="rounded-lg border border-border bg-surface p-6 text-sm text-content" role="status">
				Flow '{result.flowName}' has no step to draw ({result.flowFile}). Add steps to the flow file, then
				reload.
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<h2 className="truncate font-mono text-lg font-semibold text-content" title={result.flowFile}>
						{result.flowId}
					</h2>
					<p className="text-xs text-muted">
						{result.flowName !== result.flowId && <span>{result.flowName}</span>}
						{execution && <span className="font-mono"> - {execution.executionId}</span>}
						{' - '}
						{summarizeStatuses(graph)}
					</p>
				</div>
				<div className="flex items-center gap-2">
					{execution ? (
						<Badge label={execution.status} variant={executionBadge(execution.status)} />
					) : (
						<Badge label="definition" variant="default" />
					)}
					<ButtonLink to={back.to} label={back.label} variant="secondary" size="sm" />
				</div>
			</header>

			{refreshError !== undefined && (
				<div
					role="alert"
					className="rounded-md border border-warning bg-warning-bg px-3 py-2 text-sm text-warning-text"
				>
					The chart could not be refreshed: {refreshError} The last known state is shown; it is retried every
					few seconds.
				</div>
			)}

			{graph.warnings && graph.warnings.length > 0 && (
				<div
					role="status"
					aria-label="Chart warnings"
					className="rounded-md border border-warning bg-warning-bg px-3 py-2 text-sm text-warning-text"
				>
					{graph.warnings.map(warning => (
						<p key={warning}>{warning}</p>
					))}
				</div>
			)}

			<div className="flex flex-col gap-3 lg:flex-row">
				<div ref={columnRef} className="flex min-w-0 flex-1 flex-col gap-2">
					<ReactFlowProvider>
						<Toolbar
							onFit={() => setFocusedOnStep(false)}
							direction={direction}
							onToggleDirection={() => {
								setFocusedOnStep(false);
								setChosenDirection(direction === 'LR' ? 'TB' : 'LR');
							}}
							hint={
								focusedOnStep
									? `Zoomed in on step '${focusLabel}'. The whole flow does not fit at a readable size: Fit to view shows all of it.`
									: undefined
							}
						/>
						{plan && (
							<div
								className="relative min-h-[420px] overflow-hidden rounded-lg border border-border bg-bg"
								style={{ height: plan.canvasHeight }}
								data-testid="chart-canvas"
							>
								<ReactFlow
									// A new layout direction is a new chart: remounting re-runs the initial fit.
									key={direction}
									nodes={elements.nodes}
									edges={elements.edges}
									nodeTypes={NODE_TYPES}
									// Same as the shell: xyflow's class name re-scopes the shell's color tokens.
									colorMode={colorMode}
									minZoom={0.1}
									maxZoom={2}
									// On a canvas taller than the window the page scrolls over it: zooming needs ctrl/cmd + wheel.
									zoomOnScroll={!plan.grown}
									preventScrolling={!plan.grown}
									nodesDraggable={false}
									nodesConnectable={false}
									edgesFocusable={false}
									elementsSelectable
									onNodeClick={(_event, node) => setSelectedId(node.id)}
									onPaneClick={() => setSelectedId(undefined)}
									proOptions={{ hideAttribution: true }}
								>
									<Background color="var(--color-border)" gap={20} />
									<InitialViewport
										focusId={focusId}
										focus={plan.focus}
										onFocused={setFocusedOnStep}
									/>
								</ReactFlow>
							</div>
						)}
					</ReactFlowProvider>
					<GraphLegend showStatuses={execution !== undefined} edgeKinds={edgeKinds} />
				</div>
				<div className="w-full shrink-0 lg:w-80">
					<StepDetailsPanel step={selected} onClose={() => setSelectedId(undefined)} />
				</div>
			</div>
		</div>
	);
}
