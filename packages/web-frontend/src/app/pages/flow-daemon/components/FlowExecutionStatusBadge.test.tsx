import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FlowExecutionStatusBadge } from './FlowExecutionStatusBadge';

describe('FlowExecutionStatusBadge', () => {
	it('shows the status text with the variant of that status', () => {
		render(<FlowExecutionStatusBadge status="failed" />);

		const badge = screen.getByText('failed');
		expect(badge).toHaveAttribute('data-variant', 'destructive');
	});

	it('renders a pending step status', () => {
		render(<FlowExecutionStatusBadge status="pending" />);

		expect(screen.getByText('pending')).toHaveAttribute('data-variant', 'outline');
	});

	it('says paused in warning for a paused run (stored as running), with the reason as the tooltip', () => {
		render(
			<FlowExecutionStatusBadge
				status="running"
				paused={{ since: '2026-11-22T10:00:00.000Z', reason: 'budget exceeded' }}
			/>
		);

		const badge = screen.getByText('paused');
		expect(badge).toHaveAttribute('data-variant', 'warning');
		expect(badge).toHaveAttribute('title', expect.stringContaining('Reason: budget exceeded.'));
		expect(screen.queryByText('running')).toBeNull();
	});

	it('keeps the running badge for a run that is not paused', () => {
		render(<FlowExecutionStatusBadge status="running" />);

		expect(screen.getByText('running')).toHaveAttribute('data-variant', 'info');
	});

	it('fails loudly on an unknown status', () => {
		// React logs the render error; keep the test output readable
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			expect(() => render(<FlowExecutionStatusBadge status="paused" />)).toThrow(
				/Unknown execution status 'paused'/
			);
		} finally {
			consoleError.mockRestore();
		}
	});
});
