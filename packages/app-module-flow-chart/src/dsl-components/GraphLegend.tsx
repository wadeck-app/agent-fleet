import { EdgeSample } from './EdgeSample.js';
import { EDGE_LEGEND } from './EdgeStyle.js';
import { PATH_LEGEND } from './NodeAppearance.js';
import { STATUS_LEGEND, statusStyle } from './StatusStyle.js';

interface GraphLegendProps {
	/** What the chart shows, in the words of the header (ChartMode). */
	modeHint: string;
	/** Status entries only mean something when the graph carries a run. */
	showStatuses: boolean;
	/** Edge kinds present in the graph: the legend explains what is drawn, not what could be. */
	edgeKinds: ReadonlySet<string>;
	/** Labels of the path-only looks (skipped, not reached) present in the graph. */
	pathLabels?: ReadonlySet<string>;
	/** The graph carries the path of a run: explain the numbers and the heavy/faded edges. */
	showPath?: boolean;
}

export function GraphLegend({ modeHint, showStatuses, edgeKinds, pathLabels, showPath }: GraphLegendProps) {
	const edges = EDGE_LEGEND.filter(entry => edgeKinds.has(entry.kind));
	return (
		<ul aria-label="Legend" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
			<li className="font-medium">{modeHint}</li>
			{showStatuses &&
				STATUS_LEGEND.map(status => {
					const style = statusStyle(status);
					return (
						<li key={status} className="flex items-center gap-1.5">
							<span
								aria-hidden="true"
								className={`inline-block h-3 w-3 rounded border-2 ${style.nodeClass}`}
							/>
							{style.glyph} {style.label}
						</li>
					);
				})}
			{PATH_LEGEND.filter(style => pathLabels?.has(style.label)).map(style => (
				<li key={style.label} className="flex items-center gap-1.5">
					<span aria-hidden="true" className={`inline-block h-3 w-3 rounded border-2 ${style.nodeClass}`} />
					{style.glyph} {style.label}
				</li>
			))}
			{showPath && (
				<>
					<li>1, 2, ...: run order (recorded: start of each step's latest attempt)</li>
					<li>
						heavy edge: followed by the run; faded edge: not followed (both inferred from dependencies and
						times, not recorded)
					</li>
				</>
			)}
			{edges.map(entry => (
				<li key={entry.kind} className="flex items-center gap-1.5">
					<EdgeSample kind={entry.kind} />
					{entry.description}
				</li>
			))}
		</ul>
	);
}
