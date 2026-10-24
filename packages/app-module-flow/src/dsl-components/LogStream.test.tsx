import { MemoryRouter, useLocation } from 'react-router-dom';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { AbExperiments } from '@wadeck-app/dsl-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LogStream } from './LogStream.js';
import type { LogStreamEntry, LogStreamProps, LogStreamStep } from './LogStreamProps.js';

function entry(overrides: Partial<LogStreamEntry>): LogStreamEntry {
	return {
		timestamp: '2026-10-24T10:00:08.000Z',
		level: 'info',
		stepId: 'plan',
		preview: 'a line',
		expandable: false,
		markdown: '',
		subjectStepId: null,
		stepOrder: 1,
		stepDepth: 0,
		attempt: 1,
		attempts: 2,
		offsetMs: 8_000,
		deltaMs: null,
		...overrides,
	};
}

const RUN_EVENT = { stepId: '__execution', stepOrder: null, attempt: 0, attempts: 0 };

// A run event about the step plan: it carries the order and the attempts of plan.
const EVENT_ABOUT_PLAN = { ...RUN_EVENT, subjectStepId: 'plan', stepOrder: 1, attempts: 2 };

const ENTRIES: LogStreamEntry[] = [
	entry({ ...RUN_EVENT, preview: 'Execution started for flow x', offsetMs: 0 }),
	entry({ ...EVENT_ABOUT_PLAN, attempt: 1, preview: 'Step plan started executing', offsetMs: 7_000 }),
	entry({ preview: 'Launching sonnet', offsetMs: 8_000, deltaMs: 1_000 }),
	entry({
		preview: 'rendered prompt',
		offsetMs: 8_500,
		deltaMs: 500,
		expandable: true,
		markdown: 'PROMPT-BODY',
	}),
	entry({ preview: 'boom', level: 'error', offsetMs: 9_000, deltaMs: 500 }),
	entry({
		...EVENT_ABOUT_PLAN,
		attempt: 2,
		preview: 'Step plan started executing again',
		offsetMs: 10_000,
		deltaMs: 1_000,
	}),
	entry({ preview: 'Launching again', attempt: 2, offsetMs: 11_000, deltaMs: 1_000 }),
	entry({
		stepId: 'child',
		subjectStepId: null,
		stepOrder: 2,
		stepDepth: 1,
		attempt: 1,
		attempts: 1,
		level: 'warning',
		preview: 'child warns',
		offsetMs: 12_000,
		deltaMs: 1_000,
	}),
];

function step(overrides: Partial<LogStreamStep>): LogStreamStep {
	return {
		stepId: 'plan',
		order: 1,
		depth: 0,
		parentId: null,
		status: 'failed',
		attempts: 2,
		lineCount: 5,
		startOffsetMs: 7_000,
		endOffsetMs: 20_000,
		durationMs: 13_000,
		...overrides,
	};
}

const STEPS: LogStreamStep[] = [
	step({}),
	step({
		stepId: 'child',
		order: 2,
		depth: 1,
		parentId: 'plan',
		status: 'running',
		attempts: 1,
		lineCount: 1,
		startOffsetMs: 12_000,
		endOffsetMs: 60_000,
		durationMs: 48_000,
	}),
	step({
		stepId: 'later',
		order: null,
		status: 'pending',
		attempts: 0,
		lineCount: 0,
		startOffsetMs: null,
		endOffsetMs: null,
		durationMs: null,
	}),
];

function Location() {
	const location = useLocation();
	return <output data-testid="location">{location.pathname + location.search}</output>;
}

function show(props: Partial<LogStreamProps> = {}, choices: Record<string, string> = {}, url = '/logs') {
	for (const [dimension, option] of Object.entries(choices)) {
		localStorage.setItem(`ab.flow-logs-${dimension}`, option);
	}
	return render(
		<AbExperiments enabled>
			<MemoryRouter initialEntries={[url]}>
				<LogStream
					entries={ENTRIES}
					steps={STEPS}
					runDurationMs={60_000}
					emptyMessage="Nothing logged"
					unexpectedKeys={[]}
					{...props}
				/>
				<Location />
			</MemoryRouter>
		</AbExperiments>
	);
}

const scrollIntoView = vi.fn();

