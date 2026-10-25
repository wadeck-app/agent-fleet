import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RunBars } from './RunBars.js';

// Seven local days, only the last two with runs: the case of the screenshot (five empty days).
const DAYS = Array.from({ length: 7 }, (_, index) => ({
	dayStart: new Date(2026, 9, 19 + index).toISOString(),
	completed: index === 5 ? 20 : index === 6 ? 13 : 0,
	failed: index === 5 ? 12 : index === 6 ? 4 : 0,
}));

function show(props: Partial<Parameters<typeof RunBars>[0]> = {}) {
	return render(<RunBars days={DAYS} unexpectedKeys={[]} {...props} />);
}

describe('RunBars', () => {
	it('gives each of the 7 days an equal column of the whole width, empty days included', () => {
		show();
		expect(screen.getAllByTestId('run-bars-day')).toHaveLength(7);
		const chart = screen.getByRole('img');
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

	it('names each day with its counts in the title and the weekday letter under it', () => {
		show();
		const busy = screen.getAllByTestId('run-bars-day')[5]!;
		expect(busy.getAttribute('title')).toMatch(/20 completed, 12 failed/);
		expect(busy.textContent).toMatch(/^[A-Za-z]$/);
	});

	it('summarises the week for assistive technology', () => {
		show();
		expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
			'Runs of the last 7 days: 33 completed, 16 failed'
		);
	});

	it('says there is no data instead of drawing nothing for an empty list', () => {
		show({ days: [] });
		expect(screen.getByText('No data')).toBeInTheDocument();
	});

	it('renders an error naming the cause for keys outside the contract and for bad days', () => {
		const { unmount } = show({ unexpectedKeys: ['height'] });
		expect(screen.getByRole('alert').textContent).toMatch(/does not accept height.*Keep only days/);
		unmount();
		show({ days: 'x' });
		expect(screen.getByRole('alert').textContent).toMatch(/days must be a list/);
	});
});
