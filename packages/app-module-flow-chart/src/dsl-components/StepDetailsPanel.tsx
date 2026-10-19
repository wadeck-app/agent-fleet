import { ButtonAction } from '@wadeck-app/dsl-ui';
import type { FlowGraphNode } from 'flow-core';

import { statusStyle } from './StatusStyle.js';
import { describeStep } from './StepDetails.js';

const BADGE_BASE_CLASS = 'inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium';
const ERROR_BLOCK_CLASS =
	'max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-danger bg-danger-bg p-2 font-mono text-xs text-danger-text';
const PANEL_CLASS = 'flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-sm text-content';

interface StepDetailsPanelProps {
	step: FlowGraphNode | undefined;
	onClose: () => void;
}

/** The facts of the selected step; a hint while nothing is selected so the panel does not look broken. */
export function StepDetailsPanel({ step, onClose }: StepDetailsPanelProps) {
	if (step === undefined) {
		return (
			<aside
				aria-label="Step details"
				className="rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted"
			>
				Click a step to see its status, duration, attempts and error.
			</aside>
		);
	}
	const { rows, error } = describeStep(step);
	const style = statusStyle(step.status);

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
		</aside>
	);
}
