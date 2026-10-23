import { CappedBlock } from './CappedBlock.js';
import { NamedList } from './NamedList.js';
import { SectionHeading } from './SectionHeading.js';
import type { IOView } from './StepIODetails.js';

/** Declared outputs, the captured stdout / stderr of a failed step and the note on what the record kept. */
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
			{view.captured.map(block => (
				<CappedBlock
					key={block.title}
					title={block.title}
					capped={block.capped}
					heightClass={blockHeightClass}
				/>
			))}
			<p className="text-xs italic text-muted">{view.outputsNote}</p>
		</section>
	);
}
