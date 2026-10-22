import { ButtonAction } from '@wadeck-app/dsl-ui';

import type { IOLinkView } from './StepIODetails.js';

const HEADING_CLASS = 'text-xs font-semibold uppercase tracking-wide text-muted';

/** Steps linked through a reference to an output; the name selects the step in the chart. */
export function IOLinkList({
	title,
	links,
	onSelectStep,
}: {
	title: string;
	links: IOLinkView[];
	onSelectStep: (stepId: string) => void;
}) {
	if (links.length === 0) {
		return null;
	}
	return (
		<div>
			<div className={HEADING_CLASS}>{title}</div>
			<ul className="mt-1 flex flex-col gap-1">
				{links.map(link => (
					<li key={link.stepId} className="flex flex-wrap items-center gap-2">
						<ButtonAction
							label={link.label}
							variant="secondary"
							size="sm"
							onClick={() => onSelectStep(link.stepId)}
						/>
						<span className="text-xs text-muted">({link.detail})</span>
					</li>
				))}
			</ul>
		</div>
	);
}
