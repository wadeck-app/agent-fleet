import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoadingDots } from './LoadingDots';

describe('LoadingDots', () => {
	it('should render with medium size by default', () => {
		const { container } = render(<LoadingDots />);
		const dots = container.querySelectorAll('span[class*="animate-typing-dot"]');
		expect(dots).toHaveLength(3);
		expect(dots[0]).toHaveClass('w-2.5', 'h-2.5');
	});

	it('should render with small size', () => {
		const { container } = render(<LoadingDots size="small" />);
		const dots = container.querySelectorAll('span[class*="animate-typing-dot"]');
		expect(dots[0]).toHaveClass('w-1.5', 'h-1.5');
	});

	it('should render with large size', () => {
		const { container } = render(<LoadingDots size="large" />);
		const dots = container.querySelectorAll('span[class*="animate-typing-dot"]');
		expect(dots[0]).toHaveClass('w-4', 'h-4');
	});

	it('should apply custom className', () => {
		const { container } = render(<LoadingDots className="custom-class" />);
		const wrapper = container.firstChild as HTMLElement;
		expect(wrapper).toHaveClass('custom-class');
	});

	it('should render three dots', () => {
		const { container } = render(<LoadingDots />);
		const dots = container.querySelectorAll('span[class*="animate-typing-dot"]');
		expect(dots).toHaveLength(3);
	});

	it('should have staggered animation delays', () => {
		const { container } = render(<LoadingDots />);
		const dots = container.querySelectorAll('span[class*="animate-typing-dot"]');

		expect(dots[0]).toHaveClass('[animation-delay:0s]');
		expect(dots[1]).toHaveClass('[animation-delay:0.2s]');
		expect(dots[2]).toHaveClass('[animation-delay:0.4s]');
	});
});
