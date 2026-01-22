import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
	it('should render title', () => {
		const { getByRole } = render(<PageHeader title="Test Page" />);

		const heading = getByRole('heading', { level: 1 });
		expect(heading).toHaveTextContent('Test Page');
	});

	it('should apply default layout classes', () => {
		const { container } = render(<PageHeader title="Test Page" />);

		const headerDiv = container.firstChild as HTMLElement;
		expect(headerDiv).toHaveClass('mb-6');
		expect(headerDiv).toHaveClass('flex');
		expect(headerDiv).toHaveClass('items-center');
		expect(headerDiv).toHaveClass('justify-between');
	});

	it('should render badge when provided', () => {
		const { getByText } = render(<PageHeader title="Books" badge={42} />);

		expect(getByText('(42)')).toBeInTheDocument();
		expect(getByText('(42)')).toHaveClass('text-muted-foreground');
	});

	it('should render badge with string value', () => {
		const { getByText } = render(<PageHeader title="Items" badge="1000+" />);

		expect(getByText('(1000+)')).toBeInTheDocument();
	});

	it('should not render badge when not provided', () => {
		const { container } = render(<PageHeader title="Test Page" />);

		const badge = container.querySelector('.text-muted-foreground');
		expect(badge).not.toBeInTheDocument();
	});

	it('should render badge with value 0', () => {
		const { getByText } = render(<PageHeader title="Empty" badge={0} />);

		expect(getByText('(0)')).toBeInTheDocument();
	});

	it('should render action when provided', () => {
		const { getByRole } = render(<PageHeader title="Test Page" action={<button>Add Item</button>} />);

		expect(getByRole('button', { name: 'Add Item' })).toBeInTheDocument();
	});

	it('should render multiple actions', () => {
		const { getByRole } = render(
			<PageHeader
				title="Test Page"
				action={
					<>
						<button>Edit</button>
						<button>Delete</button>
					</>
				}
			/>
		);

		expect(getByRole('button', { name: 'Edit' })).toBeInTheDocument();
		expect(getByRole('button', { name: 'Delete' })).toBeInTheDocument();
	});

	it('should not render action wrapper when action not provided', () => {
		const { container } = render(<PageHeader title="Test Page" />);

		// Check that the title wrapper is the only child
		const headerDiv = container.firstChild as HTMLElement;
		expect(headerDiv.children).toHaveLength(1);
	});

	it('should accept additional className', () => {
		const { container } = render(
			<PageHeader
				title="Test Page"
				className={`
    custom-header
  `}
			/>
		);

		const headerDiv = container.firstChild as HTMLElement;
		expect(headerDiv).toHaveClass('mb-6');
		expect(headerDiv).toHaveClass('custom-header');
	});

	it('should render complete example with all props', () => {
		const { getByRole, getByText, container } = render(
			<PageHeader
				title="Books"
				badge={150}
				action={<button>Add Book</button>}
				className={`
     border-b
   `}
			/>
		);

		expect(getByRole('heading', { level: 1 })).toHaveTextContent('Books');
		expect(getByText('(150)')).toBeInTheDocument();
		expect(getByRole('button', { name: 'Add Book' })).toBeInTheDocument();

		const headerDiv = container.firstChild as HTMLElement;
		expect(headerDiv).toHaveClass('border-b');
	});
});
