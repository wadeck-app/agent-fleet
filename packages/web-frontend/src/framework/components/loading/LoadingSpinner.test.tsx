import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoadingSpinner } from './LoadingSpinner';

describe('LoadingSpinner', () => {
	describe('rendering', () => {
		it('should render with default message', () => {
			render(<LoadingSpinner />);
			expect(screen.getByText('Loading...')).toBeInTheDocument();
		});

		it('should render with custom message', () => {
			render(<LoadingSpinner message="Please wait" />);
			expect(screen.getByText('Please wait')).toBeInTheDocument();
		});

		it('should render without message when not provided', () => {
			render(<LoadingSpinner message="" />);
			expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
		});

		it('should render spinner element with status role', () => {
			render(<LoadingSpinner />);
			expect(screen.getByRole('status')).toBeInTheDocument();
		});
	});

	describe('sizes', () => {
		it('should apply medium size by default', () => {
			const { container } = render(<LoadingSpinner />);
			const spinner = container.querySelector('[role="status"]');

			expect(spinner?.className).toContain('size-8');
		});

		it('should apply small size', () => {
			const { container } = render(<LoadingSpinner size="sm" />);
			const spinner = container.querySelector('[role="status"]');

			expect(spinner?.className).toContain('size-4');
		});

		it('should apply large size', () => {
			const { container } = render(<LoadingSpinner size="lg" />);
			const spinner = container.querySelector('[role="status"]');

			expect(spinner?.className).toContain('size-12');
		});

		it('should adjust container padding based on size', () => {
			const { container: smallContainer } = render(<LoadingSpinner size="sm" />);
			const smallWrapper = smallContainer.firstChild as HTMLElement;
			expect(smallWrapper.className).toContain('p-2');

			const { container: mediumContainer } = render(<LoadingSpinner size="md" />);
			const mediumWrapper = mediumContainer.firstChild as HTMLElement;
			expect(mediumWrapper.className).toContain('p-5');

			const { container: largeContainer } = render(<LoadingSpinner size="lg" />);
			const largeWrapper = largeContainer.firstChild as HTMLElement;
			expect(largeWrapper.className).toContain('p-8');
		});
	});

	describe('styling', () => {
		it('should apply spin animation', () => {
			const { container } = render(<LoadingSpinner />);
			const spinner = container.querySelector('[role="status"]');

			expect(spinner?.className).toContain('animate-spin');
		});

		it('should apply primary color', () => {
			const { container } = render(<LoadingSpinner />);
			const spinner = container.querySelector('[role="status"]');

			expect(spinner?.className).toContain('border-primary');
		});

		it('should have transparent top border for spin effect', () => {
			const { container } = render(<LoadingSpinner />);
			const spinner = container.querySelector('[role="status"]');

			expect(spinner?.className).toContain('border-t-transparent');
		});

		it('should apply custom className', () => {
			const { container } = render(<LoadingSpinner className="custom-class" />);
			const wrapper = container.firstChild as HTMLElement;

			expect(wrapper.className).toContain('custom-class');
		});
	});

	describe('accessibility', () => {
		it('should have aria-label for screen readers', () => {
			render(<LoadingSpinner />);
			const spinner = screen.getByRole('status');

			expect(spinner).toHaveAttribute('aria-label', 'Loading');
		});

		it('should render status role for assistive technologies', () => {
			render(<LoadingSpinner />);
			expect(screen.getByRole('status')).toBeInTheDocument();
		});

		it('should display message for screen readers', () => {
			render(<LoadingSpinner message="Loading data..." />);
			expect(screen.getByText('Loading data...')).toBeInTheDocument();
		});
	});

	describe('layout', () => {
		it('should center spinner and message', () => {
			const { container } = render(<LoadingSpinner />);
			const wrapper = container.firstChild as HTMLElement;

			expect(wrapper.className).toContain('flex');
			expect(wrapper.className).toContain('flex-col');
			expect(wrapper.className).toContain('items-center');
			expect(wrapper.className).toContain('justify-center');
		});

		it('should space message below spinner', () => {
			render(<LoadingSpinner message="Loading..." />);
			const message = screen.getByText('Loading...');

			expect(message.className).toContain('mt-4');
		});
	});

	describe('message variations', () => {
		it('should render short messages', () => {
			render(<LoadingSpinner message="Wait" />);
			expect(screen.getByText('Wait')).toBeInTheDocument();
		});

		it('should render long messages', () => {
			const longMessage = 'Please wait while we load your data...';
			render(<LoadingSpinner message={longMessage} />);
			expect(screen.getByText(longMessage)).toBeInTheDocument();
		});

		it('should style message with muted color', () => {
			render(<LoadingSpinner message="Loading..." />);
			const message = screen.getByText('Loading...');

			expect(message.className).toContain('text-muted-foreground');
		});
	});

	describe('integration scenarios', () => {
		it('should work with all size and message combinations', () => {
			const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];
			const messages = ['Loading...', 'Please wait', ''];

			sizes.forEach(size => {
				messages.forEach(message => {
					const { container, unmount } = render(<LoadingSpinner size={size} message={message} />);
					const wrapper = container.firstChild as HTMLElement;
					expect(wrapper).toBeInTheDocument();
					unmount();
				});
			});
		});
	});
});
