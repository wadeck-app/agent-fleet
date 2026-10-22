import { CappedBlock } from './CappedBlock.js';
import { IOLinkList } from './IOLinkList.js';
import { NamedList } from './NamedList.js';
import type { IOView } from './StepIODetails.js';

const HEADING_CLASS = 'text-xs font-semibold uppercase tracking-wide text-muted';
const NOTE_CLASS = 'text-xs italic text-muted';
/** Inputs, data-flow links, outputs and the facts the record kept about what the step produced. */
export function StepIOSection({ view, onSelectStep }: { view: IOView; onSelectStep: (stepId: string) => void }) {
	return (
		<>
			<section aria-label="Inputs" className="flex flex-col gap-1">
				<div className={HEADING_CLASS}>Inputs</div>
				{view.inputs.length > 0 && <NamedList items={view.inputs} />}
				<p className={NOTE_CLASS}>{view.inputsNote}</p>
			</section>
			{(view.usesOutputOf.length > 0 || view.usedBy.length > 0) && (
				<section aria-label="Data flow" className="flex flex-col gap-2">
					<IOLinkList title="Uses output of" links={view.usesOutputOf} onSelectStep={onSelectStep} />
					<IOLinkList title="Used by" links={view.usedBy} onSelectStep={onSelectStep} />
				</section>
			)}
			<section aria-label="Outputs" className="flex flex-col gap-2">
				<div className={HEADING_CLASS}>Outputs</div>
				{view.declaredOutputs.length > 0 && <NamedList items={view.declaredOutputs} />}
				{view.captured.map(block => (
					<CappedBlock key={block.title} title={block.title} capped={block.capped} />
				))}
				<p className={NOTE_CLASS}>{view.outputsNote}</p>
			</section>
			{(view.run.length > 0 || view.relaunches.length > 0) && (
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
							<div className={HEADING_CLASS}>Relaunched after a failed sub-step</div>
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
			)}
		</>
	);
}
