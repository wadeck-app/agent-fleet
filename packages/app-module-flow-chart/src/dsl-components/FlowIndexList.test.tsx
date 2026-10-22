import { MemoryRouter } from 'react-router-dom';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FlowIndexList, type FlowIndexRow } from './FlowIndexList.js';
import entries from './index.js';

function row(flowId: string, lastStatus: string, extra: Partial<FlowIndexRow> = {}): FlowIndexRow {
	return {
		flowId,
		runCount: 3,
		failedCount: 1,
		lastStatus,
		lastRunAt: '2026-10-18T11:00:00.000Z',
		chartPath: `/modules/flow-chart/flows/${flowId}`,
		lastRunChartPath: `/modules/flow-chart/flows/runs/${flowId}-run`,
		...extra,
	};
}

function show(flows: unknown, layout: unknown = 'cards', emptyMessage?: unknown) {
	return render(
		<MemoryRouter>
			<FlowIndexList flows={flows} layout={layout} emptyMessage={emptyMessage} />
		</MemoryRouter>
	);
}

describe.each(['cards', 'list'])('FlowIndexList %s', layout => {
	it('gives each flow a name link, the status, the counts and both chart targets', () => {
		show([row('build', 'failed'), row('lint', 'completed', { runCount: 1, failedCount: 0 })], layout);
		const build = within(screen.getByTestId('flow-build'));
		expect(build.getByRole('link', { name: 'build' }).getAttribute('href')).toBe('/modules/flow-chart/flows/build');
		expect(build.getByRole('link', { name: 'Open chart' }).getAttribute('href')).toBe(
			'/modules/flow-chart/flows/build'
		);
		expect(build.getByRole('link', { name: 'Latest run chart' }).getAttribute('href')).toBe(
			'/modules/flow-chart/flows/runs/build-run'
		);
		expect(build.getByText('failed')).toBeTruthy();
		expect(build.getByText(/3 runs/)).toBeTruthy();
		expect(build.getByText(/1 failed/)).toBeTruthy();
		expect(within(screen.getByTestId('flow-lint')).getByText(/1 run\b/)).toBeTruthy();
		expect(within(screen.getByTestId('flow-lint')).queryByText(/failed/)).toBeNull();
	});

	it('says so when there is no flow (custom message first)', () => {
		show([], layout, 'No flow matches your filter.');
		expect(screen.getByRole('status').textContent).toBe('No flow matches your filter.');
	});

	it('shows an error, not an empty list, when no list reached it', () => {
		show(undefined, layout);
		expect(screen.getByRole('alert').textContent).toMatch(/did not receive a list of flows/);
	});

	it('refuses a status it does not know', () => {
		expect(() => show([row('x', 'exploded')], layout)).toThrow(/Unknown execution status 'exploded'/);
	});
});

describe('FlowIndexList layout', () => {
	it('refuses an unknown layout', () => {
		expect(() => show([], 'grid')).toThrow(/layout: cards or list, got "grid"/);
	});

	it('is registered with its keys', () => {
		const entry = entries.find(e => e.name === 'FlowIndexList');
		expect(entry?.knownKeys).toEqual(['flows', 'layout', 'emptyMessage']);
	});
});
