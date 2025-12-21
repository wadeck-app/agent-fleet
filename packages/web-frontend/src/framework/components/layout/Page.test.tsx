import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Page } from './Page';

describe('Page', () => {
	it('should render children', () => {
		const { getByText } = render(
			<Page>
				<div>Test content</div>
			</Page>
		);

		expect(getByText('Test content')).toBeInTheDocument();
	});

	it('should apply default container classes', () => {
		const { container } = render(
			<Page>
				<div>Content</div>
			</Page>
		);

		const pageDiv = container.firstChild as HTMLElement;
		expect(pageDiv).toHaveClass('container');
		expect(pageDiv).toHaveClass('mx-auto');
		expect(pageDiv).toHaveClass('max-w-7xl');
		expect(pageDiv).toHaveClass('p-6');
	});

	it('should accept additional className', () => {
		const { container } = render(
			<Page className="custom-class">
				<div>Content</div>
			</Page>
		);

		const pageDiv = container.firstChild as HTMLElement;
		expect(pageDiv).toHaveClass('container');
		expect(pageDiv).toHaveClass('custom-class');
	});

	it('should render multiple children', () => {
		const { getByText } = render(
			<Page>
				<div>First child</div>
				<div>Second child</div>
			</Page>
		);

		expect(getByText('First child')).toBeInTheDocument();
		expect(getByText('Second child')).toBeInTheDocument();
	});
});
