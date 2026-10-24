import { NamedList } from './NamedList.js';
import { SectionHeading } from './SectionHeading.js';
import type { IOView } from './StepIODetails.js';
import { ValueBlocks } from './ValueBlocks.js';

/** Declared outputs, the recorded outputs, the stdout / stderr kept and the note on what the record did not keep. */
export function OutputsSection({
	view,
	showHeading,
	blockHeightClass,
}: {
	view: IOView;
	showHeading: boolean;
	blockHeightClass: string;
}) {
	return (
		<section aria-label="Outputs" className="flex flex-col gap-2">
			<SectionHeading show={showHeading}>Outputs</SectionHeading>
			{view.declaredOutputs.length > 0 && <NamedList items={view.declaredOutputs} />}
			<ValueBlocks blocks={view.recordedOutputs} heightClass={blockHeightClass} />
			<ValueBlocks blocks={view.captured} heightClass={blockHeightClass} />
			{view.outputsNote !== '' && <p className="text-xs italic text-muted">{view.outputsNote}</p>}
		</section>
	);
}
