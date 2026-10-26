import type { ReactNode } from 'react';

import { Badge } from '@wadeck-app/dsl-ui';

import type { Identity } from './LogStreamChoices.js';
import { type LogGroup, formatSpan, spanBar, stepColor, stepHue } from './LogStreamModel.js';
import { type LogStepStatus, type LogStreamStep } from './LogStreamProps.js';
import { SCROLL_TARGET_CLASS } from './ScrollTargetClass.js';
import { StepLabel } from './StepLabel.js';
import { displayStepName } from './StepNames.js';

const STATUS_BADGE: Record<LogStepStatus, 'default' | 'info' | 'success' | 'danger' | 'warning'> = {
	pending: 'default',
	queued: 'default',
	're-queued': 'warning',
	unknown: 'default',
	running: 'info',
	completed: 'success',
	failed: 'danger',
};

const HEADER_CLASS =
	'flex w-full flex-wrap items-center gap-2 bg-bg-secondary px-2 py-1.5 text-left text-sm hover:bg-surface-hover';

function plural(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export interface LogGroupSectionProps {
	group: LogGroup;
	/** The index row of the step; undefined for a step the record does not know. */
	step: LogStreamStep | undefined;
	identity: Identity;
	byAttempt: boolean;
	runDurationMs: number;
	open: boolean;
	onToggle: () => void;
	/** Marks the section as the place to scroll to for its step. */
	anchor: boolean;
	children: ReactNode;
}

function sectionName(group: LogGroup, byAttempt: boolean): string {
	const name = `Step ${displayStepName(group.stepId ?? '')}`;
	return byAttempt && group.attempt !== null && group.attempt > 0 ? `${name} attempt ${group.attempt}` : name;
}

// Span of the lines of the section, the only duration an attempt has (the record keeps the whole step).
function attemptSpan(group: LogGroup): number {
	const offsets = group.entries.map(entry => entry.offsetMs);
	return Math.max(...offsets) - Math.min(...offsets);
}

/** A collapsible section of the log: the header names the step (and the attempt), counts its lines and problems. */
export function LogGroupSection({
	group,
	step,
	identity,
	byAttempt,
	runDurationMs,
	open,
	onToggle,
	anchor,
	children,
}: LogGroupSectionProps) {
	const bar = !byAttempt && step !== undefined ? spanBar(step, runDurationMs) : null;
	const hue = stepHue(group.order);
	const isFinalAttempt = group.attempt === null || group.attempt === group.attempts;
	return (
		<section
			aria-label={sectionName(group, byAttempt)}
			data-log-step={anchor ? group.stepId : undefined}
			className={`${anchor ? SCROLL_TARGET_CLASS : ''} overflow-hidden rounded-md border border-border`}
		>
			{/* violations-suppress: react/no-raw-button a section header holds badges and counts and needs aria-expanded; ButtonAction takes a text label only */}
			<button type="button" aria-expanded={open} onClick={onToggle} className={HEADER_CLASS}>
				<span className={`w-3 shrink-0 text-muted ${open ? 'rotate-90' : ''}`}>{'>'}</span>
				<span className="min-w-0 basis-56">
					<StepLabel
						identity={identity}
						stepId={group.stepId ?? ''}
						order={group.order}
						depth={group.depth}
						attempt={byAttempt ? 0 : (group.attempt ?? 0)}
						attempts={byAttempt ? 0 : group.attempts}
					/>
				</span>
				{byAttempt && group.attempt !== null && group.attempt > 0 ? (
					<Badge
						label={`attempt ${group.attempt}${group.attempts > 1 ? `/${group.attempts}` : ''}`}
						variant={group.attempts > 1 ? 'warning' : 'default'}
						tone="subtle"
						size="sm"
					/>
				) : null}
				{step !== undefined && isFinalAttempt ? (
					<Badge label={step.status} variant={STATUS_BADGE[step.status]} tone="subtle" size="sm" />
				) : null}
				<span className="text-xs text-muted">{plural(group.entries.length, 'line')}</span>
				{group.errors > 0 ? (
					<Badge label={plural(group.errors, 'error')} variant="danger" tone="subtle" size="sm" />
				) : null}
				{group.warnings > 0 ? (
					<Badge label={plural(group.warnings, 'warning')} variant="warning" tone="subtle" size="sm" />
				) : null}
				<span className="ml-auto text-xs text-muted">
					{byAttempt
						? `span ${formatSpan(attemptSpan(group))}`
						: step?.durationMs === null || step === undefined
							? ''
							: formatSpan(step.durationMs)}
				</span>
				{bar === null || hue === null ? null : (
					<span className="block h-1.5 w-32 rounded bg-muted-bg">
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
			</button>
			{open ? children : null}
		</section>
	);
}
