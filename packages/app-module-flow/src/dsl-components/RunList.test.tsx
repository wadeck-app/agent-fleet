import { MemoryRouter } from 'react-router-dom';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RunList } from './RunList.js';

const TO = '/modules/flow/executions/{executionId}';
const LONG_NAME = 'factory_retrospective_long_running_pipeline_with_a_44_char_name';
const RUNS = [
	{ executionId: 'a1', flowId: LONG_NAME, statusLabel: 'ok', startedAt: '2026-10-24T11:27:48.386Z' },
	{ executionId: 'b2', flowId: 'build', statusLabel: 'FAILED', startedAt: '2026-10-23T09:00:00.000Z' },
];

function show(props: Partial<Parameters<typeof RunList>[0]> = {}) {
	return render(
		<MemoryRouter>
			<RunList runs={RUNS} to={TO} emptyMessage="No execution yet" unexpectedKeys={[]} {...props} />
		</MemoryRouter>
	);
}

describe('RunList', () => {
	it('draws one link per run, to the page of the run', () => {
		show();
		const links = screen.getAllByRole('link');
		expect(links.map(link => link.getAttribute('href'))).toEqual([
			'/modules/flow/executions/a1',
			'/modules/flow/executions/b2',
		]);
	});

	it('shows the status, the whole flow name (truncated by the layout, full text in the title) and the time of each run', () => {
		show();
		const name = screen.getByText(LONG_NAME);
		expect(name.className).toMatch(/\btruncate\b/);
		expect(name.className).toMatch(/\bmin-w-0\b/);
		expect(name.getAttribute('title')).toBe(LONG_NAME);
		expect(screen.getByText('ok')).toBeInTheDocument();
		expect(screen.getByText('FAILED')).toBeInTheDocument();
		const time = document.querySelector('time');
		expect(time?.getAttribute('datetime')).toBe('2026-10-24T11:27:48.386Z');
		expect(time?.className).toMatch(/\bshrink-0\b/);
		expect(time?.className).toMatch(/\bwhitespace-nowrap\b/);
	});

	it('never lets the list scroll sideways', () => {
		const { container } = show();
		expect((container.firstElementChild as HTMLElement).className).toMatch(/\boverflow-hidden\b/);
	});

	it('shows the empty message when there is no run', () => {
		show({ runs: [] });
		expect(screen.getByText('No execution yet')).toBeInTheDocument();
		expect(screen.queryByRole('link')).toBeNull();
	});

	it('says what is wrong with the keys, the list, the template or a status instead of drawing something', () => {
		show({ unexpectedKeys: ['className'] });
		expect(screen.getByRole('alert').textContent).toMatch(/does not accept className.*runs, to, emptyMessage/);
	});

	it.each([
		[{ runs: 'x' }, /runs must be a list/],
		[{ to: '/nowhere' }, /\{executionId\}/],
		[{ emptyMessage: 3 }, /emptyMessage/],
		[{ runs: [{ ...RUNS[0], statusLabel: 'exploded' }] }, /does not know the status "exploded"/],
	])('refuses %j', (props, message) => {
		show(props as Partial<Parameters<typeof RunList>[0]>);
		expect(screen.getByRole('alert').textContent).toMatch(message);
	});
});

describe('RunList time', () => {
	it('prints the start in one explicit English format and keeps the exact instant as tooltip', () => {
		const started = new Date(2026, 9, 24, 18, 38, 7).toISOString();
		show({ runs: [{ ...RUNS[0]!, startedAt: started }] });
		const time = document.querySelector('time')!;
		expect(time.textContent).toBe('Oct 24, 18:38');
		expect(time.getAttribute('title')).toBe(started);
		expect(time.getAttribute('datetime')).toBe(started);
	});
});
