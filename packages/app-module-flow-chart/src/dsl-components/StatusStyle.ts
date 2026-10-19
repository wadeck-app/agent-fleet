import type { FlowGraphNode } from 'flow-core';

export type NodeStatus = NonNullable<FlowGraphNode['status']>;

/** Run order, as shown in the legend. */
export const STATUS_LEGEND: readonly NodeStatus[] = ['pending', 'running', 'completed', 'failed'];

export interface StatusStyle {
	/** The status word shown on the node and in the legend. */
	label: string;
	/** A glyph next to the word: the color is never the only carrier of the status. */
	glyph: string;
	/** Classes of the node box (dsl-ui tokens only). */
	nodeClass: string;
	/** Classes of the small status badge. */
	badgeClass: string;
}

// Written out in full: Tailwind finds classes by scanning source text, so they cannot be assembled from parts.
const STYLES: Record<NodeStatus | 'none', StatusStyle> = {
	completed: {
		label: 'completed',
		glyph: '[ok]',
		nodeClass: 'border-success bg-success-bg text-success-text',
		badgeClass: 'bg-success text-surface',
	},
	failed: {
		label: 'failed',
		glyph: '[x]',
		nodeClass: 'border-danger bg-danger-bg text-danger-text',
		badgeClass: 'bg-danger text-surface',
	},
	running: {
		label: 'running',
		glyph: '[>]',
		nodeClass: 'border-primary bg-info-bg text-info-text',
		badgeClass: 'bg-primary text-surface',
	},
	pending: {
		label: 'pending',
		glyph: '[ ]',
		nodeClass: 'border-border bg-muted-bg text-muted',
		badgeClass: 'bg-muted text-surface',
	},
	none: {
		label: 'not run',
		glyph: '[-]',
		nodeClass: 'border-border bg-surface text-content',
		badgeClass: 'bg-muted-bg text-muted',
	},
};

/** `undefined` is a node of a definition drawn without any run. Any other value must be a flow-core status. */
export function statusStyle(status: NodeStatus | undefined): StatusStyle {
	if (status === undefined) {
		return STYLES.none;
	}
	const style = (STYLES as Record<string, StatusStyle | undefined>)[status];
	if (style === undefined || status === ('none' as string)) {
		throw new Error(
			`Unknown step status '${String(status)}': expected one of ${STATUS_LEGEND.join(', ')}. flow-core added a status? Add it to StatusStyle.ts.`
		);
	}
	return style;
}
