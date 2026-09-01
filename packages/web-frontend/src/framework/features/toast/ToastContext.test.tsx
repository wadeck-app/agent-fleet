import { act } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from './ToastContext';

// Test component that uses the toast hook
function TestComponent() {
	const { showToast } = useToast();

	return (
		<div>
			// violations-suppress: react/no-raw-button test fixture
			<button onClick={() => showToast('Success message', 'success')}>Show Success</button>
			// violations-suppress: react/no-raw-button test fixture
			<button onClick={() => showToast('Error message', 'error')}>Show Error</button>
			// violations-suppress: react/no-raw-button test fixture
			<button onClick={() => showToast('Info message', 'info')}>Show Info</button>
		</div>
	);
}

describe('ToastContext', () => {
	it('should throw error when useToast is used outside provider', () => {
		// Suppress console.error for this test
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(() => {
			render(<TestComponent />);
		}).toThrow('useToast must be used within a ToastProvider');

		spy.mockRestore();
	});

	it('should show toast when showToast is called', async () => {
		render(
			<ToastProvider>
				<TestComponent />
			</ToastProvider>
		);

		const button = screen.getByText('Show Success');
		act(() => {
			button.click();
		});

		await waitFor(() => {
			expect(screen.getByText('Success message')).toBeInTheDocument();
		});
	});

	it('should show multiple toasts', async () => {
		render(
			<ToastProvider>
				<TestComponent />
			</ToastProvider>
		);

		const successButton = screen.getByText('Show Success');
		const errorButton = screen.getByText('Show Error');

		act(() => {
			successButton.click();
			errorButton.click();
		});

		await waitFor(() => {
			expect(screen.getByText('Success message')).toBeInTheDocument();
			expect(screen.getByText('Error message')).toBeInTheDocument();
		});
	});

	it('should remove toast when close button is clicked', async () => {
		render(
			<ToastProvider>
				<TestComponent />
			</ToastProvider>
		);

		const button = screen.getByText('Show Success');
		act(() => {
			button.click();
		});

		await waitFor(() => {
			expect(screen.getByText('Success message')).toBeInTheDocument();
		});

		const closeButton = screen.getByLabelText('Close toast');
		act(() => {
			closeButton.click();
		});

		await waitFor(() => {
			expect(screen.queryByText('Success message')).not.toBeInTheDocument();
		});
	});

	it('should default to success type', async () => {
		function DefaultTypeComponent() {
			const { showToast } = useToast();
			// violations-suppress: react/no-raw-button test fixture
			return <button onClick={() => showToast('Default message')}>Show</button>;
		}

		render(
			<ToastProvider>
				<DefaultTypeComponent />
			</ToastProvider>
		);

		const button = screen.getByText('Show');
		act(() => {
			button.click();
		});

		await waitFor(() => {
			const toast = screen.getByText('Default message').closest('div')!.parentElement;
			// violations-suppress: tailwind/no-raw-color-class test fixture
			expect(toast).toHaveClass('bg-green-600');
		});
	});
});
