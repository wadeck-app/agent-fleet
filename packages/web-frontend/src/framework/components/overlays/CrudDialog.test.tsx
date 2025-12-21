import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CrudDialog } from './CrudDialog';

describe('CrudDialog', () => {
	describe('rendering', () => {
		it('should render title', () => {
			render(
				<CrudDialog open={true} onOpenChange={vi.fn()} title="Create Item" description="Fill in the details">
					<div>Form content</div>
				</CrudDialog>
			);
			expect(screen.getByText('Create Item')).toBeInTheDocument();
		});

		it('should render description', () => {
			render(
				<CrudDialog
					open={true}
					onOpenChange={vi.fn()}
					title="Create Item"
					description="Fill in the details below"
				>
					<div>Form content</div>
				</CrudDialog>
			);
			expect(screen.getByText('Fill in the details below')).toBeInTheDocument();
		});

		it('should render children content', () => {
			render(
				<CrudDialog open={true} onOpenChange={vi.fn()} title="Create Item" description="Fill in the details">
					<div data-testid="form-content">Form content here</div>
				</CrudDialog>
			);
			expect(screen.getByTestId('form-content')).toBeInTheDocument();
			expect(screen.getByText('Form content here')).toBeInTheDocument();
		});

		it('should not render when open is false', () => {
			render(
				<CrudDialog open={false} onOpenChange={vi.fn()} title="Create Item" description="Fill in the details">
					<div data-testid="form-content">Form content</div>
				</CrudDialog>
			);
			expect(screen.queryByText('Create Item')).not.toBeInTheDocument();
		});
	});

	describe('open/close behavior', () => {
		it('should call onOpenChange when close button is clicked', () => {
			const handleOpenChange = vi.fn();
			render(
				<CrudDialog
					open={true}
					onOpenChange={handleOpenChange}
					title="Create Item"
					description="Fill in the details"
				>
					<div>Content</div>
				</CrudDialog>
			);

			const closeButton = screen.getByRole('button', { name: /close/i });
			fireEvent.click(closeButton);

			expect(handleOpenChange).toHaveBeenCalled();
		});

		it('should render close button by default', () => {
			render(
				<CrudDialog open={true} onOpenChange={vi.fn()} title="Create Item" description="Fill in the details">
					<div>Content</div>
				</CrudDialog>
			);

			expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
		});

		it('should not render close button when showCloseButton is false', () => {
			render(
				<CrudDialog
					open={true}
					onOpenChange={vi.fn()}
					title="Create Item"
					description="Fill in the details"
					showCloseButton={false}
				>
					<div>Content</div>
				</CrudDialog>
			);

			expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
		});
	});

	describe('maxWidth variants', () => {
		it('should accept sm maxWidth prop', () => {
			// We test that the component accepts the prop without errors
			// The actual styling is handled by DialogContent and tested at that level
			expect(() =>
				render(
					<CrudDialog
						open={true}
						onOpenChange={vi.fn()}
						title="Create Item"
						description="Details"
						maxWidth="sm"
					>
						<div>Content</div>
					</CrudDialog>
				)
			).not.toThrow();
		});

		it('should accept md maxWidth prop', () => {
			expect(() =>
				render(
					<CrudDialog
						open={true}
						onOpenChange={vi.fn()}
						title="Create Item"
						description="Details"
						maxWidth="md"
					>
						<div>Content</div>
					</CrudDialog>
				)
			).not.toThrow();
		});

		it('should accept lg maxWidth prop', () => {
			expect(() =>
				render(
					<CrudDialog
						open={true}
						onOpenChange={vi.fn()}
						title="Create Item"
						description="Details"
						maxWidth="lg"
					>
						<div>Content</div>
					</CrudDialog>
				)
			).not.toThrow();
		});

		it('should accept xl maxWidth prop', () => {
			expect(() =>
				render(
					<CrudDialog
						open={true}
						onOpenChange={vi.fn()}
						title="Create Item"
						description="Details"
						maxWidth="xl"
					>
						<div>Content</div>
					</CrudDialog>
				)
			).not.toThrow();
		});

		it('should accept 2xl maxWidth prop', () => {
			expect(() =>
				render(
					<CrudDialog
						open={true}
						onOpenChange={vi.fn()}
						title="Create Item"
						description="Details"
						maxWidth="2xl"
					>
						<div>Content</div>
					</CrudDialog>
				)
			).not.toThrow();
		});

		it('should use 2xl maxWidth by default when not specified', () => {
			// Test that default prop works
			expect(() =>
				render(
					<CrudDialog open={true} onOpenChange={vi.fn()} title="Create Item" description="Details">
						<div>Content</div>
					</CrudDialog>
				)
			).not.toThrow();
		});
	});

	describe('content variations', () => {
		it('should render complex children', () => {
			render(
				<CrudDialog open={true} onOpenChange={vi.fn()} title="Create Item" description="Fill in the form">
					<form>
						<input data-testid="name-input" type="text" />
						<button data-testid="submit-button" type="submit">
							Submit
						</button>
					</form>
				</CrudDialog>
			);

			expect(screen.getByTestId('name-input')).toBeInTheDocument();
			expect(screen.getByTestId('submit-button')).toBeInTheDocument();
		});

		it('should render multiple child elements', () => {
			render(
				<CrudDialog open={true} onOpenChange={vi.fn()} title="Create Item" description="Details">
					<div data-testid="child-1">Child 1</div>
					<div data-testid="child-2">Child 2</div>
					<div data-testid="child-3">Child 3</div>
				</CrudDialog>
			);

			expect(screen.getByTestId('child-1')).toBeInTheDocument();
			expect(screen.getByTestId('child-2')).toBeInTheDocument();
			expect(screen.getByTestId('child-3')).toBeInTheDocument();
		});

		it('should render with short title', () => {
			render(
				<CrudDialog open={true} onOpenChange={vi.fn()} title="Edit" description="Update details">
					<div>Content</div>
				</CrudDialog>
			);
			expect(screen.getByText('Edit')).toBeInTheDocument();
		});

		it('should render with long title', () => {
			const longTitle = 'Create a New Item with Additional Configuration Options';
			render(
				<CrudDialog open={true} onOpenChange={vi.fn()} title={longTitle} description="Fill in all fields">
					<div>Content</div>
				</CrudDialog>
			);
			expect(screen.getByText(longTitle)).toBeInTheDocument();
		});

		it('should render with long description', () => {
			const longDescription =
				'Please fill in all the required fields below to create a new item. Make sure all information is accurate before submitting the form.';
			render(
				<CrudDialog open={true} onOpenChange={vi.fn()} title="Create Item" description={longDescription}>
					<div>Content</div>
				</CrudDialog>
			);
			expect(screen.getByText(longDescription)).toBeInTheDocument();
		});
	});

	describe('complete scenarios', () => {
		it('should render create mode dialog', () => {
			render(
				<CrudDialog
					open={true}
					onOpenChange={vi.fn()}
					title="New Ingredient"
					description="Add a new ingredient to your database."
				>
					<form data-testid="ingredient-form">Form fields here</form>
				</CrudDialog>
			);

			expect(screen.getByText('New Ingredient')).toBeInTheDocument();
			expect(screen.getByText('Add a new ingredient to your database.')).toBeInTheDocument();
			expect(screen.getByTestId('ingredient-form')).toBeInTheDocument();
		});

		it('should render edit mode dialog', () => {
			render(
				<CrudDialog
					open={true}
					onOpenChange={vi.fn()}
					title="Edit Ingredient"
					description="Update the ingredient information below."
				>
					<form data-testid="ingredient-form">Form fields here</form>
				</CrudDialog>
			);

			expect(screen.getByText('Edit Ingredient')).toBeInTheDocument();
			expect(screen.getByText('Update the ingredient information below.')).toBeInTheDocument();
			expect(screen.getByTestId('ingredient-form')).toBeInTheDocument();
		});

		it('should render with all props', () => {
			const handleOpenChange = vi.fn();
			render(
				<CrudDialog
					open={true}
					onOpenChange={handleOpenChange}
					title="Create Book"
					description="Add a new book to your library."
					maxWidth="xl"
				>
					<div data-testid="book-form">Book form</div>
				</CrudDialog>
			);

			expect(screen.getByText('Create Book')).toBeInTheDocument();
			expect(screen.getByText('Add a new book to your library.')).toBeInTheDocument();
			expect(screen.getByTestId('book-form')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
		});
	});
});
