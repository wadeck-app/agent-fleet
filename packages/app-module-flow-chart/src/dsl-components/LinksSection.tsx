import { ButtonLink } from '@wadeck-app/dsl-ui';

import { IOLinkList } from './IOLinkList.js';
import type { IOView } from './StepIODetails.js';

/** Steps this one reads from and steps that read it; the Logs link of the step comes after them. */
export function LinksSection({
	view,
	onSelectStep,
	logsPath,
}: {
	view: IOView | undefined;
	onSelectStep: (stepId: string) => void;
	logsPath: string | undefined;
}) {
	const linked = view !== undefined && (view.usesOutputOf.length > 0 || view.usedBy.length > 0);
	return (
		<div className="flex flex-col gap-2">
			{linked && (
				<section aria-label="Data flow" className="flex flex-col gap-2">
					<IOLinkList title="Uses output of" links={view.usesOutputOf} onSelectStep={onSelectStep} />
					<IOLinkList title="Used by" links={view.usedBy} onSelectStep={onSelectStep} />
				</section>
			)}
			{logsPath !== undefined && (
				<div>
					<ButtonLink to={logsPath} label="Logs of this step" variant="secondary" size="sm" />
				</div>
			)}
		</div>
	);
}
