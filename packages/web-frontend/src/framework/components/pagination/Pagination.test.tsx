import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Pagination } from './Pagination';

describe('Pagination', () => {
	describe('Rendering', () => {
		it('should render even when totalPages is 1 (consistent UX)', () => {
			const { container } = render(<Pagination currentPage={1} totalPages={1} onPageChange={() => {}} />);

			expect(container.firstChild).not.toBeNull();
			expect(screen.getByRole('navigation')).toBeInTheDocument();
		});

		it('should render pagination controls when totalPages > 1', () => {
			render(<Pagination currentPage={1} totalPages={5} onPageChange={() => {}} />);

			expect(screen.getByLabelText('Go to previous page')).toBeInTheDocument();
			expect(screen.getByLabelText('Go to next page')).toBeInTheDocument();
			expect(screen.getByText('1')).toBeInTheDocument();
			expect(screen.getByText('5')).toBeInTheDocument();
		});

		it('should render first/last buttons when showFirstLast is true', () => {
			render(<Pagination currentPage={3} totalPages={10} onPageChange={() => {}} showFirstLast />);

			expect(screen.getByLabelText('Go to first page')).toBeInTheDocument();
			expect(screen.getByLabelText('Go to last page')).toBeInTheDocument();
		});

		it('should not render first/last buttons when showFirstLast is false', () => {
			render(<Pagination currentPage={3} totalPages={10} onPageChange={() => {}} showFirstLast={false} />);

			expect(screen.queryByLabelText('Go to first page')).not.toBeInTheDocument();
			expect(screen.queryByLabelText('Go to last page')).not.toBeInTheDocument();
		});

		it('should render custom labels', () => {
			render(
				<Pagination
					currentPage={3}
					totalPages={10}
					onPageChange={() => {}}
					previousLabel="Prev"
					nextLabel="Nxt"
					firstLabel="Start"
					lastLabel="End"
				/>
			);

			expect(screen.getByText('Prev')).toBeInTheDocument();
			expect(screen.getByText('Nxt')).toBeInTheDocument();
			expect(screen.getByText('Start')).toBeInTheDocument();
			expect(screen.getByText('End')).toBeInTheDocument();
		});
	});

	describe('Page Number Display', () => {
		it('should show all pages when total pages <= maxVisiblePages', () => {
			render(<Pagination currentPage={1} totalPages={5} onPageChange={() => {}} maxVisiblePages={7} />);

			expect(screen.getByText('1')).toBeInTheDocument();
			expect(screen.getByText('2')).toBeInTheDocument();
			expect(screen.getByText('3')).toBeInTheDocument();
			expect(screen.getByText('4')).toBeInTheDocument();
			expect(screen.getByText('5')).toBeInTheDocument();
		});

		it('should show ellipsis when total pages > maxVisiblePages', () => {
			render(<Pagination currentPage={5} totalPages={20} onPageChange={() => {}} maxVisiblePages={7} />);

			const ellipsis = screen.getAllByText('...');
			expect(ellipsis.length).toBeGreaterThan(0);
		});

		it('should show ellipsis when current page is far from start', () => {
			render(<Pagination currentPage={10} totalPages={20} onPageChange={() => {}} maxVisiblePages={5} />);

			// Should show pages 8-9-10-11-12
			expect(screen.getByText('8')).toBeInTheDocument();
			expect(screen.getByText('10')).toBeInTheDocument();
			expect(screen.getByText('12')).toBeInTheDocument();
			const ellipsis = screen.getAllByText('...');
			expect(ellipsis.length).toBeGreaterThan(0);
		});

		it('should show ellipsis when current page is far from end', () => {
			render(<Pagination currentPage={5} totalPages={20} onPageChange={() => {}} maxVisiblePages={5} />);

			// Should show pages 3-4-5-6-7
			expect(screen.getByText('3')).toBeInTheDocument();
			expect(screen.getByText('5')).toBeInTheDocument();
			expect(screen.getByText('7')).toBeInTheDocument();
			const ellipsis = screen.getAllByText('...');
			expect(ellipsis.length).toBeGreaterThan(0);
		});
	});

	describe('Button States', () => {
		it('should disable Previous and First buttons on first page', () => {
			render(<Pagination currentPage={1} totalPages={10} onPageChange={() => {}} />);

			const previousButton = screen.getByLabelText('Go to previous page');
			const firstButton = screen.getByLabelText('Go to first page');

			expect(previousButton).toBeDisabled();
			expect(firstButton).toBeDisabled();
		});

		it('should disable Next and Last buttons on last page', () => {
			render(<Pagination currentPage={10} totalPages={10} onPageChange={() => {}} />);

			const nextButton = screen.getByLabelText('Go to next page');
			const lastButton = screen.getByLabelText('Go to last page');

			expect(nextButton).toBeDisabled();
			expect(lastButton).toBeDisabled();
		});

		it('should enable Previous and First buttons when not on first page', () => {
			render(<Pagination currentPage={5} totalPages={10} onPageChange={() => {}} />);

			const previousButton = screen.getByLabelText('Go to previous page');
			const firstButton = screen.getByLabelText('Go to first page');

			expect(previousButton).not.toBeDisabled();
			expect(firstButton).not.toBeDisabled();
		});

		it('should enable Next and Last buttons when not on last page', () => {
			render(<Pagination currentPage={5} totalPages={10} onPageChange={() => {}} />);

			const nextButton = screen.getByLabelText('Go to next page');
			const lastButton = screen.getByLabelText('Go to last page');

			expect(nextButton).not.toBeDisabled();
			expect(lastButton).not.toBeDisabled();
		});

		it('should disable all buttons when disabled prop is true', () => {
			render(<Pagination currentPage={5} totalPages={10} onPageChange={() => {}} disabled />);

			const buttons = screen.getAllByRole('button');
			buttons.forEach(button => {
				expect(button).toBeDisabled();
			});
		});

		it('should highlight current page button', () => {
			render(<Pagination currentPage={3} totalPages={10} onPageChange={() => {}} />);

			const currentPageButton = screen.getByLabelText('Go to page 3');
			expect(currentPageButton).toHaveAttribute('aria-current', 'page');
		});
	});

	describe('User Interactions', () => {
		it('should call onPageChange when clicking a page number', async () => {
			const user = userEvent.setup();
			const onPageChange = vi.fn();

			render(<Pagination currentPage={1} totalPages={10} onPageChange={onPageChange} />);

			const pageButton = screen.getByLabelText('Go to page 2');
			await user.click(pageButton);

			expect(onPageChange).toHaveBeenCalledWith(2);
		});

		it('should call onPageChange with next page when clicking Next', async () => {
			const user = userEvent.setup();
			const onPageChange = vi.fn();

			render(<Pagination currentPage={3} totalPages={10} onPageChange={onPageChange} />);

			const nextButton = screen.getByLabelText('Go to next page');
			await user.click(nextButton);

			expect(onPageChange).toHaveBeenCalledWith(4);
		});

		it('should call onPageChange with previous page when clicking Previous', async () => {
			const user = userEvent.setup();
			const onPageChange = vi.fn();

			render(<Pagination currentPage={3} totalPages={10} onPageChange={onPageChange} />);

			const previousButton = screen.getByLabelText('Go to previous page');
			await user.click(previousButton);

			expect(onPageChange).toHaveBeenCalledWith(2);
		});

		it('should call onPageChange with 1 when clicking First', async () => {
			const user = userEvent.setup();
			const onPageChange = vi.fn();

			render(<Pagination currentPage={5} totalPages={10} onPageChange={onPageChange} />);

			const firstButton = screen.getByLabelText('Go to first page');
			await user.click(firstButton);

			expect(onPageChange).toHaveBeenCalledWith(1);
		});

		it('should call onPageChange with totalPages when clicking Last', async () => {
			const user = userEvent.setup();
			const onPageChange = vi.fn();

			render(<Pagination currentPage={5} totalPages={10} onPageChange={onPageChange} />);

			const lastButton = screen.getByLabelText('Go to last page');
			await user.click(lastButton);

			expect(onPageChange).toHaveBeenCalledWith(10);
		});

		it('should not call onPageChange when clicking disabled buttons', async () => {
			const user = userEvent.setup();
			const onPageChange = vi.fn();

			render(<Pagination currentPage={1} totalPages={10} onPageChange={onPageChange} />);

			const previousButton = screen.getByLabelText('Go to previous page');
			await user.click(previousButton);

			expect(onPageChange).not.toHaveBeenCalled();
		});
	});

	describe('Accessibility', () => {
		it('should have proper ARIA labels', () => {
			render(<Pagination currentPage={5} totalPages={10} onPageChange={() => {}} />);

			expect(screen.getByLabelText('Go to first page')).toBeInTheDocument();
			expect(screen.getByLabelText('Go to previous page')).toBeInTheDocument();
			expect(screen.getByLabelText('Go to next page')).toBeInTheDocument();
			expect(screen.getByLabelText('Go to last page')).toBeInTheDocument();
			expect(screen.getByLabelText('Go to page 5')).toBeInTheDocument();
		});

		it('should have navigation role', () => {
			const { container } = render(<Pagination currentPage={1} totalPages={5} onPageChange={() => {}} />);

			const nav = container.querySelector('nav');
			expect(nav).toHaveAttribute('role', 'navigation');
			expect(nav).toHaveAttribute('aria-label', 'Pagination');
		});

		it('should mark current page with aria-current', () => {
			render(<Pagination currentPage={3} totalPages={10} onPageChange={() => {}} />);

			const currentPageButton = screen.getByLabelText('Go to page 3');
			expect(currentPageButton).toHaveAttribute('aria-current', 'page');

			const otherPageButton = screen.getByLabelText('Go to page 5');
			expect(otherPageButton).not.toHaveAttribute('aria-current');
		});

		it('should hide ellipsis from screen readers', () => {
			render(<Pagination currentPage={10} totalPages={20} onPageChange={() => {}} maxVisiblePages={5} />);

			const ellipsis = screen.getAllByText('...');
			ellipsis.forEach(el => {
				expect(el).toHaveAttribute('aria-hidden', 'true');
			});
		});
	});

	describe('Custom Styling', () => {
		it('should apply custom className', () => {
			const { container } = render(
				<Pagination
					currentPage={1}
					totalPages={5}
					onPageChange={() => {}}
					className={`
      custom-pagination
    `}
				/>
			);

			const nav = container.querySelector('nav');
			expect(nav).toHaveClass('custom-pagination');
		});
	});
});
