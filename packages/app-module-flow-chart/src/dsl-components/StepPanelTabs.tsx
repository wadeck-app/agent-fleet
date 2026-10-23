import { useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { PanelSection } from './StepPanelSections.js';

const TAB_BASE_CLASS = 'whitespace-nowrap rounded-t-md border-b-2 px-2 py-1 text-xs font-medium';
const TAB_ACTIVE_CLASS = 'border-primary-solid text-content';
const TAB_IDLE_CLASS = 'border-transparent text-muted hover:text-content';

/** The tab to open: the error of a failed step, else the first one (the summary). */
function defaultTab(sections: readonly PanelSection[]): string {
	const first = sections.find(section => section.id === 'error') ?? sections[0];
	if (first === undefined) {
		throw new Error('A step panel always has at least a Summary section.');
	}
	return first.id;
}

/**
 * One block at a time. The caller gives it `key={step.id}` so another step starts again on its default tab.
 * Arrow keys, Home and End move between the tabs (roving tabindex, the focused tab is the selected one).
 */
export function StepPanelTabs({ sections, bodyClass }: { sections: readonly PanelSection[]; bodyClass: string }) {
	const [selected, setSelected] = useState(() => defaultTab(sections));
	const active = sections.find(section => section.id === selected) ?? sections[0];
	if (active === undefined) {
		throw new Error('A step panel always has at least a Summary section.');
	}
	const select = (index: number) => {
		const target = sections[(index + sections.length) % sections.length];
		if (target === undefined) {
			return;
		}
		setSelected(target.id);
		document.getElementById(`step-tab-${target.id}`)?.focus();
	};
	const onKeyDown = (event: KeyboardEvent, index: number) => {
		const moves: Record<string, number> = {
			ArrowRight: index + 1,
			ArrowLeft: index - 1,
			Home: 0,
			End: sections.length - 1,
		};
		const target = moves[event.key];
		if (target !== undefined) {
			event.preventDefault();
			select(target);
		}
	};
	return (
		<>
			<div
				role="tablist"
				aria-label="Step sections"
				className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2"
			>
				{sections.map((section, index) => (
					// violations-suppress: react/no-raw-button role="tab" with roving tabindex; ButtonAction cannot carry a role or tabIndex
					<button
						key={section.id}
						id={`step-tab-${section.id}`}
						type="button"
						role="tab"
						aria-selected={section.id === active.id}
						aria-controls={`step-tabpanel-${section.id}`}
						tabIndex={section.id === active.id ? 0 : -1}
						className={`${TAB_BASE_CLASS} ${section.id === active.id ? TAB_ACTIVE_CLASS : TAB_IDLE_CLASS}`}
						onClick={() => setSelected(section.id)}
						onKeyDown={event => onKeyDown(event, index)}
					>
						{section.title}
					</button>
				))}
			</div>
			<div
				role="tabpanel"
				id={`step-tabpanel-${active.id}`}
				aria-labelledby={`step-tab-${active.id}`}
				tabIndex={0}
				data-testid="panel-body"
				className={bodyClass}
			>
				{active.render(false)}
			</div>
		</>
	);
}
