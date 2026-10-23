import { useState } from 'react';

import { ChevronIcon } from './ChevronIcon.js';
import type { PanelSection } from './StepPanelSections.js';

// Written out in full: Tailwind finds classes by scanning source text.
const HEADER_CLASS =
	'flex w-full items-center gap-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted hover:text-content';
const PANEL_BODY_CLASS = 'pb-2 pt-1';

/** Collapsible sections, the error (else the summary) open first. The caller gives it `key={step.id}` so another step starts again from the defaults. */
export function StepPanelAccordion({ sections, bodyClass }: { sections: readonly PanelSection[]; bodyClass: string }) {
	const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
	const isOpen = (section: PanelSection): boolean => toggled.get(section.id) ?? section.openByDefault;
	return (
		<div className={bodyClass} data-testid="panel-body" tabIndex={0} aria-label="Step details content">
			<ul className="flex flex-col divide-y divide-border">
				{sections.map(section => {
					const open = isOpen(section);
					return (
						<li key={section.id} className="py-1">
							{/* violations-suppress: react/no-raw-button a disclosure header needs aria-expanded and a plain text look; ButtonAction has neither */}
							<button
								type="button"
								id={`step-section-${section.id}`}
								aria-expanded={open}
								aria-controls={`step-section-body-${section.id}`}
								className={HEADER_CLASS}
								onClick={() => setToggled(previous => new Map(previous).set(section.id, !open))}
							>
								<ChevronIcon open={open} />
								{section.title}
							</button>
							{open && (
								<div
									id={`step-section-body-${section.id}`}
									role="group"
									aria-labelledby={`step-section-${section.id}`}
									className={PANEL_BODY_CLASS}
								>
									{section.render(false)}
								</div>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
}
