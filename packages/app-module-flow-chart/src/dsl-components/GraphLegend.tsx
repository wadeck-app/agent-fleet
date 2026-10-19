import { EDGE_LEGEND, edgeStyle } from './EdgeStyle.js';
import { STATUS_LEGEND, statusStyle } from './StatusStyle.js';

interface GraphLegendProps {
	/** Status entries only mean something when the graph carries a run. */
	showStatuses: boolean;
	/** Edge kinds present in the graph: the legend explains what is drawn, not what could be. */
	edgeKinds: ReadonlySet<string>;
}

function EdgeSample({ kind }: { kind: (typeof EDGE_LEGEND)[number]['kind'] }) {
	const style = edgeStyle(kind);
	return (
		<svg width="28" height="8" aria-hidden="true">
			<line x1="1" y1="4" x2="27" y2="4" stroke={style.stroke} strokeWidth="2" strokeDasharray={style.dash} />
		</svg>
	);
}

export function GraphLegend({ showStatuses, edgeKinds }: GraphLegendProps) {
	const edges = EDGE_LEGEND.filter(entry => edgeKinds.has(entry.kind));
	return (
		<ul aria-label="Legend" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
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
			{edges.map(entry => (
				<li key={entry.kind} className="flex items-center gap-1.5">
					<EdgeSample kind={entry.kind} />
					{entry.description}
				</li>
			))}
		</ul>
	);
}
