import { formatSpan, spanBar, stepColor, stepHue } from './LogStreamModel.js';
import type { LogStepStatus, LogStreamStep } from './LogStreamProps.js';
import { displayStepName } from './StepNames.js';

// @formatter:off
const STATUS_DOT: Record<LogStepStatus, string> = {
	pending: 'bg-muted-bg border border-border',
	queued: 'bg-muted-bg border border-border',
	're-queued': 'bg-warning-bg border border-border',
	unknown: 'bg-muted-bg border border-border',
	running: 'bg-info-text',
	completed: 'bg-success',
	failed: 'bg-danger',
};
// @formatter:on

const RAIL_CLASS =
	'sticky top-2 max-h-[75vh] w-64 shrink-0 self-start overflow-y-auto rounded-md border border-border bg-surface';

function linesText(count: number): string {
	return `${count} ${count === 1 ? 'line' : 'lines'}`;
}

export interface StepRailProps {
	steps: readonly LogStreamStep[];
	runDurationMs: number;
	activeStep: string | null;
	/** Step ids that have a line (or a section) on the current page: the others can only be filtered. */
	onPage: ReadonlySet<string>;
	onSelect: (stepId: string) => void;
}

/**
 * Sticky index of the whole run, on the left of the lines: every step in tree and execution order with its status,
 * its line count and a bar placing it on the time line of the run (a running step ends at the right edge). A click
 * scrolls to the step on this page, or filters the log to it when the page has no line of it.
 */
export function StepRail({ steps, runDurationMs, activeStep, onPage, onSelect }: StepRailProps) {
	return (
		<nav aria-label="Step index" className={RAIL_CLASS}>
			<ul className="divide-y divide-border">
				{steps.map(step => {
					const bar = spanBar(step, runDurationMs);
					const hue = stepHue(step.order);
					const here = onPage.has(step.stepId);
					return (
						<li key={step.stepId}>
							{/* violations-suppress: react/no-raw-button an index row holds a status dot, a bar and counts; ButtonAction takes a text label only */}
							<button
								type="button"
								aria-label={`${displayStepName(step.stepId)}, ${step.status}, ${linesText(step.lineCount)}`}
								aria-current={activeStep === step.stepId ? 'true' : undefined}
								title={here ? 'Scroll to this step' : 'Not on this page: show only this step'}
								onClick={() => onSelect(step.stepId)}
								className={`block w-full px-2 py-1 text-left text-xs hover:bg-surface-hover ${activeStep === step.stepId ? 'bg-primary-light' : ''} ${here ? '' : 'opacity-60'}`}
							>
								<span
									className="flex items-center gap-1.5"
									style={{ paddingLeft: `${step.depth * 0.75}rem` }}
								>
									<span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[step.status]}`} />
									{step.order === null ? null : (
										<span className="shrink-0 font-mono text-muted">{`#${step.order}`}</span>
									)}
									<span className="min-w-0 flex-1 truncate font-mono">
										{displayStepName(step.stepId)}
									</span>
									<span className="shrink-0 text-muted">{step.lineCount}</span>
								</span>
								{bar === null || hue === null ? null : (
									<span className="mt-1 block h-1.5 rounded bg-muted-bg">
										<span
											className="block h-1.5 rounded"
											style={{
												marginLeft: `${bar.left}%`,
												width: `${bar.width}%`,
												backgroundColor: stepColor(hue),
											}}
										/>
									</span>
								)}
								{step.durationMs === null ? null : (
									<span className="block text-[10px] text-muted">{formatSpan(step.durationMs)}</span>
								)}
							</button>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
