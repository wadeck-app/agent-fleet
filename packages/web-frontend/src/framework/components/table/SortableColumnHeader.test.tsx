import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SortableColumnHeader } from './SortableColumnHeader';

describe('SortableColumnHeader', () => {
	const mockOnClick = vi.fn();

	beforeEach(() => {
		mockOnClick.mockClear();
	});

	it('should render label', () => {
		render(<SortableColumnHeader label="Name" sortDirection={null} onClick={mockOnClick} />);

		expect(screen.getByText('Name')).toBeInTheDocument();
	});

	it('should call onClick with event when clicked', async () => {
		const user = userEvent.setup();

		render(<SortableColumnHeader label="Name" sortDirection={null} onClick={mockOnClick} />);

		await user.click(screen.getByRole('button'));

		expect(mockOnClick).toHaveBeenCalledTimes(1);
		expect(mockOnClick).toHaveBeenCalledWith(expect.any(Object));
	});

	it('should show ArrowUp icon when sorted asc', () => {
		render(<SortableColumnHeader label="Name" sortDirection="asc" onClick={mockOnClick} />);

		// lucide-react icons render as SVGs
		const button = screen.getByRole('button');
		const svg = button.querySelector('svg');
		expect(svg).toBeInTheDocument();
	});

	it('should show ArrowDown icon when sorted desc', () => {
		render(<SortableColumnHeader label="Name" sortDirection="desc" onClick={mockOnClick} />);

		const button = screen.getByRole('button');
		const svg = button.querySelector('svg');
		expect(svg).toBeInTheDocument();
	});

	it('should show ChevronsUpDown icon when not sorted', () => {
		render(<SortableColumnHeader label="Name" sortDirection={null} onClick={mockOnClick} />);

		const button = screen.getByRole('button');
		const svg = button.querySelector('svg');
		expect(svg).toBeInTheDocument();
		// The unsorted icon should have opacity-30 class
		expect(svg).toHaveClass('opacity-30');
	});

	it('should have proper accessibility label without priority', () => {
		render(<SortableColumnHeader label="Name" sortDirection={null} onClick={mockOnClick} />);

		expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Sort by Name');
	});

	it('should have proper accessibility label with priority', () => {
		render(<SortableColumnHeader label="Name" sortDirection="asc" priority={2} onClick={mockOnClick} />);

		expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Sort by Name (priority 2)');
	});

	it('should apply custom className', () => {
		render(
			<SortableColumnHeader label="Name" sortDirection={null} onClick={mockOnClick} className={`custom-class`} />
		);

		expect(screen.getByRole('button')).toHaveClass('custom-class');
	});

	it('should display priority number when provided and greater than 1', () => {
		render(<SortableColumnHeader label="Name" sortDirection="asc" priority={2} onClick={mockOnClick} />);

		expect(screen.getByText('2')).toBeInTheDocument();
	});

	it('should not display priority number when null', () => {
		render(<SortableColumnHeader label="Name" sortDirection="asc" priority={null} onClick={mockOnClick} />);

		expect(screen.queryByText(/\d/)).not.toBeInTheDocument();
	});

	it('should display priority 1', () => {
		render(<SortableColumnHeader label="Name" sortDirection="asc" priority={1} onClick={mockOnClick} />);

		expect(screen.getByText('1')).toBeInTheDocument();
	});

	it('should have tooltip with multi-sort instructions when sorted', () => {
		render(<SortableColumnHeader label="Name" sortDirection="asc" priority={1} onClick={mockOnClick} />);

		const button = screen.getByRole('button');
		expect(button).toHaveAttribute('title', 'Sorted asc (priority 1). Shift+Click to add more sorts.');
	});

	it('should have tooltip with multi-sort instructions when not sorted', () => {
		render(<SortableColumnHeader label="Name" sortDirection={null} onClick={mockOnClick} />);

		const button = screen.getByRole('button');
		expect(button).toHaveAttribute('title', 'Click to sort. Shift+Click for multi-column sort.');
	});
});
