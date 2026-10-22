import { ButtonAction, ButtonLink } from '@wadeck-app/dsl-ui';
import type { FlowGraphNode } from 'flow-core';

import { nodeStyle } from './NodeAppearance.js';
import { describeStep } from './StepDetails.js';
import { describeIO } from './StepIODetails.js';
import { StepIOSection } from './StepIOSection.js';

const BADGE_BASE_CLASS = 'inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium';
const ERROR_BLOCK_CLASS =
	'max-h-56 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-md border border-danger bg-danger-bg p-2 font-mono text-xs text-danger-text';
const PANEL_CLASS = 'flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-sm text-content';

interface StepDetailsPanelProps {
	step: FlowGraphNode;
	/** Label of any step of the graph, for the data-flow links. */
	labelOf: (stepId: string) => string;
	onSelectStep: (stepId: string) => void;
	onClose: () => void;
	/** The logs page of the run opened on this step; absent for a definition drawn without a run. */
	logsPath: string | undefined;
}

/** The facts of the selected step. The caller renders it only while a step is selected, so it never takes room from the chart. */
export function StepDetailsPanel({ step, labelOf, onSelectStep, onClose, logsPath }: StepDetailsPanelProps) {
	const { rows, error, outcome } = describeStep(step);
	const io = describeIO(step, labelOf);
	const style = nodeStyle(step);

	return (
		<aside aria-label="Step details" className={PANEL_CLASS}>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<div className="break-words text-base font-semibold">{step.label}</div>
					{step.label !== step.id && <div className="break-all font-mono text-xs text-muted">{step.id}</div>}
				</div>
				<ButtonAction label="Close" variant="secondary" size="sm" onClick={onClose} />
			</div>
			<div className={`${BADGE_BASE_CLASS} ${style.nodeClass}`}>
				<span aria-hidden="true">{style.glyph}</span> {style.label}
			</div>
			{outcome !== undefined && (
				<p className="text-xs">
					{outcome.text} <span className="italic text-muted">({outcome.basis})</span>
				</p>
			)}
			<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
				{rows.map(row => (
					<div key={row.label} className="contents">
						<dt className="text-muted">{row.label}</dt>
						<dd className="break-words">{row.value}</dd>
					</div>
				))}
			</dl>
			{error !== undefined && (
				<div>
					<div className="mb-1 text-xs font-semibold text-danger-text">Error</div>
					<pre className={ERROR_BLOCK_CLASS}>{error}</pre>
				</div>
			)}
			{io !== undefined && <StepIOSection view={io} onSelectStep={onSelectStep} />}
			{logsPath !== undefined && (
				<ButtonLink to={logsPath} label="Logs of this step" variant="secondary" size="sm" />
			)}
		</aside>
	);
}
