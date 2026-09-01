import * as toastEventStore from '@framework/features/toast/toastEventStore';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toast } from './Toast';

describe('Toast', () => {
	beforeEach(() => {
		vi.spyOn(toastEventStore, 'recordToastEvent').mockImplementation(() => {});
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should render with message', () => {
		render(<Toast message="Test message" onClose={() => {}} />);
		expect(screen.getByText('Test message')).toBeInTheDocument();
	});

	it('should record toast event on mount', () => {
		render(<Toast message="Test message" type="success" onClose={() => {}} />);
		expect(toastEventStore.recordToastEvent).toHaveBeenCalledWith('success', 'Test message');
	});

	it('should auto-dismiss after duration for success toast', () => {
		const onClose = vi.fn();
		render(<Toast message="Success" type="success" duration={3000} onClose={onClose} />);

		expect(onClose).not.toHaveBeenCalled();

		vi.advanceTimersByTime(3000);

		expect(onClose).toHaveBeenCalledOnce();
	});

	it('should not auto-dismiss error toasts', async () => {
		const onClose = vi.fn();
		render(<Toast message="Error" type="error" duration={3000} onClose={onClose} />);

		vi.advanceTimersByTime(5000);

		expect(onClose).not.toHaveBeenCalled();
	});

	it('should call onClose when close button is clicked', () => {
		const onClose = vi.fn();
		render(<Toast message="Test" onClose={onClose} />);

		const closeButton = screen.getByLabelText('Close toast');
		closeButton.click();

		expect(onClose).toHaveBeenCalledOnce();
	});

	it('should render with success style by default', () => {
		const { container } = render(<Toast message="Success" onClose={() => {}} />);
		const toast = container.firstChild as HTMLElement;
		// violations-suppress: tailwind/no-raw-color-class test fixture
		expect(toast).toHaveClass('bg-green-600', 'text-white');
	});

	it('should render with error style', () => {
		const { container } = render(<Toast message="Error" type="error" onClose={() => {}} />);
		const toast = container.firstChild as HTMLElement;
		expect(toast).toHaveClass('bg-destructive', 'text-destructive-foreground');
	});

	it('should render with info style', () => {
		const { container } = render(<Toast message="Info" type="info" onClose={() => {}} />);
		const toast = container.firstChild as HTMLElement;
		expect(toast).toHaveClass('bg-secondary', 'text-secondary-foreground');
	});

	it('should render with warning style', () => {
		const { container } = render(<Toast message="Warning" type="warning" onClose={() => {}} />);
		const toast = container.firstChild as HTMLElement;
		expect(toast).toHaveClass('bg-accent', 'text-accent-foreground');
	});
});