beforeEach(() => {
	localStorage.clear();
	scrollIntoView.mockReset();
	Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => localStorage.clear());

// The defaults other than the dimension under test, so a test reads one dimension at a time.
const BASE = { identity: 'plain', grouping: 'flat', navigation: 'none', time: 'offset', density: 'comfortable' };

describe('LogStream lines', () => {
	it('lists the lines in the order of the page with their level and message', () => {
		show({}, BASE);
		const lines = within(screen.getByRole('list', { name: 'Log lines' })).getAllByRole('listitem');
		expect(lines).toHaveLength(ENTRIES.length);
		expect(lines[2]!.textContent).toMatch(/info.*plan.*Launching sonnet/);
		expect(lines[4]!.textContent).toMatch(/error.*boom/);
	});

	it('opens the markdown panel of a line on request and closes it again', () => {
		show({}, BASE);
		expect(screen.queryByText('PROMPT-BODY')).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Show the whole message' }));
		expect(screen.getByText('PROMPT-BODY')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'Hide the whole message' }));
		expect(screen.queryByText('PROMPT-BODY')).toBeNull();
	});

	it('shows the empty message when there is no line', () => {
		show({ entries: [] }, BASE);
		expect(screen.getByText('Nothing logged')).toBeInTheDocument();
	});
});

