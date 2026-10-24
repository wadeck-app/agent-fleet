import { Fragment, useMemo, useRef, useState } from 'react';

import { ButtonAction } from '@wadeck-app/dsl-ui';

import { LogGroupSection } from './LogGroupSection.js';
import { LogLine } from './LogLine.js';
import { type LogStreamChoices, type TimeMode, useLogStreamChoices } from './LogStreamChoices.js';
import { type LogGroup, type StreamItem, foldQuietRuns, groupEntries, ownerOf } from './LogStreamModel.js';
import type { LogStreamEntry, LogStreamStep } from './LogStreamProps.js';
import { StepChips } from './StepChips.js';
import { displayStepName } from './StepNames.js';
import { StepRail } from './StepRail.js';
import { useUrlLogFilter } from './UrlLogFilter.js';

const FOLD_CLASS = 'ml-6 rounded border border-dashed border-border px-2 py-0.5 text-muted hover:text-content';

const TIME_CAPTION: Record<TimeMode, string> = {
	absolute: 'Time column: clock time of each line.',
	offset: 'Time column: time since the run started.',
	delta: 'Time column: time since the previous line of this page.',
};

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
	const next = new Set(set);
	if (!next.delete(value)) {
		next.add(value);
	}
	return next;
}

function setOf<T>(values: Iterable<T>, without?: (value: T) => boolean): Set<T> {
	return new Set([...values].filter(value => without === undefined || !without(value)));
}

export interface LogStreamViewProps {
	entries: LogStreamEntry[];
	steps: LogStreamStep[];
	runDurationMs: number;
	emptyMessage: string;
}

export function LogStreamView({ entries, steps, runDurationMs, emptyMessage }: LogStreamViewProps) {
	const choices: LogStreamChoices = useLogStreamChoices();
	const filter = useUrlLogFilter();
	const root = useRef<HTMLDivElement>(null);
	// Keyed by the place of the line in the page: the entries are parsed anew whenever the page is drawn again.
	const [openPanels, setOpenPanels] = useState<ReadonlySet<number>>(new Set());
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());

	const indexOf = new Map(entries.map((entry, index) => [entry, index]));
	const groups = useMemo(() => groupEntries(entries, choices.grouping), [entries, choices.grouping]);
	const stepById = useMemo(() => new Map(steps.map(step => [step.stepId, step])), [steps]);
	const grouped = choices.grouping !== 'flat';
	// The first section (grouped) or line (flat) of each step is where the index scrolls to.
	const anchorKeys = useMemo(() => {
		const seen = new Set<string>();
		const keys = new Set<string>();
		for (const group of groups) {
			if (group.stepId !== null && !seen.has(group.stepId)) {
				seen.add(group.stepId);
				keys.add(group.key);
			}
		}
		return keys;
	}, [groups]);
	const firstLineOfStep = useMemo(() => {
		const seen = new Set<string>();
		const first = new Set<number>();
		entries.forEach((entry, index) => {
			if (!seen.has(ownerOf(entry))) {
				seen.add(ownerOf(entry));
				first.add(index);
			}
		});
		return first;
	}, [entries]);
	const onPage = useMemo(() => new Set(entries.map(ownerOf)), [entries]);

	const selectStep = (stepId: string): void => {
		const target = [...(root.current?.querySelectorAll('[data-log-step]') ?? [])].find(
			element => element.getAttribute('data-log-step') === stepId
		);
		if (target === undefined) {
			filter.setStep(stepId);
			return;
		}
		setCollapsed(current =>
			setOf(current, key => groups.some(group => group.key === key && group.stepId === stepId))
		);
		target.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	const renderLine = (entry: LogStreamEntry, showStep: boolean) => {
		const index = indexOf.get(entry)!;
		return (
			<LogLine
				key={`line:${index}`}
				entry={entry}
				identity={choices.identity}
				time={choices.time}
				density={choices.density}
				showStep={showStep}
				open={openPanels.has(index)}
				onToggle={() => setOpenPanels(current => toggled(current, index))}
				anchor={!grouped && firstLineOfStep.has(index)}
			/>
		);
	};

	const renderItems = (group: LogGroup, items: StreamItem[], showStep: boolean) =>
		items.map(item => {
			if (item.kind === 'line') {
				return renderLine(item.entry, showStep);
			}
			const key = `${group.key}:${item.index}`;
			const stepName = displayStepName(ownerOf(item.entries[0]!));
			const label = `${item.entries.length} quiet lines of ${stepName}`;
			const isOpen = unfolded.has(key);
			return (
				<Fragment key={key}>
					<li className="px-2 py-0.5 text-xs">
						{/* violations-suppress: react/no-raw-button a disclosure that sits inline in the list needs aria-expanded and a text look; ButtonAction has neither */}
						<button
							type="button"
							aria-expanded={isOpen}
							aria-label={`${isOpen ? 'Fold' : 'Show'} ${label}`}
							onClick={() => setUnfolded(current => toggled(current, key))}
							className={FOLD_CLASS}
						>
							{isOpen ? `fold ${label}` : `${label} (click to show)`}
						</button>
					</li>
					{isOpen ? item.entries.map(entry => renderLine(entry, showStep)) : null}
				</Fragment>
			);
		});

	const itemsOf = (group: LogGroup): StreamItem[] =>
		choices.density === 'folded'
			? foldQuietRuns(group.entries)
			: group.entries.map(entry => ({ kind: 'line', index: indexOf.get(entry)!, entry }));

	const list = (group: LogGroup, showStep: boolean) => (
		<ol aria-label="Log lines" className="divide-y divide-border">
			{renderItems(group, itemsOf(group), showStep)}
		</ol>
	);

	const body =
		groups.length === 0 ? (
			<p className="px-3 py-2 text-sm text-muted">{emptyMessage}</p>
		) : grouped ? (
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between gap-2 text-xs text-muted">
					<span>
						Sections follow the execution order of the steps; the lines of this page stay chronological
						inside.
					</span>
					<span className="flex gap-1">
						<ButtonAction
							label="Collapse all"
							variant="secondary"
							size="sm"
							onClick={() => setCollapsed(new Set(groups.map(group => group.key)))}
						/>
						<ButtonAction
							label="Expand all"
							variant="secondary"
							size="sm"
							onClick={() => setCollapsed(new Set())}
						/>
					</span>
				</div>
				{groups.map(group => (
					<LogGroupSection
						key={group.key}
						group={group}
						step={group.stepId === null ? undefined : stepById.get(group.stepId)}
						identity={choices.identity}
						byAttempt={choices.grouping === 'attempt'}
						runDurationMs={runDurationMs}
						open={!collapsed.has(group.key)}
						onToggle={() => setCollapsed(current => toggled(current, group.key))}
						anchor={anchorKeys.has(group.key)}
					>
						{list(group, false)}
					</LogGroupSection>
				))}
			</div>
		) : (
			<div className="overflow-hidden rounded-md border border-border">{list(groups[0]!, true)}</div>
		);

	return (
		<div ref={root} className="min-w-0">
			{choices.navigation === 'chips' ? <StepChips steps={steps} filter={filter} /> : null}
			<div className="flex items-start gap-3">
				{choices.navigation === 'rail' ? (
					<StepRail
						steps={steps}
						runDurationMs={runDurationMs}
						activeStep={filter.step}
						onPage={onPage}
						onSelect={selectStep}
					/>
				) : null}
				<div className="min-w-0 flex-1">
					<p className="mb-1 text-xs text-muted">{TIME_CAPTION[choices.time]}</p>
					{body}
				</div>
			</div>
		</div>
	);
}
