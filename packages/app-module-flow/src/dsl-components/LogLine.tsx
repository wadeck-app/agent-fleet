import { Badge } from '@wadeck-app/dsl-ui';

import type { Density, Identity, TimeMode } from './LogStreamChoices.js';
import { formatSigned, ownerOf, stepColor, stepHue } from './LogStreamModel.js';
import { type LogLevel, type LogStreamEntry, RUN_EVENTS_STEP } from './LogStreamProps.js';
import { MarkdownText } from './MarkdownText.js';
import { StepLabel } from './StepLabel.js';

const CLOCK_FORMAT = new Intl.DateTimeFormat(undefined, {
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	fractionalSecondDigits: 3,
});
const TITLE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'medium' });

const LEVEL_BADGE: Record<LogLevel, 'default' | 'info' | 'warning' | 'danger'> = {
	debug: 'default',
	info: 'info',
	warning: 'warning',
	error: 'danger',
};
// @formatter:off
const LEVEL_CODE: Record<LogLevel, { text: string; className: string }> = {
	debug: { text: 'DBG', className: 'text-muted' },
	info: { text: 'INF', className: 'text-info-text' },
	warning: { text: 'WRN', className: 'text-warning-text' },
	error: { text: 'ERR', className: 'text-danger-text' },
};
// @formatter:on
const ROW_TINT: Partial<Record<LogLevel, string>> = { error: 'bg-danger-bg', warning: 'bg-warning-bg' };

/** Time cell text for the chosen mode; the first line of a page has no previous line. */
function timeText(entry: LogStreamEntry, mode: TimeMode): string {
	switch (mode) {
		case 'absolute':
			return CLOCK_FORMAT.format(new Date(entry.timestamp));
		case 'offset':
			return formatSigned(entry.offsetMs);
		case 'delta':
			return entry.deltaMs === null ? '-' : formatSigned(entry.deltaMs);
		default:
			throw new Error(`Unknown time mode "${String(mode)}": expected absolute, offset or delta.`);
	}
}

export interface LogLineProps {
	entry: LogStreamEntry;
	identity: Identity;
	time: TimeMode;
	density: Density;
	/** False inside a section whose header already names the step. */
	showStep: boolean;
	open: boolean;
	onToggle: () => void;
	/** Marks the line as the place to scroll to for its step (flat list only). */
	anchor: boolean;
}

/** One log line: time, level, step (unless the section names it) and message, with an optional markdown panel. */
export function LogLine({ entry, identity, time, density, showStep, open, onToggle, anchor }: LogLineProps) {
	const compact = density !== 'comfortable';
	const hue = stepHue(entry.stepOrder);
	const isRunEvent = entry.stepId === RUN_EVENTS_STEP;
	const isStepEvent = isRunEvent && entry.subjectStepId !== null;
	const stripe = identity === 'stripe' && hue !== null;
	const level = LEVEL_CODE[entry.level];
	return (
		<li
			data-level={entry.level}
			data-log-step={anchor ? ownerOf(entry) : undefined}
			className={`${ROW_TINT[entry.level] ?? ''} ${compact ? 'py-0.5 text-xs' : 'py-1.5 text-sm'} px-2`}
			style={
				stripe
					? {
							borderLeftStyle: 'solid',
							borderLeftWidth: '3px',
							borderLeftColor: stepColor(hue, isStepEvent ? 0.4 : 1),
						}
					: undefined
			}
		>
			<div className="flex items-start gap-2">
				{entry.expandable ? (
					// violations-suppress: react/no-raw-button a one-character disclosure toggle needs aria-expanded; ButtonAction takes a text label only
					<button
						type="button"
						aria-expanded={open}
						aria-label={open ? 'Hide the whole message' : 'Show the whole message'}
						onClick={onToggle}
						className={`w-4 shrink-0 text-muted hover:text-content ${open ? 'rotate-90' : ''}`}
					>
						{'>'}
					</button>
				) : (
					<span className="w-4 shrink-0" />
				)}
				<time
					dateTime={entry.timestamp}
					title={TITLE_FORMAT.format(new Date(entry.timestamp))}
					className={`${time === 'absolute' ? 'w-28' : 'w-20'} shrink-0 whitespace-nowrap text-right font-mono tabular-nums text-muted`}
				>
					{timeText(entry, time)}
				</time>
				<span className={compact ? 'w-8 shrink-0' : 'w-16 shrink-0'}>
					{compact ? (
						<span className={`font-mono font-semibold ${level.className}`} title={entry.level}>
							{level.text}
						</span>
					) : (
						<Badge label={entry.level} variant={LEVEL_BADGE[entry.level]} tone="subtle" size="sm" />
					)}
				</span>
				{showStep ? (
					<span className="min-w-0 shrink-0 basis-56 overflow-hidden">
						<StepLabel
							identity={identity}
							stepId={ownerOf(entry)}
							event={isStepEvent}
							order={entry.stepOrder}
							depth={entry.stepDepth}
							attempt={entry.attempt}
							attempts={entry.attempts}
						/>
					</span>
				) : null}
				<span
					className={`min-w-0 flex-1 font-mono ${compact ? 'truncate' : 'break-words'} ${isRunEvent ? 'italic text-muted' : ''}`}
					title={entry.preview}
				>
					{entry.preview}
				</span>
			</div>
			{open ? (
				<div className="ml-6 mt-1">
					<MarkdownText text={entry.markdown} maxHeight="30rem" unexpectedKeys={[]} />
				</div>
			) : null}
		</li>
	);
}
