import { SectionHeading } from './SectionHeading.js';
import type { IOView } from './StepIODetails.js';

/** Facts the record kept about the run of the step (exit code, session, tokens) and relaunch feedback. */
export function RunFactsSection({ view }: { view: IOView }) {
	if (view.run.length === 0 && view.relaunches.length === 0) {
		return null;
	}
	return (
		<section aria-label="Recorded run facts" className="flex flex-col gap-1">
			<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
				{view.run.map(row => (
					<div key={row.label} className="contents">
						<dt className="text-muted">{row.label}</dt>
						<dd className="break-all">{row.value}</dd>
					</div>
				))}
			</dl>
			{view.relaunches.length > 0 && (
				<div>
					<SectionHeading show>Relaunched after a failed sub-step</SectionHeading>
					<ul className="list-disc pl-4 text-xs">
						{view.relaunches.map(line => (
							<li key={line} className="break-words">
								{line}
							</li>
						))}
					</ul>
				</div>
			)}
		</section>
	);
}
