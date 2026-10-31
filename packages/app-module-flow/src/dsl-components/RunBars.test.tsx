import { MemoryRouter } from 'react-router-dom';

import { act, cleanup, render, screen, within } from '@testing-library/react';
import { DEFAULT_DATE_SETTINGS, DateFormatProvider, createDateFormatter } from '@wadeck-app/dsl-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RunBars } from './RunBars.js';

const TO = '/modules/flow/executions';

// Sunday 2026-10-25 at noon UTC. The bars show the seven days Monday 19 to Sunday 25 in the time zone of the settings (UTC here
// unless a test says otherwise); only the last two days have runs: the case of the screenshot (five empty days).
const NOW = Date.parse('2026-10-25T12:00:00.000Z');

function runsOf(day: string, completed: number, failed: number) {
	return [
		...Array.from({ length: completed }, () => ({ startedAt: `${day}T10:00:00.000Z`, status: 'completed' })),
		...Array.from({ length: failed }, () => ({ startedAt: `${day}T11:00:00.000Z`, status: 'failed' })),
	];
}
const RUNS = [...runsOf('2026-10-25', 13, 4), ...runsOf('2026-10-24', 20, 12)];

// Date only: the timers stay real (ResizeObserver stubs, testing-library).
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const UTC = { ...DEFAULT_DATE_SETTINGS, timeZone: 'UTC' };

function show(props: Partial<Parameters<typeof RunBars>[0]> = {}, settings?: Partial<typeof DEFAULT_DATE_SETTINGS>) {
	return render(
		<DateFormatProvider formatter={createDateFormatter({ ...UTC, ...settings })}>
			<MemoryRouter>
				<RunBars runs={RUNS} truncated={false} to={TO} unexpectedKeys={[]} {...props} />
			</MemoryRouter>
		</DateFormatProvider>
	);
}

// jsdom has no layout: a stub reports the width of the chart box (content width) to the ResizeObserver of the component.
function stubChartWidth(width: number) {
	vi.stubGlobal(
		'ResizeObserver',
		class {
			constructor(private readonly callback: ResizeObserverCallback) {}
			observe(target: Element) {
				this.callback([{ target, contentRect: { width } } as unknown as ResizeObserverEntry], this as never);
			}
			unobserve() {}
			disconnect() {}
		}
	);
}

function labels() {
	return screen.getAllByTestId('run-bars-day').map(column => column.textContent);
}

describe('RunBars weekday label width', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('keeps the full names when the style is long and the columns are wide enough', () => {
		stubChartWidth(900);
		show({}, { weekdayStyle: 'long' });
		expect(labels()).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
	});

	it('falls back to the 3-letter names for the visible label only when long names do not fit', () => {
		stubChartWidth(300);
		show({}, { weekdayStyle: 'long' });
		expect(labels()).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
	});

	it('falls back to the narrow letter when even the 3-letter names do not fit', () => {
		stubChartWidth(120);
		show({}, { weekdayStyle: 'long' });
		expect(labels()).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
		cleanup();
		show({}, { weekdayStyle: 'short' });
		expect(labels()).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
	});

	it('never widens a narrow or short style', () => {
		stubChartWidth(900);
		show({}, { weekdayStyle: 'narrow' });
		expect(labels()).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
		cleanup();
		show({}, { weekdayStyle: 'short' });
		expect(labels()).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
	});

	it.each([
		['narrow', 900],
		['short', 300],
		['long', 120],
		['long', 900],
	] as const)(
		'always puts the full weekday in the tooltips and the link names (style %s, width %s)',
		(weekdayStyle, width) => {
			stubChartWidth(width);
			show({}, { weekdayStyle });
			const busy = screen.getAllByTestId('run-bars-day')[5]!;
			expect(busy.getAttribute('title')).toMatch(/^Saturday 24 Oct 2026: /);
			const label = within(busy).getByText(/^(S|Sat|Saturday)$/);
			expect(label.getAttribute('title')).toBe('Saturday, 24 Oct 2026 (UTC)');
			for (const link of within(busy).getAllByRole('link')) {
				expect(link.getAttribute('title')).toMatch(/^Saturday 24 Oct 2026: /);
				expect(link.getAttribute('aria-label')).toContain('on Saturday 24 Oct 2026)');
			}
		}
	);

	it('uses the full name in the tooltip in the language of the settings', () => {
		stubChartWidth(120);
		show({}, { locale: 'fr-FR', weekdayStyle: 'long' });
		expect(screen.getAllByTestId('run-bars-day')[5]!.getAttribute('title')).toMatch(/^samedi /);
	});
});

