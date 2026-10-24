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
