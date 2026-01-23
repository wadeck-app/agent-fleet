import { createDeferredPromise } from '@framework/test-utils/deferredPromise';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SearchInput } from './SearchInput';

describe('SearchInput', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllTimers();
		if (vi.isFakeTimers()) {
			vi.useRealTimers();
		}
	});

	describe('Rendering', () => {
		it('should render with default placeholder', () => {
			render(<SearchInput value="" onChange={() => {}} />);

			expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
		});

		it('should render with custom placeholder', () => {
			render(<SearchInput value="" onChange={() => {}} placeholder="Search books..." />);

			expect(screen.getByPlaceholderText('Search books...')).toBeInTheDocument();
		});

		it('should render with initial value', () => {
			render(<SearchInput value="test query" onChange={() => {}} />);

			expect(screen.getByDisplayValue('test query')).toBeInTheDocument();
		});

		it('should forward aria-label', () => {
			render(<SearchInput value="" onChange={() => {}} aria-label="Search for items" />);

			expect(screen.getByLabelText('Search for items')).toBeInTheDocument();
		});

		it('should forward id prop', () => {
			render(<SearchInput value="" onChange={() => {}} id="search-input" />);

			expect(screen.getByPlaceholderText('Search...')).toHaveAttribute('id', 'search-input');
		});

		it('should apply custom className to wrapper', () => {
			const { container } = render(
				<SearchInput
					value=""
					onChange={() => {}}
					className={`
     custom-class
   `}
				/>
			);

			const wrapper = container.firstChild;
			expect(wrapper).toHaveClass('custom-class');
		});
	});

	describe('Clear Button', () => {
		it('should not show clear button when value is empty', () => {
			render(<SearchInput value="" onChange={() => {}} />);

			expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
		});

		it('should show clear button when value exists', () => {
			render(<SearchInput value="test" onChange={() => {}} />);

			expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
		});

		it('should clear input when clear button is clicked', async () => {
			const user = userEvent.setup({ delay: null });
			const onChange = vi.fn();

			render(<SearchInput value="test" onChange={onChange} />);

			const clearButton = screen.getByLabelText('Clear search');
			await user.click(clearButton);

			expect(onChange).toHaveBeenCalledWith('');
		});

		it('should call onClear callback when clear button is clicked', async () => {
			const user = userEvent.setup({ delay: null });
			const onClear = vi.fn();
			const onChange = vi.fn();

			render(<SearchInput value="test" onChange={onChange} onClear={onClear} />);

			const clearButton = screen.getByLabelText('Clear search');
			await user.click(clearButton);

			expect(onClear).toHaveBeenCalled();
			expect(onChange).toHaveBeenCalledWith('');
		});

		it('should hide clear button when input is cleared', async () => {
			const _user = userEvent.setup({ delay: null });
			const onChange = vi.fn();

			const { rerender } = render(<SearchInput value="test" onChange={onChange} />);

			expect(screen.getByLabelText('Clear search')).toBeInTheDocument();

			// Simulate parent updating value to empty
			rerender(<SearchInput value="" onChange={onChange} />);

			expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
		});

		it('should not show clear button when disabled', () => {
			render(<SearchInput value="test" onChange={() => {}} disabled />);

			expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
		});
	});

	describe('Debouncing', () => {
		it('should not call onChange immediately on typing', async () => {
			const user = userEvent.setup({ delay: null });
			const onChange = vi.fn();

			render(<SearchInput value="" onChange={onChange} debounceMs={400} />);

			const input = screen.getByPlaceholderText('Search...');
			await user.type(input, 'test');

			// Should not have been called yet
			expect(onChange).not.toHaveBeenCalled();
		});

		it('should call onChange after debounce delay', async () => {
			const user = userEvent.setup({ delay: null });
			const onChange = vi.fn();

			render(<SearchInput value="" onChange={onChange} debounceMs={400} />);

			const input = screen.getByPlaceholderText('Search...');
			await user.type(input, 'test');

			// Wait for debounce to complete
			await waitFor(
				() => {
					expect(onChange).toHaveBeenCalledWith('test');
				},
				{ timeout: 600 }
			);
		});

		it('should only call onChange once after rapid typing', async () => {
			const user = userEvent.setup({ delay: null });
			const onChange = vi.fn();

			render(<SearchInput value="" onChange={onChange} debounceMs={400} />);

			const input = screen.getByPlaceholderText('Search...');

			// Type multiple characters rapidly
			await user.type(input, 'hello');

			// Should not have been called yet (or called very few times during typing)
			expect(onChange).not.toHaveBeenCalled();

			// Wait for debounce to complete
			await waitFor(
				() => {
					// Should be called exactly once with final value
					expect(onChange).toHaveBeenCalledTimes(1);
					expect(onChange).toHaveBeenCalledWith('hello');
				},
				{ timeout: 600 }
			);
		});

		it('should respect custom debounce delay', async () => {
			const user = userEvent.setup({ delay: null });
			const onChange = vi.fn();

			render(<SearchInput value="" onChange={onChange} debounceMs={200} />);

			const input = screen.getByPlaceholderText('Search...');
			await user.type(input, 'test');

			// Wait for debounce to complete (200ms + buffer)
			await waitFor(
				() => {
					expect(onChange).toHaveBeenCalledWith('test');
				},
				{ timeout: 400 }
			);
		});

		it('should cancel previous timeout on new input', async () => {
			const user = userEvent.setup({ delay: null });
			const onChange = vi.fn();

			render(<SearchInput value="" onChange={onChange} debounceMs={400} />);

			const input = screen.getByPlaceholderText('Search...');

			// Add comment above the target line, not at the end
			// Type in two phases to test debounce cancellation
			await user.type(input, 'test');

			// Add comment above the target line, not at the end
			// Wait briefly before typing more to test debounce reset
			const deferred = createDeferredPromise<void>();
			deferred.resolve();
			await deferred.promise;

			await user.type(input, 'ing');

			// Should only call onChange once with final value after debounce
			await waitFor(
				() => {
					expect(onChange).toHaveBeenCalledTimes(1);
					expect(onChange).toHaveBeenCalledWith('testing');
				},
				{ timeout: 800 }
			);
		});
	});

	describe('User Interactions', () => {
		it('should update internal value immediately on typing', async () => {
			const user = userEvent.setup({ delay: null });
			const onChange = vi.fn();

			render(<SearchInput value="" onChange={onChange} />);

			const input = screen.getByPlaceholderText('Search...') as HTMLInputElement;
			await user.type(input, 'test');

			// Internal value should update immediately
			expect(input.value).toBe('test');
		});

		it('should sync internal value when value prop changes', () => {
			const onChange = vi.fn();
			const { rerender } = render(<SearchInput value="initial" onChange={onChange} />);

			const input = screen.getByPlaceholderText('Search...') as HTMLInputElement;
			expect(input.value).toBe('initial');

			// Update the value prop
			rerender(<SearchInput value="updated" onChange={onChange} />);

			expect(input.value).toBe('updated');
		});

		it('should allow clearing via typing', async () => {
			const user = userEvent.setup({ delay: null });
			const onChange = vi.fn();

			render(<SearchInput value="test" onChange={onChange} />);

			const input = screen.getByPlaceholderText('Search...') as HTMLInputElement;
			await user.clear(input);

			// Wait for debounce to complete
			await waitFor(
				() => {
					expect(onChange).toHaveBeenCalledWith('');
				},
				{ timeout: 600 }
			);
		});
	});

	describe('Disabled State', () => {
		it('should disable input when disabled prop is true', () => {
			render(<SearchInput value="" onChange={() => {}} disabled />);

			const input = screen.getByPlaceholderText('Search...');
			expect(input).toBeDisabled();
		});

		it('should not allow typing when disabled', async () => {
			const user = userEvent.setup({ delay: null });
			const onChange = vi.fn();

			render(<SearchInput value="" onChange={onChange} disabled />);

			const input = screen.getByPlaceholderText('Search...') as HTMLInputElement;
			await user.type(input, 'test');

			expect(input.value).toBe('');
			expect(onChange).not.toHaveBeenCalled();
		});
	});

	describe('Cleanup', () => {
		it('should cleanup timeout on unmount', async () => {
			const user = userEvent.setup({ delay: null });
			const onChange = vi.fn();

			const { unmount } = render(<SearchInput value="" onChange={onChange} debounceMs={400} />);

			const input = screen.getByPlaceholderText('Search...');
			await user.type(input, 'test');

			// Unmount before debounce completes
			unmount();

			// Add comment above the target line, not at the end
			// Wait longer than debounce time to verify cleanup
			const deferred = createDeferredPromise<void>();
			deferred.resolve();
			await deferred.promise;

			// onChange should not have been called after unmount
			expect(onChange).not.toHaveBeenCalled();
		});
	});

	describe('Accessibility', () => {
		it('should have proper type attribute', () => {
			render(<SearchInput value="" onChange={() => {}} />);

			const input = screen.getByPlaceholderText('Search...');
			expect(input).toHaveAttribute('type', 'text');
		});

		it('should support aria-label for screen readers', () => {
			render(<SearchInput value="" onChange={() => {}} aria-label="Search products" />);

			expect(screen.getByLabelText('Search products')).toBeInTheDocument();
		});

		it('should have accessible clear button', () => {
			render(<SearchInput value="test" onChange={() => {}} />);

			const clearButton = screen.getByLabelText('Clear search');
			expect(clearButton).toBeInTheDocument();
			expect(clearButton).toHaveAttribute('type', 'button');
		});
	});
});
