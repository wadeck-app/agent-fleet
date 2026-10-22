import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Badge, ButtonLink } from '@wadeck-app/dsl-ui';
import { Background, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import type { FlowGraphResult } from 'flow-core';
import { buildGraphTree, defaultCollapsedIds, executionLogsPath, executionStepLogsPath } from 'flow-core/graph-tree';

import { describeChartMode } from './ChartMode.js';
import { ChartToolbar } from './ChartToolbar.js';
import { planChartView } from './ChartViewPlan.js';
import { FlowStepNode } from './FlowStepNode.js';
import { pickFocusStep } from './FocusStep.js';
import type { LayoutDirection } from './GraphLayout.js';
import { GraphLegend } from './GraphLegend.js';
import { InitialViewport } from './InitialViewport.js';
import { nodeStyle } from './NodeAppearance.js';
import { useShellColorMode } from './ShellColorMode.js';
import { summarizeStatuses } from './StatusSummary.js';
import { StepDetailsPanel } from './StepDetailsPanel.js';
import { toFlowElements } from './ToFlowElements.js';

const NODE_TYPES = { step: FlowStepNode };

// Written out in full: Tailwind finds classes by scanning source text.
const DETAILS_OVERLAY_CLASS = 'mt-3 lg:pointer-events-none lg:absolute lg:inset-y-0 lg:right-2 lg:mt-0 lg:w-80 lg:py-2';
const DETAILS_STICKY_CLASS = 'lg:pointer-events-auto lg:sticky lg:top-2 lg:max-h-[calc(100vh-1rem)] lg:overflow-auto';

const WARNING_BANNER_CLASS = 'rounded-md border border-warning bg-warning-bg px-3 py-2 text-sm text-warning-text';

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
		if (baseline === undefined && width > 0 && graph.nodes.length > 0) {
			setBaseline({ graph, width });
		}
	}, [baseline, graph]);
	// Parents the reader folded (true) or unfolded (false); the others follow the default rule. Kept by step id, so a refresh of a running flow keeps them.
	const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
	const collapsed = useMemo(() => {
		const folded = defaultCollapsedIds(buildGraphTree(graph));
		for (const [id, fold] of toggled) {
			if (fold) {
				folded.add(id);
			} else {
				folded.delete(id);
			}
		}
		return folded;
	}, [graph, toggled]);
	const toggleCollapse = (stepId: string) =>
		setToggled(previous => new Map(previous).set(stepId, !collapsed.has(stepId)));
	// The direction the chart opens with (with the default folding): folding a parent later must not flip it.
	const openingDirection = useMemo(
		() =>
			baseline
				? planChartView(
						baseline.graph,
						baseline.width,
						window.innerHeight,
						undefined,
						defaultCollapsedIds(buildGraphTree(baseline.graph))
					).direction
				: undefined,
		[baseline]
	);
	const plan = useMemo(
		() =>
			baseline
				? planChartView(
						baseline.graph,
						baseline.width,
						window.innerHeight,
						chosenDirection ?? openingDirection,
						collapsed
					)
				: undefined,
		[baseline, chosenDirection, openingDirection, collapsed]
	);
	const direction: LayoutDirection = plan?.direction ?? 'LR';
	const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
	const colorMode = useShellColorMode();
	const [focusedOnStep, setFocusedOnStep] = useState(false);
	const focusId = useMemo(
		() => (graph.nodes.length > 0 ? pickFocusStep(graph, direction, collapsed) : ''),
		[graph, direction, collapsed]
	);

	const elements = useMemo(
		() => toFlowElements(graph, direction, selectedId, { collapsed, onToggle: toggleCollapse }),
		// toggleCollapse is rebuilt every render and only reads `collapsed`, already a dependency.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[graph, direction, selectedId, collapsed]
	);
	const mode = describeChartMode(execution);
	const focusLabel = graph.nodes.find(n => n.id === focusId)?.label;
	const selected = graph.nodes.find(node => node.id === selectedId);
	const edgeKinds = useMemo(() => new Set(graph.edges.map(edge => edge.kind)), [graph]);

	const pathLabels = useMemo(() => new Set(graph.nodes.map(node => nodeStyle(node).label)), [graph]);
	const labelOf = (stepId: string): string => graph.nodes.find(node => node.id === stepId)?.label ?? stepId;

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
						{' - '}
						{summarizeStatuses(graph)}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<div className="max-w-md">
						<p className="flex items-center gap-2 text-sm font-semibold text-content">
							<span>{mode.title}</span>
							{execution && <Badge label={execution.status} variant={executionBadge(execution.status)} />}
						</p>
						<p className="text-xs text-muted">{mode.hint}</p>
					</div>
					{execution && (
						<ButtonLink
							to={executionLogsPath(execution.executionId)}
							label="Logs"
							variant="secondary"
							size="sm"
						/>
					)}
				</div>
			</header>

			{refreshError !== undefined && (
				<div role="alert" className={WARNING_BANNER_CLASS}>
					The chart could not be refreshed: {refreshError} The last known state is shown; it is retried every
					few seconds.
				</div>
			)}

			{graph.warnings && graph.warnings.length > 0 && (
				<div role="status" aria-label="Chart warnings" className={WARNING_BANNER_CLASS}>
					{graph.warnings.map(warning => (
						<p key={warning}>{warning}</p>
					))}
				</div>
			)}

			<div className="flex flex-col gap-3">
				<div ref={columnRef} className="flex min-w-0 flex-1 flex-col gap-2">
					<ReactFlowProvider>
						<ChartToolbar
							onFit={() => setFocusedOnStep(false)}
							direction={direction}
							onToggleDirection={() => {
								setFocusedOnStep(false);
								setChosenDirection(direction === 'LR' ? 'TB' : 'LR');
							}}
							hint={
								focusedOnStep
									? `Zoomed in on step '${focusLabel}' (readable size). The whole flow does not fit at that size: drag to move along it, or use Fit to view to see all of it, smaller.`
									: selected === undefined
										? 'Click a step to see its status, path, inputs, outputs and error.'
										: undefined
							}
						/>
						{plan && (
							<div className="relative">
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
											direction={direction}
											onFocused={setFocusedOnStep}
										/>
									</ReactFlow>
								</div>
								{selected !== undefined && (
									// Over the canvas on wide windows (the chart keeps the full width), below it on narrow ones; sticky so it stays in view on a tall canvas.
									<div className={DETAILS_OVERLAY_CLASS}>
										<div className={DETAILS_STICKY_CLASS}>
											<StepDetailsPanel
												step={selected}
												labelOf={labelOf}
												onSelectStep={setSelectedId}
												logsPath={
													execution &&
													executionStepLogsPath(execution.executionId, selected.id)
												}
												onClose={() => setSelectedId(undefined)}
											/>
										</div>
									</div>
								)}
							</div>
						)}
					</ReactFlowProvider>
					<GraphLegend
						modeHint={mode.hint}
						showStatuses={execution !== undefined}
						edgeKinds={edgeKinds}
						pathLabels={pathLabels}
						showPath={graph.nodes.some(node => node.path !== undefined)}
					/>
				</div>
			</div>
		</div>
	);
}
