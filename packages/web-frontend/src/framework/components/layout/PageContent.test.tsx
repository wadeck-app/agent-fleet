import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageContent } from './PageContent';

describe('PageContent', () => {
	it('should render children', () => {
		const { getByText } = render(
			<PageContent>
				<div>Test content</div>
			</PageContent>
		);

		expect(getByText('Test content')).toBeInTheDocument();
	});

	it('should render as div element', () => {
		const { container } = render(
			<PageContent>
				<div>Content</div>
			</PageContent>
		);

		const contentDiv = container.firstChild as HTMLElement;
		expect(contentDiv.tagName).toBe('DIV');
	});

	it('should not apply any default classes when className not provided', () => {
		const { container } = render(
			<PageContent>
				<div>Content</div>
			</PageContent>
		);

		const contentDiv = container.firstChild as HTMLElement;
		// Should have no classes (empty string className results in no class attribute)
		expect(contentDiv.className).toBe('');
	});

	it('should accept custom className', () => {
		const { container } = render(
			<PageContent className="custom-content bg-muted">
				<div>Content</div>
			</PageContent>
		);

		const contentDiv = container.firstChild as HTMLElement;
		expect(contentDiv).toHaveClass('custom-content');
		expect(contentDiv).toHaveClass('bg-muted');
	});

	it('should render multiple children', () => {
		const { getByText } = render(
			<PageContent>
				<div>First child</div>
				<div>Second child</div>
				<div>Third child</div>
			</PageContent>
		);

		expect(getByText('First child')).toBeInTheDocument();
		expect(getByText('Second child')).toBeInTheDocument();
		expect(getByText('Third child')).toBeInTheDocument();
	});

	it('should render complex nested content', () => {
		const { getByRole, getByText } = render(
			<PageContent>
				<section>
					<h2>Section Title</h2>
					<p>Section content</p>
				</section>
			</PageContent>
		);

		expect(getByRole('heading', { level: 2 })).toHaveTextContent('Section Title');
		expect(getByText('Section content')).toBeInTheDocument();
	});
});
