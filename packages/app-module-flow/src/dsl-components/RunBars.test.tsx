import { MemoryRouter } from 'react-router-dom';

import { cleanup, render, screen, within } from '@testing-library/react';
import { DEFAULT_DATE_SETTINGS, DateFormatProvider, createDateFormatter } from '@wadeck-app/dsl-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RunBars } from './RunBars.js';

const TO = '/modules/flow/executions';

// Seven local days from Monday 2026-10-19, only the last two with runs: the case of the screenshot (five empty days).
const DAYS = Array.from({ length: 7 }, (_, index) => ({
	dayStart: new Date(2026, 9, 19 + index).toISOString(),
	completed: index === 5 ? 20 : index === 6 ? 13 : 0,
	failed: index === 5 ? 12 : index === 6 ? 4 : 0,
}));

// Without a DateFormatProvider the dsl-ui default applies (en-GB, 24h, zone of the machine).
const formatter = createDateFormatter(DEFAULT_DATE_SETTINGS);

function show(props: Partial<Parameters<typeof RunBars>[0]> = {}, settings?: Partial<typeof DEFAULT_DATE_SETTINGS>) {
	const bars = (
		<MemoryRouter>
			<RunBars days={DAYS} to={TO} unexpectedKeys={[]} {...props} />
		</MemoryRouter>
	);
	return render(
		settings === undefined ? (
			bars
		) : (
			<DateFormatProvider formatter={createDateFormatter({ ...DEFAULT_DATE_SETTINGS, ...settings })}>
				{bars}
			</DateFormatProvider>
		)
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
			expect(label.getAttribute('title')).toBe(`Saturday, ${formatter.exact(DAYS[5]!.dayStart)}`);
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

	it('names each day with the weekday of its own date in the style of the settings, with the exact timestamp as tooltip', () => {
		show();
		const columns = screen.getAllByTestId('run-bars-day');
		expect(columns.map(column => column.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
		const label = within(columns[5]!).getByText('Sat');
		expect(label.getAttribute('title')).toBe(`Saturday, ${formatter.exact(DAYS[5]!.dayStart)}`);
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

	it('gives the exact instant of the day start and its zone in the title of the day and of every bar', () => {
		show();
		const iso = formatter.exact(DAYS[5]!.dayStart);
		const busy = screen.getAllByTestId('run-bars-day')[5]!;
		expect(busy.getAttribute('title')).toContain(
			`Day starts ${iso} (local midnight of the machine that serves this page)`
		);
		const [completed, failed] = within(busy).getAllByRole('link');
		expect(completed!.getAttribute('title')).toContain(`Day starts ${iso} (local midnight`);
		expect(failed!.getAttribute('title')).toContain(`Day starts ${iso} (local midnight`);
		// The accessible name stays short: the instant is for the tooltip only.
		expect(completed!.getAttribute('aria-label')).not.toContain(iso);
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
		show({ days: [DAYS[0]!] });
		expect(screen.queryAllByRole('link')).toHaveLength(0);
	});

	it('says there is no data instead of drawing nothing for an empty list', () => {
		show({ days: [] });
		expect(screen.getByText('No data')).toBeInTheDocument();
	});

	it('renders an error naming the cause for keys outside the contract, bad days and a bad page', () => {
		const { unmount } = show({ unexpectedKeys: ['height'] });
		expect(screen.getByRole('alert').textContent).toMatch(/does not accept height.*Keep only days, to/);
		unmount();
		const second = show({ days: 'x' });
		expect(screen.getByRole('alert').textContent).toMatch(/days must be a list/);
		second.unmount();
		show({ to: undefined });
		expect(screen.getByRole('alert').textContent).toMatch(/flow:RunBars to must be an app path/);
	});
});
