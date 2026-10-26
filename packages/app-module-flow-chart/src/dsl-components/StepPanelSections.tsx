import type { ReactNode } from 'react';

import type { FlowGraphNode } from 'flow-core';

import { CopyButton } from './CopyButton.js';
import { InputsSection } from './InputsSection.js';
import { LinksSection } from './LinksSection.js';
import { OutputsSection } from './OutputsSection.js';
import type { DensityClasses } from './PanelDensity.js';
import { RunFactsSection } from './RunFactsSection.js';
import { describeStep } from './StepDetails.js';
import { describeIO } from './StepIODetails.js';

// Written out in full: Tailwind finds classes by scanning source text. The height cap comes from the density.
const ERROR_BLOCK_CLASS =
	'overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-md border border-danger bg-danger-bg p-2 font-mono text-xs text-danger-text';

export type PanelSectionId = 'summary' | 'error' | 'inputs' | 'links' | 'outputs';

/** One block of the panel; the layouts decide how to show the list (stacked, one tab each, collapsible). */
export interface PanelSection {
	id: PanelSectionId;
	title: string;
	/** `showHeading` is false where the tab or the accordion header already names the block. */
	render: (showHeading: boolean) => ReactNode;
	/** The accordion opens it first: the error when there is one, else the summary. */
	openByDefault: boolean;
}

export interface PanelSectionsInput {
	step: FlowGraphNode;
	/** Label of any step of the graph, for the data-flow links. */
	labelOf: (stepId: string) => string;
	onSelectStep: (stepId: string) => void;
	/** The logs page of the run opened on this step; absent for a definition drawn without a run. */
	logsPath: string | undefined;
	density: DensityClasses;
}

function ErrorBlock({ error, heightClass, showHeading }: { error: string; heightClass: string; showHeading: boolean }) {
	return (
		<section aria-label="Error">
			<div className="mb-1 flex flex-wrap items-center justify-between gap-2">
				{showHeading ? <div className="text-xs font-semibold text-danger-text">Error</div> : <span />}
				<CopyButton text={error} what="error" />
			</div>
			<pre className={`${heightClass} ${ERROR_BLOCK_CLASS}`} aria-label="Error text">
				{error}
			</pre>
		</section>
	);
}

/** The blocks of the panel of a step, in reading order; a block without content is left out. */
export function buildPanelSections({
	step,
	labelOf,
	onSelectStep,
	logsPath,
	density,
}: PanelSectionsInput): PanelSection[] {
	const { rows, error, outcome } = describeStep(step);
	const io = describeIO(step, labelOf);
	const sections: PanelSection[] = [
		{
			id: 'summary',
			title: 'Summary',
			openByDefault: error === undefined,
			render: () => (
				<div className="flex flex-col gap-3">
					{outcome !== undefined && (
						<p className="text-xs">
							{outcome.text} <span className="italic text-muted">({outcome.basis})</span>
						</p>
					)}
					<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
						{rows.map(row => (
							<div key={row.label} className="contents">
								<dt className="text-muted">{row.label}</dt>
								<dd className="break-words" title={row.title}>
									{row.value}
								</dd>
							</div>
						))}
					</dl>
					{io !== undefined && <RunFactsSection view={io} />}
				</div>
			),
		},
	];
	if (error !== undefined) {
		sections.push({
			id: 'error',
			title: 'Error',
			openByDefault: true,
			render: showHeading => <ErrorBlock error={error} heightClass={density.block} showHeading={showHeading} />,
		});
	}
	if (io !== undefined) {
		sections.push({
			id: 'inputs',
			title: 'Inputs',
			openByDefault: false,
			render: showHeading => (
				<InputsSection view={io} showHeading={showHeading} blockHeightClass={density.block} />
			),
		});
	}
	const hasLinks = io !== undefined && (io.usesOutputOf.length > 0 || io.usedBy.length > 0);
	if (hasLinks || logsPath !== undefined) {
		sections.push({
			id: 'links',
			title: 'Links',
			openByDefault: false,
			render: () => <LinksSection view={io} onSelectStep={onSelectStep} logsPath={logsPath} />,
		});
	}
	if (io !== undefined) {
		sections.push({
			id: 'outputs',
			title: 'Outputs',
			openByDefault: false,
			render: showHeading => (
				<OutputsSection view={io} showHeading={showHeading} blockHeightClass={density.block} />
			),
		});
	}
	return sections;
}
