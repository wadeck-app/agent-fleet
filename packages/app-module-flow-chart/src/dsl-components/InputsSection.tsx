import { NamedList } from './NamedList.js';
import { SectionHeading } from './SectionHeading.js';
import type { IOView } from './StepIODetails.js';
import { ValueBlocks } from './ValueBlocks.js';

/** The inputs of the step as declared, the resolved values the run recorded, else the note that they are not. */
export function InputsSection({
	view,
	showHeading,
	blockHeightClass,
}: {
	view: IOView;
	showHeading: boolean;
	blockHeightClass: string;
}) {
	return (
		<section aria-label="Inputs" className="flex flex-col gap-2">
			<SectionHeading show={showHeading}>Inputs</SectionHeading>
			{view.inputs.length > 0 && <NamedList items={view.inputs} />}
			<ValueBlocks blocks={view.recordedInputs} heightClass={blockHeightClass} />
			{view.inputsNote !== '' && <p className="text-xs italic text-muted">{view.inputsNote}</p>}
		</section>
	);
}
