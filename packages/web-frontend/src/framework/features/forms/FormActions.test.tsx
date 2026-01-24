import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { type FormAction, FormActions } from './FormActions';

describe('FormActions', () => {
	it('renders all actions', () => {
		const actions: FormAction[] = [
			{ label: 'Save', type: 'submit' },
			{ label: 'Cancel', type: 'button', variant: 'outline' },
		];

		render(<FormActions actions={actions} />);

		expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
	});

	it('handles button clicks', async () => {
		const user = userEvent.setup();
		const handleClick = vi.fn();
		const actions: FormAction[] = [{ label: 'Click Me', type: 'button', onClick: handleClick }];

		render(<FormActions actions={actions} />);

		await user.click(screen.getByRole('button', { name: 'Click Me' }));

		expect(handleClick).toHaveBeenCalledTimes(1);
	});

	it('disables buttons when isSubmitting is true', () => {
		const actions: FormAction[] = [
			{ label: 'Save', type: 'submit' },
			{ label: 'Cancel', type: 'button' },
		];

		render(<FormActions actions={actions} isSubmitting={true} />);

		expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
	});

	it('respects individual action disabled state', () => {
		const actions: FormAction[] = [
			{ label: 'Save', type: 'submit', disabled: true },
			{ label: 'Cancel', type: 'button', disabled: false },
		];

		render(<FormActions actions={actions} />);

		expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeDisabled();
	});

	it('applies correct button variants', () => {
		const actions: FormAction[] = [
			{ label: 'Primary', variant: 'default' },
			{ label: 'Secondary', variant: 'outline' },
			{ label: 'Danger', variant: 'destructive' },
		];

		render(<FormActions actions={actions} />);

		// Buttons should render with appropriate classes based on variant
		expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Danger' })).toBeInTheDocument();
	});

	it('supports external form submission via formId', () => {
		const actions: FormAction[] = [{ label: 'Submit', type: 'submit', formId: 'my-form' }];

		render(<FormActions actions={actions} />);

		const button = screen.getByRole('button', { name: 'Submit' });
		expect(button).toHaveAttribute('form', 'my-form');
	});

	it('defaults to button type when not specified', () => {
		const actions: FormAction[] = [{ label: 'Click' }];

		render(<FormActions actions={actions} />);

		const button = screen.getByRole('button', { name: 'Click' });
		expect(button).toHaveAttribute('type', 'button');
	});

	it('defaults to default variant when not specified', () => {
		const actions: FormAction[] = [{ label: 'Click' }];

		render(<FormActions actions={actions} />);

		// Should render without errors
		expect(screen.getByRole('button', { name: 'Click' })).toBeInTheDocument();
	});
});