describe('RunBars', () => {
	it('gives each of the 7 days an equal column of the whole width, empty days included', () => {
		show();
		expect(screen.getAllByTestId('run-bars-day')).toHaveLength(7);
		const chart = screen.getByRole('group');
		expect(chart.className).toMatch(/\bw-full\b/);
		expect(chart.style.gridTemplateColumns).toBe('repeat(7, minmax(0, 1fr))');
	});

	it('draws a baseline stub on a day without run, so the week reads as seven days and not as two bars squeezed right', () => {
		show();
		const columns = screen.getAllByTestId('run-bars-day');
		expect(columns[0]!.querySelector('[data-testid="run-bars-baseline"]')).not.toBeNull();
		expect(columns[0]!.querySelectorAll('[data-testid="run-bars-bar"]')).toHaveLength(0);
		expect(columns[5]!.querySelectorAll('[data-testid="run-bars-bar"]')).toHaveLength(2);
	});

	it('scales the bars on the busiest one and colours completed green, failed red', () => {
		show();
		const [completed, failed] = screen
			.getAllByTestId('run-bars-day')[5]!
			.querySelectorAll<HTMLElement>('[data-testid="run-bars-bar"]');
		expect(completed!.style.height).toBe('100%');
		expect(completed!.className).toMatch(/\bbg-success\b/);
		expect(failed!.style.height).toBe('60%');
		expect(failed!.className).toMatch(/\bbg-danger\b/);
	});

	it('names each day with the weekday of its own date in the style of the settings, with its date and zone as tooltip', () => {
		show();
		const columns = screen.getAllByTestId('run-bars-day');
		expect(columns.map(column => column.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
		const label = within(columns[5]!).getByText('Sat');
		expect(label.getAttribute('title')).toBe('Saturday, 24 Oct 2026 (UTC)');
	});

	it('keeps the bars in the order of the data (last 7 days ending today) whatever the first day of the week of the settings', () => {
		// Sunday-first week, narrow letters, French: the bars still start on Monday 19 and end on Sunday 25.
		show({}, { locale: 'fr-FR', weekStart: 'sunday', weekdayStyle: 'narrow' });
		const columns = screen.getAllByTestId('run-bars-day');
		expect(columns.map(column => column.textContent)).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
	});

	it('follows the weekday style of the settings (long names)', () => {
		show({}, { weekdayStyle: 'long' });
		const columns = screen.getAllByTestId('run-bars-day');
		expect(columns[0]!.textContent).toBe('Monday');
		expect(columns[6]!.textContent).toBe('Sunday');
	});

	it('names each day with its date and counts in the title, the date written by the central formatter', () => {
		show();
		const busy = screen.getAllByTestId('run-bars-day')[5]!;
		expect(busy.getAttribute('title')).toMatch(/^Saturday 24 Oct 2026: 20 completed, 12 failed\. /);
	});

	it('writes the date of the title in ISO form when the settings ask for the iso preset', () => {
		show({}, { preset: 'iso' });
		const busy = screen.getAllByTestId('run-bars-day')[5]!;
		expect(busy.getAttribute('title')).toMatch(/^Saturday 2026-10-24: 20 completed, 12 failed\. /);
	});

	it('says in the title of the day and of every bar that the days follow the time zone of the date settings', () => {
		show();
		const note = 'Days follow the time zone of your date settings (UTC).';
		const busy = screen.getAllByTestId('run-bars-day')[5]!;
		expect(busy.getAttribute('title')).toContain(note);
		const [completed, failed] = within(busy).getAllByRole('link');
		expect(completed!.getAttribute('title')).toContain(note);
		expect(failed!.getAttribute('title')).toContain(note);
		// The accessible name stays short: the note is for the tooltip only.
		expect(completed!.getAttribute('aria-label')).not.toContain('time zone');
	});

	it('writes the weekday labels at 11px or more', () => {
		show();
		const label = within(screen.getAllByTestId('run-bars-day')[5]!).getByText('Sat');
		expect(label.className).toMatch(/text-\[(1[1-9]|[2-9]\d)px\]|text-(xs|sm|base)\b/);
	});

	it('summarises the week for assistive technology', () => {
		show();
		expect(screen.getByRole('group').getAttribute('aria-label')).toBe(
			'Runs of the last 7 days: 33 completed, 16 failed'
		);
	});

	it('makes each bar a real link to the executions of its status, with an accessible name that says so', () => {
		show();
		const links = screen.getAllByRole('link');
		expect(links.map(link => link.getAttribute('href'))).toEqual([
			'/modules/flow/executions?status=completed',
			'/modules/flow/executions?status=failed',
			'/modules/flow/executions?status=completed',
			'/modules/flow/executions?status=failed',
		]);
		expect(links[1]!.getAttribute('aria-label')).toBe('Show the failed executions (12 on Saturday 24 Oct 2026)');
		expect(links[2]!.getAttribute('aria-label')).toBe('Show the completed executions (13 on Sunday 25 Oct 2026)');
		// Focus and hover are visible; the link takes the whole height of the column, so a short bar is easy to hit.
		expect(links[0]!.className).toMatch(/(^| )focus-visible:/);
		expect(links[0]!.className).toMatch(/(^| )h-full( |$)/);
		expect(links[0]!.className).toMatch(/(^| )group( |$)/);
		expect(links[0]!.querySelector('[data-testid="run-bars-bar"]')!.className).toMatch(/group-hover:/);
	});

	it('draws no link on a day without run', () => {
		show({ runs: [] });
		expect(screen.queryAllByRole('link')).toHaveLength(0);
	});

	it('draws seven empty days, each with a baseline, when no run is in the list', () => {
		show({ runs: [] });
		expect(screen.getAllByTestId('run-bars-day')).toHaveLength(7);
		expect(screen.getAllByTestId('run-bars-baseline')).toHaveLength(7);
		expect(screen.getByRole('group').getAttribute('aria-label')).toBe(
			'Runs of the last 7 days: 0 completed, 0 failed'
		);
	});

	it('puts a run on the day it started in the time zone of the settings, not on its UTC day', () => {
		const lateRuns = [
			{ startedAt: '2026-10-24T09:59:59.000Z', status: 'completed' },
			{ startedAt: '2026-10-24T10:00:00.000Z', status: 'failed' },
		];
		// Pacific/Kiritimati is UTC+14: it is already Monday 26 there, and 10:00Z is the midnight that starts Sunday 25.
		show({ runs: lateRuns }, { timeZone: 'Pacific/Kiritimati' });
		const columns = screen.getAllByTestId('run-bars-day');
		expect(columns.map(column => column.textContent)).toEqual(['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon']);
		expect(columns[4]!.getAttribute('title')).toMatch(/^Saturday 24 Oct 2026: 1 completed, 0 failed\. /);
		expect(columns[5]!.getAttribute('title')).toMatch(/^Sunday 25 Oct 2026: 0 completed, 1 failed\. /);
		expect(columns[6]!.getAttribute('title')).toMatch(/^Monday 26 Oct 2026: 0 completed, 0 failed\. /);
		cleanup();
		// The same two runs in UTC both belong to Saturday 24.
		show({ runs: lateRuns }, { timeZone: 'UTC' });
		expect(screen.getAllByTestId('run-bars-day')[5]!.getAttribute('title')).toMatch(
			/^Saturday 24 Oct 2026: 1 completed, 1 failed\. /
		);
	});

	it('puts a run of the evening of the day before in America/Los_Angeles (PDT, UTC-7)', () => {
		show(
			{ runs: [{ startedAt: '2026-10-25T06:59:00.000Z', status: 'failed' }] },
			{ timeZone: 'America/Los_Angeles' }
		);
		const columns = screen.getAllByTestId('run-bars-day');
		expect(columns[5]!.getAttribute('title')).toMatch(/^Saturday 24 Oct 2026: 0 completed, 1 failed\. /);
		expect(columns[6]!.getAttribute('title')).toMatch(/^Sunday 25 Oct 2026: 0 completed, 0 failed\. /);
	});

	it('keeps one column per calendar day over the autumn DST change of Los Angeles (25-hour day)', () => {
		vi.setSystemTime(Date.parse('2026-11-03T12:00:00.000Z'));
		show({ runs: [] }, { timeZone: 'America/Los_Angeles', weekdayStyle: 'long' });
		expect(labels()).toEqual(['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday']);
		expect(screen.getAllByTestId('run-bars-day')[4]!.getAttribute('title')).toMatch(/^Sunday 1 Nov 2026: /);
	});

	it('shows no note when the list is complete, and a note with the count when the source cut it', () => {
		show();
		expect(screen.queryByRole('status')).toBeNull();
		cleanup();
		show({ truncated: true });
		expect(screen.getByRole('status').textContent).toBe(
			`Only the newest ${RUNS.length} runs are counted: the oldest days may show fewer.`
		);
	});

	it('renders an error naming the cause for keys outside the contract, bad days and a bad page', () => {
		const { unmount } = show({ unexpectedKeys: ['height'] });
		expect(screen.getByRole('alert').textContent).toMatch(/does not accept height.*Keep only runs, truncated, to/);
		unmount();
		const second = show({ runs: 'x' });
		expect(screen.getByRole('alert').textContent).toMatch(/runs must be a list/);
		second.unmount();
		show({ to: undefined });
		expect(screen.getByRole('alert').textContent).toMatch(/flow:RunBars to must be an app path/);
		cleanup();
		show({ truncated: undefined });
		expect(screen.getByRole('alert').textContent).toMatch(/truncated must be true or false/);
		cleanup();
		show({ runs: [{ startedAt: 'x', status: 'completed' }] });
		expect(screen.getByRole('alert').textContent).toMatch(/run 0 startedAt/);
	});
});

// A stub whose width can change after the first measure, like a widget resized by the user.
function stubResizableChart(initialWidth: number) {
	const observers = new Set<{ report: (width: number) => void }>();
	vi.stubGlobal(
		'ResizeObserver',
		class {
			private target: Element | undefined;
			constructor(private readonly callback: ResizeObserverCallback) {}
			report(width: number) {
				this.callback(
					[{ target: this.target, contentRect: { width } } as unknown as ResizeObserverEntry],
					this as never
				);
			}
			observe(target: Element) {
				this.target = target;
				observers.add(this);
				this.report(initialWidth);
			}
			unobserve() {}
			disconnect() {
				observers.delete(this);
			}
		}
	);
	return (width: number) => act(() => observers.forEach(observer => observer.report(width)));
}

function renderWith(weekdayStyle: 'narrow' | 'short' | 'long') {
	return (
		<DateFormatProvider formatter={createDateFormatter({ ...UTC, weekdayStyle })}>
			<MemoryRouter>
				<RunBars runs={RUNS} truncated={false} to={TO} unexpectedKeys={[]} />
			</MemoryRouter>
		</DateFormatProvider>
	);
}

const LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const NARROW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

describe('RunBars when the settings or the width change without a remount', () => {
	afterEach(() => vi.unstubAllGlobals());

	// Regression guard for the dsl-ui DateFormatProvider bug (formatter key ignored weekdayStyle, fixed in 2026.10.26-294):
	// the weekday style must apply without a remount.
	it('shows the full names after the style goes from short to long in a wide widget', () => {
		stubResizableChart(900);
		const view = render(renderWith('short'));
		expect(labels()).toEqual(SHORT);
		view.rerender(renderWith('long'));
		expect(labels()).toEqual(LONG);
	});

	it('shows the short names after the style goes from long to short in a wide widget', () => {
		stubResizableChart(900);
		const view = render(renderWith('long'));
		expect(labels()).toEqual(LONG);
		view.rerender(renderWith('short'));
		expect(labels()).toEqual(SHORT);
	});

	it('falls back and recovers when the widget is resized', () => {
		const resize = stubResizableChart(300);
		render(renderWith('long'));
		expect(labels()).toEqual(SHORT);
		resize(900);
		expect(labels()).toEqual(LONG);
		resize(120);
		expect(labels()).toEqual(NARROW);
		resize(900);
		expect(labels()).toEqual(LONG);
	});
});
