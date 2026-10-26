import { useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { ButtonAction } from '@wadeck-app/dsl-ui';
import type { FlowGraphNode } from 'flow-core';

import { nodeStyle } from './NodeAppearance.js';
import { DENSITY_CLASSES, PANEL_BODY_SCROLL_CLASS } from './PanelDensity.js';
import { StepPanelAccordion } from './StepPanelAccordion.js';
import type { StepPanelDensity, StepPanelLayout } from './StepPanelExperiment.js';
import { type PanelSection, buildPanelSections } from './StepPanelSections.js';
import { StepPanelTabs } from './StepPanelTabs.js';

const BADGE_BASE_CLASS = 'inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium';
// Written out in full: Tailwind finds classes by scanning source text.
// The sticky shell top bar publishes its height in --app-shell-bar-height (0px outside the shell): the panel sticks and sizes under it.
// A column that clips: the header keeps its height, the body takes the rest and scrolls. The cap is the frame: on a wide window the panel sits in a slot as tall as the chart and is never taller than it nor than the window (the chart can be taller than the window), below the chart on a narrow one (70% of the window).
const PANEL_CLASS =
	'flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface text-content shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-solid max-h-[70vh] lg:max-h-[min(100%,calc(100vh-var(--app-shell-bar-height,0px)-1rem))]';
// The drawer slot is as tall as the chart: the panel fills it, and follows the window on a chart taller than it.
const DRAWER_FIT_CLASS =
	'lg:sticky lg:top-[calc(var(--app-shell-bar-height,0px)+0.5rem)] lg:h-[min(100%,calc(100vh-var(--app-shell-bar-height,0px)-1rem))]';
// Only the panel catches the pointer where the slot lets the chart through; it follows the window on a chart taller than it.
const FLOATING_FIT_CLASS = 'lg:pointer-events-auto lg:sticky lg:top-[calc(var(--app-shell-bar-height,0px)+0.5rem)]';

interface StepDetailsPanelProps {
	step: FlowGraphNode;
	/** Label of any step of the graph, for the data-flow links. */
	labelOf: (stepId: string) => string;
	onSelectStep: (stepId: string) => void;
	onClose: () => void;
	/** The logs page of the run opened on this step; absent for a definition drawn without a run. */
	logsPath: string | undefined;
	layout: StepPanelLayout;
	density: StepPanelDensity;
}

/** The body under the header: every block stacked (overlay, drawer), one tab at a time, or collapsible sections. */
function bodyFor(
	layout: StepPanelLayout,
	stepId: string,
	sections: readonly PanelSection[],
	bodyClass: string,
	gapClass: string
): ReactNode {
	switch (layout) {
		// The key restarts the tab / open sections from their defaults when another step is shown.
		case 'tabs':
			return <StepPanelTabs key={stepId} sections={sections} bodyClass={bodyClass} />;
		case 'accordion':
			return <StepPanelAccordion key={stepId} sections={sections} bodyClass={bodyClass} />;
		case 'overlay':
		case 'drawer':
			return (
				<div
					data-testid="panel-body"
					tabIndex={0}
					aria-label="Step details content"
					className={`${bodyClass} flex flex-col ${gapClass}`}
				>
					{sections.map(section => (
						<div key={section.id}>{section.render(true)}</div>
					))}
				</div>
			);
		default:
			throw new Error(
				`Unknown step panel layout '${String(layout)}': add it to bodyFor in StepDetailsPanel.tsx.`
			);
	}
}

/**
 * The facts of the selected step. The caller renders it only while a step is selected, so it never takes room from
 * the chart. Whatever the layout, it never grows past its frame: the header (name, status, close) stays and the
 * body scrolls. It takes the focus when it opens or shows another step, and Escape inside it closes it.
 */
export function StepDetailsPanel({
	step,
	labelOf,
	onSelectStep,
	onClose,
	logsPath,
	layout,
	density,
}: StepDetailsPanelProps) {
	const panelRef = useRef<HTMLElement>(null);
	useEffect(() => {
		const panel = panelRef.current;
		if (panel === null) {
			return;
		}
		panel.focus({ preventScroll: true });
		// On a narrow window the panel sits under the chart, out of sight: bring it into view. Beside the chart it already is, and the page must not jump.
		if (panel.getBoundingClientRect().top >= window.innerHeight) {
			panel.scrollIntoView({ block: 'nearest' });
		}
	}, [step.id]);
	const classes = DENSITY_CLASSES[density];
	const style = nodeStyle(step);
	const sections = buildPanelSections({ step, labelOf, onSelectStep, logsPath, density: classes });
	const bodyClass = `${PANEL_BODY_SCROLL_CLASS} ${classes.padding}`;
	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			event.stopPropagation();
			onClose();
		}
	};
	const fitClass = layout === 'drawer' ? DRAWER_FIT_CLASS : FLOATING_FIT_CLASS;
	return (
		<aside
			ref={panelRef}
			aria-label="Step details"
			tabIndex={-1}
			onKeyDown={onKeyDown}
			className={`${PANEL_CLASS} ${classes.text} ${fitClass}`}
		>
			<div
				data-testid="panel-header"
				className={`flex shrink-0 items-start justify-between gap-2 border-b border-border ${classes.padding}`}
			>
				<div className="flex min-w-0 flex-col gap-1">
					<div className="break-words text-base font-semibold">{step.label}</div>
					{step.label !== step.id && <div className="break-all font-mono text-xs text-muted">{step.id}</div>}
					<div className={`${BADGE_BASE_CLASS} ${style.nodeClass}`}>
						<span aria-hidden="true">{style.glyph}</span> {style.label}
					</div>
				</div>
				<ButtonAction label="Close" variant="secondary" size="sm" onClick={onClose} />
			</div>
			{bodyFor(layout, step.id, sections, bodyClass, classes.gap)}
		</aside>
	);
}