describe('LogStream step identity', () => {
	it('plain: the step id as text', () => {
		show({}, BASE);
		expect(screen.queryByText('#1 plan')).toBeNull();
		expect(screen.getAllByText('plan').length).toBeGreaterThan(0);
	});

	it('badge: a coloured badge with the execution order and the name', () => {
		show({}, { ...BASE, identity: 'badge' });
		const badge = screen.getAllByText('#1 plan')[0]!;
		expect(badge.getAttribute('style')).toMatch(/rgba?\(/);
		expect(screen.getAllByText('#2 child').length).toBeGreaterThan(0);
		expect(screen.queryByText(/try \d\/\d/)).toBeNull();
	});

	it('tree: indents a sub-step under its parent and shows the attempt when the step ran several times', () => {
		show({}, { ...BASE, identity: 'tree' });
		const child = screen.getByText('#2 child').closest('[data-depth]')!;
		expect(child.getAttribute('data-depth')).toBe('1');
		expect(screen.getAllByText('#1 plan')[0]!.closest('[data-depth]')!.getAttribute('data-depth')).toBe('0');
		expect(screen.getAllByText('try 1/2').length).toBeGreaterThan(0);
		// The second start event of plan and the line after it.
		expect(screen.getAllByText('try 2/2')).toHaveLength(2);
		expect(screen.queryByText('try 1/1')).toBeNull();
	});

	it('stripe: a coloured stripe on the line of a step and a small order and name', () => {
		show({}, { ...BASE, identity: 'stripe' });
		const line = screen.getByText('Launching sonnet').closest('li')!;
		expect(line.getAttribute('style')).toMatch(/border-left-color: rgb/);
		expect(within(line).getByText('#1 plan')).toBeInTheDocument();
	});

	it('shows a run event about a step as a hollow badge of that step, and the other run events as Run events', () => {
		show({}, { ...BASE, identity: 'badge' });
		const event = screen.getByText('Step plan started executing').closest('li')!;
		const pill = within(event).getByText('#1 plan');
		expect(pill.getAttribute('data-event')).toBe('true');
		expect(pill.getAttribute('title')).toBe('Run event about #1 plan');
		expect(
			within(screen.getByText('Execution started for flow x').closest('li')!).getByText('Run events')
		).toBeInTheDocument();
		expect(screen.getByText('Launching sonnet').closest('li')!.querySelector('[data-event]')).toBeNull();
	});

	it('puts the run events about a step in the section of that step, the others under Run events', () => {
		show({}, { ...BASE, grouping: 'step' });
		const plan = screen.getByRole('region', { name: 'Step plan' });
		expect(within(plan).getByText('Step plan started executing')).toBeInTheDocument();
		const run = screen.getByRole('region', { name: 'Step Run events' });
		expect(within(run).getByText('Execution started for flow x')).toBeInTheDocument();
		expect(within(run).queryByText('Step plan started executing')).toBeNull();
	});

	it('puts the start event of a retry in the section of that attempt', () => {
		show({}, { ...BASE, grouping: 'attempt' });
		const second = screen.getByRole('region', { name: 'Step plan attempt 2' });
		expect(within(second).getByText('Step plan started executing again')).toBeInTheDocument();
		expect(within(second).getByText('Launching again')).toBeInTheDocument();
	});

	it('names the run events "Run events" instead of showing the internal id', () => {
		show({}, { ...BASE, identity: 'badge' });
		expect(screen.queryByText('__execution')).toBeNull();
		expect(screen.getAllByText('Run events').length).toBeGreaterThan(0);
	});
});

describe('LogStream time', () => {
	it('offset: time since the start of the run', () => {
		show({}, { ...BASE, time: 'offset' });
		expect(screen.getByText('+8.0s')).toBeInTheDocument();
		expect(screen.getByText('+12.0s')).toBeInTheDocument();
	});

	it('delta: time since the previous line, a dash for the first one', () => {
		show({}, { ...BASE, time: 'delta' });
		const first = within(screen.getByRole('list', { name: 'Log lines' })).getAllByRole('listitem')[0]!;
		expect(within(first).getByText('-')).toBeInTheDocument();
		expect(screen.getAllByText('+1.0s').length).toBeGreaterThan(0);
		expect(screen.getAllByText('+500ms').length).toBeGreaterThan(0);
	});

	it('absolute: the clock time of the line, the full date in the tooltip', () => {
		show({}, { ...BASE, time: 'absolute' });
		const time = document.querySelector('time')!;
		expect(time.getAttribute('datetime')).toBe('2026-10-24T10:00:08.000Z');
		expect(time.getAttribute('title')).toMatch(/2026/);
	});

	it('says in a caption what the time column is', () => {
		show({}, { ...BASE, time: 'offset' });
		expect(screen.getByText(/since the run started/i)).toBeInTheDocument();
	});
});

describe('LogStream grouping', () => {
	it('step: one section per step, run events first, with the line count', () => {
		show({}, { ...BASE, grouping: 'step' });
		const sections = screen.getAllByRole('region');
		expect(sections.map(section => section.getAttribute('aria-label'))).toEqual([
			'Step Run events',
			'Step plan',
			'Step child',
		]);
		expect(within(sections[1]!).getByText('6 lines')).toBeInTheDocument();
		expect(within(sections[1]!).getByText('1 error')).toBeInTheDocument();
	});

	it('attempt: one section per attempt of a step', () => {
		show({}, { ...BASE, grouping: 'attempt' });
		expect(screen.getAllByRole('region').map(section => section.getAttribute('aria-label'))).toEqual([
			'Step Run events',
			'Step plan attempt 1',
			'Step plan attempt 2',
			'Step child attempt 1',
		]);
	});

	it('collapses and expands a section from its header', () => {
		show({}, { ...BASE, grouping: 'step' });
		const section = screen.getByRole('region', { name: 'Step plan' });
		const header = within(section).getByRole('button', { name: /plan/ });
		expect(header.getAttribute('aria-expanded')).toBe('true');
		expect(within(section).getByText('Launching sonnet')).toBeInTheDocument();
		fireEvent.click(header);
		expect(header.getAttribute('aria-expanded')).toBe('false');
		expect(within(section).queryByText('Launching sonnet')).toBeNull();
		fireEvent.click(header);
		expect(within(section).getByText('Launching sonnet')).toBeInTheDocument();
	});

	it('collapses and expands every section at once', () => {
		show({}, { ...BASE, grouping: 'step' });
		fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
		expect(screen.queryByText('Launching sonnet')).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
		expect(screen.getByText('Launching sonnet')).toBeInTheDocument();
	});

	it('flat: no section and no collapse buttons', () => {
		show({}, BASE);
		expect(screen.queryByRole('region')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Collapse all' })).toBeNull();
	});

	it('does not repeat the step on each line of a section', () => {
		show({}, { ...BASE, grouping: 'step', identity: 'badge' });
		const section = screen.getByRole('region', { name: 'Step child' });
		expect(within(section).getAllByText('#2 child')).toHaveLength(1);
	});
});

describe('LogStream density', () => {
	it('compact: short level codes', () => {
		show({}, { ...BASE, density: 'compact' });
		expect(screen.getByText('ERR')).toBeInTheDocument();
		expect(screen.getByText('WRN')).toBeInTheDocument();
	});

	it('folded: folds a run of quiet lines of one step and unfolds it on request', () => {
		const quiet = Array.from({ length: 4 }, (_, i) => entry({ preview: `quiet ${i}`, offsetMs: 8_000 + i }));
		show({ entries: [...quiet, entry({ preview: 'loud', level: 'error' })] }, { ...BASE, density: 'folded' });
		expect(screen.queryByText('quiet 0')).toBeNull();
		expect(screen.getByText('loud')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: /4 quiet lines of plan/ }));
		expect(screen.getByText('quiet 0')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: /Fold 4 quiet lines of plan/ }));
		expect(screen.queryByText('quiet 0')).toBeNull();
	});

	it('comfortable: level badges and nothing folded', () => {
		const quiet = Array.from({ length: 4 }, (_, i) => entry({ preview: `quiet ${i}` }));
		show({ entries: quiet }, BASE);
		expect(screen.getByText('quiet 0')).toBeInTheDocument();
		expect(screen.queryByText('ERR')).toBeNull();
	});
});

describe('LogStream error and warning rows', () => {
	it('mark the row with the level', () => {
		show({}, BASE);
		expect(screen.getByText('boom').closest('li')!.getAttribute('data-level')).toBe('error');
		expect(screen.getByText('child warns').closest('li')!.getAttribute('data-level')).toBe('warning');
	});
});

