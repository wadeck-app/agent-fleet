import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { type ColumnDef, ColumnVisibility } from './ColumnVisibility';

describe('ColumnVisibility', () => {
	const columns: ColumnDef[] = [
		{ id: 'id', label: 'ID', canHide: false },
		{ id: 'name', label: 'Name' },
		{ id: 'email', label: 'Email' },
		{ id: 'phone', label: 'Phone' },
	];

	const defaultProps = {
		columns,
		visibleColumns: new Set(['id', 'name', 'email', 'phone']),
		onToggle: vi.fn(),
		onReset: vi.fn(),
		onShowAll: vi.fn(),
		onHideAll: vi.fn(),
	};

	describe('Rendering', () => {
		it('should render trigger button with default label', () => {
			render(<ColumnVisibility {...defaultProps} />);

			expect(screen.getByRole('button', { name: /toggle column visibility/i })).toBeInTheDocument();
			expect(screen.getByText('Columns')).toBeInTheDocument();
		});

		it('should render trigger button with custom label', () => {
			render(<ColumnVisibility {...defaultProps} label="Manage Columns" />);

			expect(screen.getByText('Manage Columns')).toBeInTheDocument();
		});

		it('should show count badge when visibility differs from default', () => {
			const visibleColumns = new Set(['id', 'name']);
			const defaultVisible = new Set(['id', 'name', 'email', 'phone']);

			render(
				<ColumnVisibility {...defaultProps} visibleColumns={visibleColumns} defaultVisible={defaultVisible} />
			);

			expect(screen.getByText('2/4')).toBeInTheDocument();
		});

		it('should not show count badge when visibility matches default', () => {
			const visibleColumns = new Set(['id', 'name', 'email']);
			const defaultVisible = new Set(['id', 'name', 'email']);

			render(
				<ColumnVisibility {...defaultProps} visibleColumns={visibleColumns} defaultVisible={defaultVisible} />
			);

			expect(screen.queryByText('3/4')).not.toBeInTheDocument();
		});

		it('should show badge when all columns visible but default is subset', () => {
			const visibleColumns = new Set(['id', 'name', 'email', 'phone']);
			const defaultVisible = new Set(['id', 'name']);

			render(
				<ColumnVisibility {...defaultProps} visibleColumns={visibleColumns} defaultVisible={defaultVisible} />
			);

			expect(screen.getByText('4/4')).toBeInTheDocument();
		});
	});

	describe('Dropdown content', () => {
		it('should render all column checkboxes', async () => {
			const user = userEvent.setup();
			render(<ColumnVisibility {...defaultProps} />);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			expect(screen.getByText('ID')).toBeInTheDocument();
			expect(screen.getByText('Name')).toBeInTheDocument();
			expect(screen.getByText('Email')).toBeInTheDocument();
			expect(screen.getByText('Phone')).toBeInTheDocument();
		});

		it('should check visible columns', async () => {
			const user = userEvent.setup();
			const visibleColumns = new Set(['id', 'name']);

			render(<ColumnVisibility {...defaultProps} visibleColumns={visibleColumns} />);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			// Get checkboxes by their role within the label
			const checkboxes = screen.getAllByRole('checkbox');
			expect(checkboxes[0]).toBeChecked(); // ID
			expect(checkboxes[1]).toBeChecked(); // Name
			expect(checkboxes[2]).not.toBeChecked(); // Email
		});

		it('should render Show All and Hide All buttons when callbacks provided', async () => {
			const user = userEvent.setup();
			render(<ColumnVisibility {...defaultProps} />);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			expect(screen.getByRole('button', { name: /show all/i })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: /hide all/i })).toBeInTheDocument();
		});

		it('should not render Show All button when callback not provided', async () => {
			const user = userEvent.setup();
			const props = { ...defaultProps, onShowAll: undefined };
			render(<ColumnVisibility {...props} />);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			expect(screen.queryByRole('button', { name: /show all/i })).not.toBeInTheDocument();
		});

		it('should render Reset to Default button', async () => {
			const user = userEvent.setup();
			render(<ColumnVisibility {...defaultProps} />);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			expect(screen.getByRole('button', { name: /reset to default/i })).toBeInTheDocument();
		});
	});

	describe('Interactions', () => {
		it('should call onToggle when checkbox is clicked', async () => {
			const user = userEvent.setup();
			const onToggle = vi.fn();

			render(<ColumnVisibility {...defaultProps} onToggle={onToggle} />);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			const checkboxes = screen.getAllByRole('checkbox');
			const emailCheckbox = checkboxes[2]!; // Email is 3rd column
			await user.click(emailCheckbox);

			expect(onToggle).toHaveBeenCalledWith('email');
		});

		it('should not call onToggle for columns with canHide=false', async () => {
			const user = userEvent.setup();
			const onToggle = vi.fn();

			render(<ColumnVisibility {...defaultProps} onToggle={onToggle} />);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			const checkboxes = screen.getAllByRole('checkbox');
			const idCheckbox = checkboxes[0]!; // ID is 1st column
			await user.click(idCheckbox);

			expect(onToggle).not.toHaveBeenCalled();
		});

		it('should disable checkbox for columns with canHide=false', async () => {
			const user = userEvent.setup();
			render(<ColumnVisibility {...defaultProps} />);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			const checkboxes = screen.getAllByRole('checkbox');
			const idCheckbox = checkboxes[0]; // ID is 1st column
			expect(idCheckbox).toBeDisabled();
		});

		it('should call onShowAll when Show All button is clicked', async () => {
			const user = userEvent.setup();
			const onShowAll = vi.fn();

			render(<ColumnVisibility {...defaultProps} onShowAll={onShowAll} />);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			const showAllButton = screen.getByRole('button', { name: /show all/i });
			await user.click(showAllButton);

			expect(onShowAll).toHaveBeenCalled();
		});

		it('should call onHideAll when Hide All button is clicked', async () => {
			const user = userEvent.setup();
			const onHideAll = vi.fn();

			render(<ColumnVisibility {...defaultProps} onHideAll={onHideAll} />);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			const hideAllButton = screen.getByRole('button', { name: /hide all/i });
			await user.click(hideAllButton);

			expect(onHideAll).toHaveBeenCalled();
		});

		it('should call onReset when Reset button is clicked', async () => {
			const user = userEvent.setup();
			const onReset = vi.fn();

			render(<ColumnVisibility {...defaultProps} onReset={onReset} />);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			const resetButton = screen.getByRole('button', { name: /reset to default/i });
			await user.click(resetButton);

			expect(onReset).toHaveBeenCalled();
		});
	});

	describe('Accessibility', () => {
		it('should have proper aria-label on trigger button', () => {
			render(<ColumnVisibility {...defaultProps} />);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			expect(button).toBeInTheDocument();
		});

		it('should render accessible checkboxes for all columns', async () => {
			const user = userEvent.setup();
			render(<ColumnVisibility {...defaultProps} />);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			const checkboxes = screen.getAllByRole('checkbox');
			expect(checkboxes).toHaveLength(columns.length);
		});

		it('should show tooltip for disabled columns', async () => {
			const user = userEvent.setup();
			render(<ColumnVisibility {...defaultProps} />);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			const idLabel = screen.getByText('ID').closest('label');
			expect(idLabel).toHaveAttribute('title', 'This column cannot be hidden');
		});
	});

	describe('Modified State Indicators', () => {
		const defaultVisible = new Set(['id', 'name', 'email']);

		it('should show modified indicator for columns hidden from default', async () => {
			const user = userEvent.setup();
			const visibleColumns = new Set(['id', 'name']); // email hidden

			render(
				<ColumnVisibility {...defaultProps} visibleColumns={visibleColumns} defaultVisible={defaultVisible} />
			);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			// Email should have modified indicator
			const modifiedIndicator = screen.getByLabelText('Modified from default');
			expect(modifiedIndicator).toBeInTheDocument();
		});

		it('should show modified indicator for columns shown beyond default', async () => {
			const user = userEvent.setup();
			const visibleColumns = new Set(['id', 'name', 'email', 'phone']); // phone added

			render(
				<ColumnVisibility {...defaultProps} visibleColumns={visibleColumns} defaultVisible={defaultVisible} />
			);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			// Phone should have modified indicator
			const modifiedIndicator = screen.getByLabelText('Modified from default');
			expect(modifiedIndicator).toBeInTheDocument();
		});

		it('should not show modified indicator for columns matching default', async () => {
			const user = userEvent.setup();
			const visibleColumns = new Set(['id', 'name', 'email']);

			render(
				<ColumnVisibility {...defaultProps} visibleColumns={visibleColumns} defaultVisible={defaultVisible} />
			);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			// No column should have modified indicator
			expect(screen.queryByLabelText('Modified from default')).not.toBeInTheDocument();
		});

		it('should render per-column reset button for modified columns', async () => {
			const user = userEvent.setup();
			const visibleColumns = new Set(['id', 'name']); // email hidden

			render(
				<ColumnVisibility {...defaultProps} visibleColumns={visibleColumns} defaultVisible={defaultVisible} />
			);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			// Should have reset button for email
			const resetButton = screen.getByRole('button', { name: /reset email to default/i });
			expect(resetButton).toBeInTheDocument();
		});

		it('should not render reset button for columns matching default', async () => {
			const user = userEvent.setup();
			const visibleColumns = new Set(['id', 'name', 'email']);

			render(
				<ColumnVisibility {...defaultProps} visibleColumns={visibleColumns} defaultVisible={defaultVisible} />
			);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			// Should not have any reset buttons for individual columns
			expect(screen.queryByRole('button', { name: /reset id to default/i })).not.toBeInTheDocument();
			expect(screen.queryByRole('button', { name: /reset name to default/i })).not.toBeInTheDocument();
			expect(screen.queryByRole('button', { name: /reset email to default/i })).not.toBeInTheDocument();
		});

		it('should call onToggle when per-column reset is clicked', async () => {
			const user = userEvent.setup();
			const onToggle = vi.fn();
			const visibleColumns = new Set(['id', 'name']); // email hidden

			render(
				<ColumnVisibility
					{...defaultProps}
					visibleColumns={visibleColumns}
					defaultVisible={defaultVisible}
					onToggle={onToggle}
				/>
			);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			const resetButton = screen.getByRole('button', { name: /reset email to default/i });
			await user.click(resetButton);

			expect(onToggle).toHaveBeenCalledWith('email');
		});

		it('should reset hidden column to visible when reset button clicked', async () => {
			const user = userEvent.setup();
			const onToggle = vi.fn();
			const visibleColumns = new Set(['id', 'name']); // email hidden (default visible)

			render(
				<ColumnVisibility
					{...defaultProps}
					visibleColumns={visibleColumns}
					defaultVisible={defaultVisible}
					onToggle={onToggle}
				/>
			);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			const resetButton = screen.getByRole('button', { name: /reset email to default/i });
			await user.click(resetButton);

			// Should toggle email back to visible
			expect(onToggle).toHaveBeenCalledWith('email');
		});

		it('should reset visible column to hidden when reset button clicked', async () => {
			const user = userEvent.setup();
			const onToggle = vi.fn();
			const visibleColumns = new Set(['id', 'name', 'email', 'phone']); // phone visible (default hidden)

			render(
				<ColumnVisibility
					{...defaultProps}
					visibleColumns={visibleColumns}
					defaultVisible={defaultVisible}
					onToggle={onToggle}
				/>
			);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			const resetButton = screen.getByRole('button', { name: /reset phone to default/i });
			await user.click(resetButton);

			// Should toggle phone back to hidden
			expect(onToggle).toHaveBeenCalledWith('phone');
		});

		it('should not show indicators when defaultVisible is undefined', async () => {
			const user = userEvent.setup();
			const visibleColumns = new Set(['id', 'name']);

			render(<ColumnVisibility {...defaultProps} visibleColumns={visibleColumns} defaultVisible={undefined} />);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			// No modified indicators should be present
			expect(screen.queryByLabelText('Modified from default')).not.toBeInTheDocument();
			expect(screen.queryByRole('button', { name: /reset .* to default/i })).not.toBeInTheDocument();
		});

		it('should not prevent checkbox interaction when reset button is present', async () => {
			const user = userEvent.setup();
			const onToggle = vi.fn();
			const visibleColumns = new Set(['id', 'name']); // email hidden

			render(
				<ColumnVisibility
					{...defaultProps}
					visibleColumns={visibleColumns}
					defaultVisible={defaultVisible}
					onToggle={onToggle}
				/>
			);

			const button = screen.getByRole('button', { name: /toggle column visibility/i });
			await user.click(button);

			// Click checkbox directly (not reset button)
			const checkboxes = screen.getAllByRole('checkbox');
			const emailCheckbox = checkboxes[2]!; // Email checkbox
			await user.click(emailCheckbox);

			expect(onToggle).toHaveBeenCalledWith('email');
		});
	});
});
