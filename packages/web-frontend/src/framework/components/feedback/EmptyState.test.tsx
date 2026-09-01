import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
	describe('rendering', () => {
		it('should render title', () => {
			render(<EmptyState title="No items found" />);
			expect(screen.getByText('No items found')).toBeInTheDocument();
		});

		it('should render description when provided', () => {
			render(<EmptyState title="No items" description="Get started by creating your first item" />);
			expect(screen.getByText('Get started by creating your first item')).toBeInTheDocument();
		});

		it('should not render description when not provided', () => {
			const { container } = render(<EmptyState title="No items" />);
			const description = container.querySelector('p.text-sm');
			expect(description).not.toBeInTheDocument();
		});
	});

	describe('icon', () => {
		it('should render icon when provided', () => {
			const icon = (
				// violations-suppress: react/no-inline-svg test fixture
				<svg data-testid="custom-icon">
					<circle cx="12" cy="12" r="10" />
				</svg>
			);
			render(<EmptyState title="No items" icon={icon} />);
			expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
		});

		it('should not render icon container when icon not provided', () => {
			const { container } = render(<EmptyState title="No items" />);
			const iconContainer = container.querySelector('.mb-4.text-muted-foreground');
			expect(iconContainer).not.toBeInTheDocument();
		});

		it('should style icon with muted color', () => {
			// violations-suppress: react/no-inline-svg test fixture
			const icon = <svg data-testid="custom-icon" />;
			const { container } = render(<EmptyState title="No items" icon={icon} />);
			const iconContainer = container.querySelector('.text-muted-foreground');
			expect(iconContainer).toBeInTheDocument();
		});
	});

	describe('action button', () => {
		it('should render action button when provided', () => {
			const action = {
				label: 'Add Item',
				onClick: vi.fn(),
			};
			render(<EmptyState title="No items" action={action} />);
			expect(screen.getByRole('button', { name: 'Add Item' })).toBeInTheDocument();
		});

		it('should not render action button when not provided', () => {
			render(<EmptyState title="No items" />);
			expect(screen.queryByRole('button')).not.toBeInTheDocument();
		});

		it('should call onClick when action button is clicked', () => {
			const handleClick = vi.fn();
			const action = {
				label: 'Add Item',
				onClick: handleClick,
			};
			render(<EmptyState title="No items" action={action} />);

			fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));

			expect(handleClick).toHaveBeenCalledOnce();
		});

		it('should style action button with primary colors', () => {
			const action = {
				label: 'Add Item',
				onClick: vi.fn(),
			};
			render(<EmptyState title="No items" action={action} />);
			const button = screen.getByRole('button');

			expect(button.className).toContain('bg-primary');
			expect(button.className).toContain('text-primary-foreground');
		});
	});

	describe('styling', () => {
		it('should center content', () => {
			const { container } = render(<EmptyState title="No items" />);
			const wrapper = container.firstChild as HTMLElement;

			expect(wrapper.className).toContain('flex');
			expect(wrapper.className).toContain('flex-col');
			expect(wrapper.className).toContain('items-center');
			expect(wrapper.className).toContain('justify-center');
			expect(wrapper.className).toContain('text-center');
		});

		it('should apply padding to container', () => {
			const { container } = render(<EmptyState title="No items" />);
			const wrapper = container.firstChild as HTMLElement;

			expect(wrapper.className).toContain('p-12');
		});

		it('should apply custom className', () => {
			const { container } = render(<EmptyState title="No items" className={`custom-class`} />);
			const wrapper = container.firstChild as HTMLElement;

			expect(wrapper.className).toContain('custom-class');
		});

		it('should style title as heading', () => {
			render(<EmptyState title="No items found" />);
			const title = screen.getByText('No items found');

			expect(title.tagName).toBe('H3');
			expect(title.className).toContain('text-lg');
			expect(title.className).toContain('font-semibold');
		});

		it('should style description with muted color', () => {
			render(<EmptyState title="No items" description="This is a description" />);
			const description = screen.getByText('This is a description');

			expect(description.className).toContain('text-muted-foreground');
		});

		it('should limit description width', () => {
			render(<EmptyState title="No items" description="Description" />);
			const description = screen.getByText('Description');

			expect(description.className).toContain('max-w-md');
		});
	});

	describe('layout spacing', () => {
		it('should space icon from title', () => {
			// violations-suppress: react/no-inline-svg test fixture
			const icon = <svg data-testid="custom-icon" />;
			const { container } = render(<EmptyState title="No items" icon={icon} />);
			const iconContainer = container.querySelector('.mb-4');

			expect(iconContainer).toBeInTheDocument();
		});

		it('should space title from description', () => {
			render(<EmptyState title="No items" description="Description" />);
			const title = screen.getByText('No items');

			expect(title.className).toContain('mb-2');
		});

		it('should space description from action button', () => {
			const action = {
				label: 'Add',
				onClick: vi.fn(),
			};
			render(<EmptyState title="No items" description="Description" action={action} />);
			const description = screen.getByText('Description');

			expect(description.className).toContain('mb-6');
		});
	});

	describe('complete scenarios', () => {
		it('should render with all props', () => {
			// violations-suppress: react/no-inline-svg test fixture
			const icon = <svg data-testid="custom-icon" />;
			const action = {
				label: 'Create New',
				onClick: vi.fn(),
			};

			render(
				<EmptyState
					title="No data available"
					description="Start by creating your first item"
					icon={icon}
					action={action}
					className="my-custom-class"
				/>
			);

			expect(screen.getByText('No data available')).toBeInTheDocument();
			expect(screen.getByText('Start by creating your first item')).toBeInTheDocument();
			expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Create New' })).toBeInTheDocument();
		});

		it('should render with minimal props', () => {
			render(<EmptyState title="Empty" />);

			expect(screen.getByText('Empty')).toBeInTheDocument();
			expect(screen.queryByRole('button')).not.toBeInTheDocument();
		});

		it('should handle multiple action clicks', () => {
			const handleClick = vi.fn();
			const action = {
				label: 'Add',
				onClick: handleClick,
			};

			render(<EmptyState title="No items" action={action} />);
			const button = screen.getByRole('button');

			fireEvent.click(button);
			fireEvent.click(button);
			fireEvent.click(button);

			expect(handleClick).toHaveBeenCalledTimes(3);
		});
	});

	describe('text variations', () => {
		it('should render short title', () => {
			render(<EmptyState title="Empty" />);
			expect(screen.getByText('Empty')).toBeInTheDocument();
		});

		it('should render long title', () => {
			const longTitle = 'No items have been added to this collection yet';
			render(<EmptyState title={longTitle} />);
			expect(screen.getByText(longTitle)).toBeInTheDocument();
		});

		it('should render long description', () => {
			const longDescription =
				'This is a very long description that explains in detail what the user should do next to get started with the application.';
			render(<EmptyState title="No items" description={longDescription} />);
			expect(screen.getByText(longDescription)).toBeInTheDocument();
		});
	});
});
