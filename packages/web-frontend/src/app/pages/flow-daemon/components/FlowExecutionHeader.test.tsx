import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildExecutionDetail } from '../flowDaemonFixtures';
import { FlowExecutionHeader } from './FlowExecutionHeader';

function renderProjectValue(overrides: Parameters<typeof buildExecutionDetail>[0]): HTMLElement {
	render(<FlowExecutionHeader execution={buildExecutionDetail(overrides)} />);
	const field = screen.getByText('Project root').parentElement;
	if (field === null) {
		throw new Error('Project root field has no parent element');
	}
	return field;
}

function renderTotalCost(overrides: Parameters<typeof buildExecutionDetail>[0]): HTMLElement {
	render(<FlowExecutionHeader execution={buildExecutionDetail(overrides)} />);
	const field = screen.getByText('Total cost').parentElement;
	if (field === null) {
		throw new Error('Total cost field has no parent element');
	}
	return field;
}

describe('FlowExecutionHeader total cost field', () => {
	it('shows the daemon label with its lower-bound marker when the total is incomplete', () => {
		const field = renderTotalCost({
			totalCostUsd: 2.79,
			totalCostComplete: false,
			totalCostLabel: '$2.7900+ (2 attempts unknown)',
		});

		expect(within(field).getByText('$2.7900+ (2 attempts unknown)')).toBeInTheDocument();
	});

	it('shows unknown as text, never as $0', () => {
		const field = renderTotalCost({ totalCostUsd: 0, totalCostComplete: false, totalCostLabel: 'unknown' });

		expect(within(field).getByText('unknown')).toBeInTheDocument();
		expect(within(field).queryByText(/\$0/)).not.toBeInTheDocument();
	});

	it('shows the label of a complete total', () => {
		const field = renderTotalCost({ totalCostUsd: 0.00749017, totalCostComplete: true, totalCostLabel: '$0.0075' });

		expect(within(field).getByText('$0.0075')).toBeInTheDocument();
	});

	it('keeps the numeric format for a payload from an older daemon without label', () => {
		const field = renderTotalCost({ totalCostUsd: 1.5, totalCostLabel: undefined });

		expect(within(field).getByText('$1.5000')).toBeInTheDocument();
	});
});

describe('FlowExecutionHeader project field', () => {
	it('shows the project label and exposes the root as tooltip when both exist', () => {
		const field = renderProjectValue({
			projectRoot: '/projects/my-app',
			projectLabel: 'my-app (8c6f9d63)',
		});

		const value = within(field).getByText('my-app (8c6f9d63)');
		expect(value).toHaveAttribute('title', '/projects/my-app');
		expect(within(field).queryByText('/projects/my-app')).not.toBeInTheDocument();
	});

	it('shows the label without tooltip when there is no project root', () => {
		const field = renderProjectValue({ projectRoot: undefined, projectLabel: '8c6f9d63 (removed)' });

		expect(within(field).getByText('8c6f9d63 (removed)')).not.toHaveAttribute('title');
	});

	it('falls back to the project root when there is no label', () => {
		const field = renderProjectValue({ projectRoot: '/projects/my-app', projectLabel: undefined });

		const value = within(field).getByText('/projects/my-app');
		expect(value).not.toHaveAttribute('title');
	});

	it('falls back to a dash when neither label nor root exist', () => {
		const field = renderProjectValue({ projectRoot: undefined, projectLabel: undefined });

		expect(within(field).getByText('-')).toBeInTheDocument();
	});
});
