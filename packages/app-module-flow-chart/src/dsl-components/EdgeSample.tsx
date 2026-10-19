import { type EDGE_LEGEND, edgeStyle } from './EdgeStyle.js';

/** A short line drawn like the edges of the given kind, for the legend. */
export function EdgeSample({ kind }: { kind: (typeof EDGE_LEGEND)[number]['kind'] }) {
	const style = edgeStyle(kind);
	return (
		// violations-suppress: react/no-inline-svg this file is the dedicated SVG component the rule asks for; it is not a registry atomic, so the rule cannot see that
		<svg width="28" height="8" aria-hidden="true">
			<line x1="1" y1="4" x2="27" y2="4" stroke={style.stroke} strokeWidth="2" strokeDasharray={style.dash} />
		</svg>
	);
}
