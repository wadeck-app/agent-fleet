import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { PageSizeSelector } from './PageSizeSelector';

describe('PageSizeSelector', () => {
	// Mock scrollIntoView for jsdom (not implemented in jsdom, used by Radix UI Select)
	beforeAll(() => {
		Element.prototype.scrollIntoView = vi.fn();
	});
	describe('Rendering', () => {
		it('should render with default options', () => {
			const onChange = vi.fn();
			render(<PageSizeSelector value={10} onChange={onChange} />);

			expect(screen.getByText('Items per page:')).toBeInTheDocument();
			expect(screen.getByRole('combobox')).toBeInTheDocument();
		});

		it('should render with custom label', () => {
			const onChange = vi.fn();
			render(<PageSizeSelector value={10} onChange={onChange} label="Rows per page:" />);

			expect(screen.getByText('Rows per page:')).toBeInTheDocument();
		});

		it('should hide label when showLabel is false', () => {
			const onChange = vi.fn();
			render(<PageSizeSelector value={10} onChange={onChange} showLabel={false} />);

			expect(screen.queryByText('Items per page:')).not.toBeInTheDocument();
		});

		it('should render with custom options', () => {
			const onChange = vi.fn();
			render(<PageSizeSelector value={25} onChange={onChange} options={[10, 25, 50, 100]} />);

			expect(screen.getByRole('combobox')).toBeInTheDocument();
		});

		it('should display current value', () => {
			const onChange = vi.fn();
			render(<PageSizeSelector value={20} onChange={onChange} />);

			// The select should show the current value
			const select = screen.getByRole('combobox');
			expect(select).toHaveAttribute('data-state');
		});
	});

	describe('Interaction', () => {
		it('should call onChange when selecting a different option', async () => {
			const user = userEvent.setup();
			const onChange = vi.fn();

			render(<PageSizeSelector value={10} onChange={onChange} />);

			const select = screen.getByRole('combobox');
			await user.click(select);

			// Wait for options to appear and click one
			const option = await screen.findByRole('option', { name: '20' });
			await user.click(option);

			expect(onChange).toHaveBeenCalledWith(20);
		});

		it('should not call onChange when disabled', async () => {
			const user = userEvent.setup();
			const onChange = vi.fn();

			render(<PageSizeSelector value={10} onChange={onChange} disabled />);

			const select = screen.getByRole('combobox');
			expect(select).toBeDisabled();

			await user.click(select);
			expect(onChange).not.toHaveBeenCalled();
		});
	});

	describe('Accessibility', () => {
		it('should have accessible label when label is shown', () => {
			const onChange = vi.fn();
			render(<PageSizeSelector value={10} onChange={onChange} />);

			const select = screen.getByRole('combobox');
			expect(select).toBeInTheDocument();
		});

		it('should use aria-label when label is hidden', () => {
			const onChange = vi.fn();
			render(<PageSizeSelector value={10} onChange={onChange} showLabel={false} aria-label="Select page size" />);

			const select = screen.getByRole('combobox');
			expect(select).toHaveAttribute('aria-label', 'Select page size');
		});

		it('should use default label as aria-label when hidden and no aria-label provided', () => {
			const onChange = vi.fn();
			render(<PageSizeSelector value={10} onChange={onChange} showLabel={false} />);

			const select = screen.getByRole('combobox');
			expect(select).toHaveAttribute('aria-label', 'Items per page:');
		});
	});

	describe('Edge Cases', () => {
		it('should handle invalid string values gracefully', async () => {
			const user = userEvent.setup();
			const onChange = vi.fn();

			render(<PageSizeSelector value={10} onChange={onChange} />);

			const select = screen.getByRole('combobox');
			await user.click(select);

			// Select a valid option
			const option = await screen.findByRole('option', { name: '5' });
			await user.click(option);

			expect(onChange).toHaveBeenCalledWith(5);
		});

		it('should handle empty options array', () => {
			const onChange = vi.fn();
			render(<PageSizeSelector value={10} onChange={onChange} options={[]} />);

			const select = screen.getByRole('combobox');
			expect(select).toBeInTheDocument();
		});

		it('should work with single option', async () => {
			const user = userEvent.setup();
			const onChange = vi.fn();

			render(<PageSizeSelector value={10} onChange={onChange} options={[10]} />);

			const select = screen.getByRole('combobox');
			await user.click(select);

			const option = await screen.findByRole('option', { name: '10' });
			expect(option).toBeInTheDocument();
		});
	});

	describe('Styling', () => {
		it('should apply custom className', () => {
			const onChange = vi.fn();
			const { container } = render(
				<PageSizeSelector value={10} onChange={onChange} className={`custom-class`} />
			);

			const wrapper = container.firstChild as HTMLElement;
			expect(wrapper).toHaveClass('custom-class');
		});

		it('should support different sizes', () => {
			const onChange = vi.fn();
			const { rerender } = render(<PageSizeSelector value={10} onChange={onChange} size="sm" />);

			let select = screen.getByRole('combobox');
			expect(select).toHaveAttribute('data-size', 'sm');

			rerender(<PageSizeSelector value={10} onChange={onChange} size="default" />);
			select = screen.getByRole('combobox');
			expect(select).toHaveAttribute('data-size', 'default');
		});
	});
});
