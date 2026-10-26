import { MemoryRouter } from 'react-router-dom';

import { render, screen } from '@testing-library/react';
import { DEFAULT_DATE_SETTINGS, createDateFormatter } from '@wadeck-app/dsl-ui';
import { describe, expect, it, vi } from 'vitest';

import { RunList } from './RunList.js';

// The host may ship a DateText that writes no tooltip: the row must not depend on it for the exact timestamp.
vi.mock('@wadeck-app/dsl-ui', async importOriginal => {
	const actual = await importOriginal<typeof import('@wadeck-app/dsl-ui')>();
	const { createElement } = await import('react');
	return {
		...actual,
		DateText: ({ value }: { value: string }) =>
			createElement('span', null, actual.createDateFormatter(actual.DEFAULT_DATE_SETTINGS).format(value)),
	};
});

const RUNS = [{ executionId: 'a1', flowId: 'build', statusLabel: 'ok', startedAt: '2026-10-24T11:27:48.386Z' }];

describe('RunList date tooltip', () => {
	it('carries the exact timestamp as tooltip on the date text itself, whatever DateText does', () => {
		render(
			<MemoryRouter>
				<RunList runs={RUNS} to="/runs/{executionId}" emptyMessage="none" unexpectedKeys={[]} />
			</MemoryRouter>
		);
		const time = document.querySelector('time');
		expect(time?.getAttribute('title')).toBe(createDateFormatter(DEFAULT_DATE_SETTINGS).exact(RUNS[0]!.startedAt));
		expect(time?.getAttribute('datetime')).toBe(RUNS[0]!.startedAt);
		// The link has no title of its own that would hide the date tooltip, and keeps its accessible name from its content.
		const link = screen.getByRole('link');
		expect(link.getAttribute('title')).toBeNull();
		expect(link.textContent).toContain('build');
	});
});