describe('LogStream navigation', () => {
	it('none: no index', () => {
		show({}, BASE);
		expect(screen.queryByRole('navigation')).toBeNull();
	});

	it('chips: one chip per step with its line count, the steps that logged nothing left out', () => {
		show({}, { ...BASE, navigation: 'chips' });
		const nav = screen.getByRole('navigation', { name: 'Steps' });
		expect(within(nav).getByRole('button', { name: 'plan, 5 lines' })).toBeInTheDocument();
		expect(within(nav).getByRole('button', { name: 'child, 1 line' })).toBeInTheDocument();
		expect(within(nav).queryByRole('button', { name: /later/ })).toBeNull();
	});

	it('chips: a click filters the log to the step through the URL, back to page 1, and a second click clears it', () => {
		show({}, { ...BASE, navigation: 'chips' }, '/logs?page=2&q=x');
		fireEvent.click(screen.getByRole('button', { name: 'plan, 5 lines' }));
		expect(screen.getByTestId('location').textContent).toBe('/logs?q=x&step=plan');
		expect(screen.getByRole('button', { name: 'plan, 5 lines' }).getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(screen.getByRole('button', { name: 'plan, 5 lines' }));
		expect(screen.getByTestId('location').textContent).toBe('/logs?q=x');
	});

	it('chips: level chips filter by level and clear', () => {
		show({}, { ...BASE, navigation: 'chips' });
		const levels = screen.getByRole('navigation', { name: 'Levels' });
		fireEvent.click(within(levels).getByRole('button', { name: 'error' }));
		expect(screen.getByTestId('location').textContent).toBe('/logs?level=error');
		fireEvent.click(within(levels).getByRole('button', { name: 'Any level' }));
		expect(screen.getByTestId('location').textContent).toBe('/logs');
	});

	it('rail: lists every step in tree order with order, status and line count', () => {
		show({}, { ...BASE, navigation: 'rail' });
		const nav = screen.getByRole('navigation', { name: 'Step index' });
		const items = within(nav).getAllByRole('button');
		expect(items.map(item => item.getAttribute('aria-label'))).toEqual([
			'plan, failed, 5 lines',
			'child, running, 1 line',
			'later, pending, 0 lines',
		]);
		expect(within(nav).getByText('#1')).toBeInTheDocument();
	});

	it('rail: a click on a step of the page scrolls to it', () => {
		show({}, { ...BASE, navigation: 'rail' });
		fireEvent.click(screen.getByRole('button', { name: 'child, running, 1 line' }));
		expect(scrollIntoView).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('location').textContent).toBe('/logs');
	});

	it('rail: a click on a step absent from the page filters the log to it', () => {
		show({}, { ...BASE, navigation: 'rail' });
		fireEvent.click(screen.getByRole('button', { name: 'later, pending, 0 lines' }));
		expect(scrollIntoView).not.toHaveBeenCalled();
		expect(screen.getByTestId('location').textContent).toBe('/logs?step=later');
	});

	it('rail: a click expands the collapsed section of the step before scrolling', () => {
		show({}, { ...BASE, navigation: 'rail', grouping: 'step' });
		fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
		fireEvent.click(screen.getByRole('button', { name: 'child, running, 1 line' }));
		expect(screen.getByText('child warns')).toBeInTheDocument();
		expect(scrollIntoView).toHaveBeenCalledTimes(1);
	});
});

describe('LogStream refusals', () => {
	it('says which keys are not accepted', () => {
		show({ unexpectedKeys: ['className'] });
		expect(screen.getByRole('alert').textContent).toMatch(
			/does not accept className.*entries, steps, runDurationMs, emptyMessage/
		);
	});

	it.each([
		[{ entries: 'x' }, /entries must be a list/],
		[{ steps: 3 }, /steps must be a list/],
		[{ runDurationMs: 'long' }, /runDurationMs must be a number/],
		[{ emptyMessage: 4 }, /emptyMessage must be a text/],
		[{ entries: [{ ...ENTRIES[0], level: 'loud' }] }, /entry 0 has the level "loud"/],
	])('refuses %j', (props, message) => {
		show(props as Partial<LogStreamProps>);
		expect(screen.getByRole('alert').textContent).toMatch(message);
	});
});

describe('LogStream choices', () => {
	it('uses the defaults while experiments are off, whatever is stored', () => {
		localStorage.setItem('ab.flow-logs-identity', 'stripe');
		render(
			<MemoryRouter>
				<LogStream
					entries={ENTRIES}
					steps={STEPS}
					runDurationMs={60_000}
					emptyMessage="x"
					unexpectedKeys={[]}
				/>
			</MemoryRouter>
		);
		expect(screen.getAllByText('#1 plan').length).toBeGreaterThan(0);
		expect(screen.getByText('Launching sonnet').closest('li')!.getAttribute('style') ?? '').not.toMatch(
			/border-left/
		);
	});
});
