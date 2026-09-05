import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SelectWithSpinner } from './SelectWithSpinner';

function renderSelectWithSpinner(loading: boolean, value = 'option1') {
	return render(
		<SelectWithSpinner value={value} loading={loading}>
			<SelectTrigger>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="option1">Option 1</SelectItem>
				<SelectItem value="option2">Option 2</SelectItem>
			</SelectContent>
		</SelectWithSpinner>
	);
}

describe('SelectWithSpinner', () => {
	describe('spinner placement -- bug #1', () => {
		it('should not render spinner when not loading', () => {
			renderSelectWithSpinner(false);
			expect(document.querySelector('[data-testid="select-spinner"]')).toBeNull();
		});

		it('should render spinner when loading', () => {
			renderSelectWithSpinner(true);
			const spinner = document.querySelector('[data-testid="select-spinner"]');
			expect(spinner).toBeTruthy();
		});

		it('should place spinner outside the SelectTrigger (combobox) element', () => {
			renderSelectWithSpinner(true);

			const triggerButton = screen.getByRole('combobox');
			const spinner = document.querySelector('[data-testid="select-spinner"]');

			expect(spinner).toBeTruthy();
			// Spinner must NOT be a descendant of the trigger button
			expect(triggerButton.contains(spinner)).toBe(false);
		});

		it('should disable select while loading', () => {
			renderSelectWithSpinner(true);
			expect(screen.getByRole('combobox')).toBeDisabled();
		});

		it('should not disable select when not loading', () => {
			renderSelectWithSpinner(false);
			expect(screen.getByRole('combobox')).not.toBeDisabled();
		});
	});

	describe('container layout -- bug #7', () => {
		it('should use a flex container so spinner sits beside the select', () => {
			const { container } = renderSelectWithSpinner(true);
			// The outermost wrapper should be a flex container
			const wrapper = container.firstChild as HTMLElement;
			expect(wrapper.className).toMatch(/flex/);
		});
	});
});
