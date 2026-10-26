import { MemoryRouter } from 'react-router-dom';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RunBars } from './RunBars.js';

const TO = '/modules/flow/executions';

// Seven local days from Monday 2026-10-19, only the last two with runs: the case of the screenshot (five empty days).
const DAYS = Array.from({ length: 7 }, (_, index) => ({
	dayStart: new Date(2026, 9, 19 + index).toISOString(),
	completed: index === 5 ? 20 : index === 6 ? 13 : 0,
	failed: index === 5 ? 12 : index === 6 ? 4 : 0,
}));

function show(props: Partial<Parameters<typeof RunBars>[0]> = {}) {
	return render(
		<MemoryRouter>
			<RunBars days={DAYS} to={TO} unexpectedKeys={[]} {...props} />
		</MemoryRouter>
	);
}

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

	it('names each day with 3 English letters, whatever the language of the browser, with the exact instant as tooltip', () => {
		show();
		const columns = screen.getAllByTestId('run-bars-day');
		expect(columns.map(column => column.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
		const label = within(columns[5]!).getByText('Sat');
		expect(label.getAttribute('title')).toBe(DAYS[5]!.dayStart);
	});

	it('names each day with its date and counts in the title', () => {
		show();
		const busy = screen.getAllByTestId('run-bars-day')[5]!;
		expect(busy.getAttribute('title')).toBe('Sat, Oct 24: 20 completed, 12 failed');
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
		expect(links[1]!.getAttribute('aria-label')).toBe('Show the failed executions (12 on Sat, Oct 24)');
		expect(links[2]!.getAttribute('aria-label')).toBe('Show the completed executions (13 on Sun, Oct 25)');
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
