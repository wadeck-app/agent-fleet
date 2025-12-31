import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoadingState } from './LoadingState';

describe('LoadingState', () => {
	describe('rendering', () => {
		it('should render loading dots', () => {
			const { container } = render(<LoadingState />);
			// LoadingDots renders 3 spans with animation
			const dots = container.querySelectorAll('.animate-typing-dot');
			expect(dots).toHaveLength(3);
		});

		it('should render default message when not provided', () => {
			render(<LoadingState />);
			expect(screen.getByText('Loading...')).toBeInTheDocument();
		});

		it('should render custom message when provided', () => {
			render(<LoadingState message="Loading ingredients..." />);
			expect(screen.getByText('Loading ingredients...')).toBeInTheDocument();
		});

		it('should not render message paragraph when message is empty string', () => {
			const { container } = render(<LoadingState message="" />);
			const messageParagraph = container.querySelector('p.text-sm');
			expect(messageParagraph).not.toBeInTheDocument();
		});
	});

	describe('size variants', () => {
		it('should render with small size', () => {
			const { container } = render(<LoadingState size="small" />);
			const dots = container.querySelectorAll('.w-1\\.5');
			expect(dots.length).toBeGreaterThan(0);
		});

		it('should render with medium size', () => {
			const { container } = render(<LoadingState size="medium" />);
			const dots = container.querySelectorAll('.w-2\\.5');
			expect(dots.length).toBeGreaterThan(0);
		});

		it('should render with large size by default', () => {
			const { container } = render(<LoadingState />);
			const dots = container.querySelectorAll('.w-4');
			expect(dots.length).toBeGreaterThan(0);
		});

		it('should render with large size when explicitly set', () => {
			const { container } = render(<LoadingState size="large" />);
			const dots = container.querySelectorAll('.w-4');
			expect(dots.length).toBeGreaterThan(0);
		});
	});

	describe('styling', () => {
		it('should center content vertically and horizontally', () => {
			const { container } = render(<LoadingState />);
			const wrapper = container.firstChild as HTMLElement;

			expect(wrapper.className).toContain('flex');
			expect(wrapper.className).toContain('flex-col');
			expect(wrapper.className).toContain('items-center');
			expect(wrapper.className).toContain('justify-center');
		});

		it('should apply vertical padding', () => {
			const { container } = render(<LoadingState />);
			const wrapper = container.firstChild as HTMLElement;

			expect(wrapper.className).toContain('py-12');
		});

		it('should apply custom className', () => {
			const { container } = render(<LoadingState className="custom-class" />);
			const wrapper = container.firstChild as HTMLElement;

			expect(wrapper.className).toContain('custom-class');
		});

		it('should style message with muted color', () => {
			render(<LoadingState message="Loading data..." />);
			const message = screen.getByText('Loading data...');

			expect(message.className).toContain('text-muted-foreground');
		});

		it('should style message as small text', () => {
			render(<LoadingState message="Loading..." />);
			const message = screen.getByText('Loading...');

			expect(message.className).toContain('text-sm');
		});

		it('should add top margin to message', () => {
			render(<LoadingState message="Loading..." />);
			const message = screen.getByText('Loading...');

			expect(message.className).toContain('mt-4');
		});
	});

	describe('complete scenarios', () => {
		it('should render with all props', () => {
			const { container } = render(
				<LoadingState message="Loading books..." size="large" className={`my-custom-class`} />
			);

			expect(screen.getByText('Loading books...')).toBeInTheDocument();
			expect(container.firstChild).toHaveClass('my-custom-class');
			const dots = container.querySelectorAll('.w-4');
			expect(dots.length).toBeGreaterThan(0);
		});

		it('should render with minimal props', () => {
			render(<LoadingState />);
			expect(screen.getByText('Loading...')).toBeInTheDocument();
		});

		it('should render with only message', () => {
			render(<LoadingState message="Please wait..." />);
			expect(screen.getByText('Please wait...')).toBeInTheDocument();
		});

		it('should render with only size', () => {
			render(<LoadingState size="small" />);
			expect(screen.getByText('Loading...')).toBeInTheDocument();
		});
	});

	describe('message variations', () => {
		it('should render short message', () => {
			render(<LoadingState message="Wait..." />);
			expect(screen.getByText('Wait...')).toBeInTheDocument();
		});

		it('should render long message', () => {
			const longMessage = 'Loading all ingredients from the database, please wait...';
			render(<LoadingState message={longMessage} />);
			expect(screen.getByText(longMessage)).toBeInTheDocument();
		});

		it('should render message with special characters', () => {
			render(<LoadingState message="Loading data (99%)..." />);
			expect(screen.getByText('Loading data (99%)...')).toBeInTheDocument();
		});
	});

	describe('layout', () => {
		it('should render loading dots before message', () => {
			const { container } = render(<LoadingState message="Loading..." />);
			const wrapper = container.firstChild as HTMLElement;
			const children = Array.from(wrapper.children);

			// First child should contain the loading dots (span)
			expect(children[0]!.tagName).toBe('SPAN');
			// Second child should be the message (p)
			expect(children[1]!.tagName).toBe('P');
		});

		it('should only render loading dots when no message', () => {
			const { container } = render(<LoadingState message="" />);
			const wrapper = container.firstChild as HTMLElement;

			expect(wrapper.children).toHaveLength(1);
			expect(wrapper.children[0]!.tagName).toBe('SPAN');
		});
	});
});
