import { NamedList } from './NamedList.js';
import { SectionHeading } from './SectionHeading.js';
import type { IOView } from './StepIODetails.js';

/** The inputs of the step as declared, and the note that resolved values are not recorded. */
export function InputsSection({ view, showHeading }: { view: IOView; showHeading: boolean }) {
	return (
		<section aria-label="Inputs" className="flex flex-col gap-1">
			<SectionHeading show={showHeading}>Inputs</SectionHeading>
			{view.inputs.length > 0 && <NamedList items={view.inputs} />}
			<p className="text-xs italic text-muted">{view.inputsNote}</p>
		</section>
	);
}
