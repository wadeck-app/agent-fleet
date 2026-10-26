import { ChipButton } from '@wadeck-app/dsl-ui';

import { LOG_LEVELS, type LogStreamStep } from './LogStreamProps.js';
import { displayStepName } from './StepNames.js';
import { StepPill } from './StepPill.js';
import type { UrlLogFilter } from './UrlLogFilter.js';

const STRIP_CLASS =
	'sticky top-shell-bar z-10 -mx-1 mb-2 flex flex-col gap-1 border-b border-border bg-bg px-1 pb-1.5 pt-1';
const ROW_CLASS = 'flex flex-wrap gap-1';

function linesText(count: number): string {
	return `${count} ${count === 1 ? 'line' : 'lines'}`;
}

/**
 * Sticky strip above the lines: one chip per step that logged (with its line count over the whole run) and one per
 * level. A click filters the log through the URL; a click on the active chip clears the filter.
 */
export function StepChips({ steps, filter }: { steps: readonly LogStreamStep[]; filter: UrlLogFilter }) {
	const shown = steps.filter(step => step.lineCount > 0 || step.stepId === filter.step);
	return (
		<div className={STRIP_CLASS}>
			<nav aria-label="Steps" className={ROW_CLASS}>
				<ChipButton active={filter.step === null} aria-label="All steps" onClick={() => filter.setStep(null)}>
					All steps
				</ChipButton>
				{shown.map(step => (
					<ChipButton
						key={step.stepId}
						active={filter.step === step.stepId}
						aria-label={`${displayStepName(step.stepId)}, ${linesText(step.lineCount)}`}
						onClick={() => filter.setStep(filter.step === step.stepId ? null : step.stepId)}
					>
						<span className="inline-flex items-center gap-1">
							<StepPill stepId={step.stepId} order={step.order} />
							<span className="text-muted">{step.lineCount}</span>
						</span>
					</ChipButton>
				))}
			</nav>
			<nav aria-label="Levels" className={ROW_CLASS}>
				<ChipButton active={filter.level === null} aria-label="Any level" onClick={() => filter.setLevel(null)}>
					Any level
				</ChipButton>
				{LOG_LEVELS.map(level => (
					<ChipButton
						key={level}
						active={filter.level === level}
						aria-label={level}
						onClick={() => filter.setLevel(filter.level === level ? null : level)}
					>
						{level}
					</ChipButton>
				))}
			</nav>
		</div>
	);
}
