import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ItemActions } from '../EditableListField';
import { InputDefinitionRenderer, type InputDefinitionItem } from './InputDefinitionRenderer';

describe('InputDefinitionRenderer', () => {
	const mockActions: ItemActions<InputDefinitionItem> = {
		update: vi.fn(),
		remove: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('rendering', () => {
		it('should render input name and type selector', () => {
			const item: InputDefinitionItem = { name: 'myInput', type: 'string' };

			render(<InputDefinitionRenderer item={item} actions={mockActions} />);

			expect(screen.getByDisplayValue('myInput')).toBeInTheDocument();
			expect(screen.getByText('String')).toBeInTheDocument();
		});

		it('should render remove button', () => {
			const item: InputDefinitionItem = { name: 'myInput', type: 'string' };

			render(<InputDefinitionRenderer item={item} actions={mockActions} />);

			const removeButton = screen.getByTitle('Remove');
			expect(removeButton).toBeInTheDocument();
		});

		it('should render with empty name', () => {
			const item: InputDefinitionItem = { name: '', type: 'string' };

			render(<InputDefinitionRenderer item={item} actions={mockActions} />);

			const nameInput = screen.getByPlaceholderText('inputName');
			expect(nameInput).toBeInTheDocument();
		});
	});

	describe('interactions', () => {
		it('should call update when name changes', async () => {
			const user = userEvent.setup();
			const item: InputDefinitionItem = { name: 'oldName', type: 'string' };

			render(<InputDefinitionRenderer item={item} actions={mockActions} />);

			const nameInput = screen.getByDisplayValue('oldName');
			await user.clear(nameInput);
			await user.type(nameInput, 'newName');

			expect(mockActions.update).toHaveBeenCalled();
			const lastCall = (mockActions.update as any).mock.calls.at(-1);
			expect(lastCall[0]).toEqual({ name: 'newName' });
		});

		it('should call update when type changes', async () => {
			const user = userEvent.setup();
			const item: InputDefinitionItem = { name: 'myInput', type: 'string' };

			render(<InputDefinitionRenderer item={item} actions={mockActions} />);

			// Open the select dropdown
			const typeButton = screen.getByRole('combobox');
			await user.click(typeButton);

			// Select a different type
			const numberOption = screen.getByRole('option', { name: 'Number' });
			await user.click(numberOption);

			expect(mockActions.update).toHaveBeenCalledWith({ type: 'number' });
		});

		it('should call remove when remove button clicked', async () => {
			const user = userEvent.setup();
			const item: InputDefinitionItem = { name: 'myInput', type: 'string' };

			render(<InputDefinitionRenderer item={item} actions={mockActions} />);

			const removeButton = screen.getByTitle('Remove');
			await user.click(removeButton);

			expect(mockActions.remove).toHaveBeenCalledTimes(1);
		});
	});

	describe('type options', () => {
		it('should have all variable type options available', async () => {
			const user = userEvent.setup();
			const item: InputDefinitionItem = { name: 'myInput', type: 'string' };

			render(<InputDefinitionRenderer item={item} actions={mockActions} />);

			// Open the select dropdown
			const typeButton = screen.getByRole('combobox');
			await user.click(typeButton);

			// Check for a few key types
			expect(screen.getByRole('option', { name: 'String' })).toBeInTheDocument();
			expect(screen.getByRole('option', { name: 'Number' })).toBeInTheDocument();
			expect(screen.getByRole('option', { name: 'Boolean' })).toBeInTheDocument();
			expect(screen.getByRole('option', { name: 'Array' })).toBeInTheDocument();
			expect(screen.getByRole('option', { name: 'Password' })).toBeInTheDocument();
		});
	});

	describe('accessibility', () => {
		it('should have proper labels', () => {
			const item: InputDefinitionItem = { name: 'myInput', type: 'string' };

			render(<InputDefinitionRenderer item={item} actions={mockActions} />);

			expect(screen.getByText('Name')).toBeInTheDocument();
			expect(screen.getByText('Type')).toBeInTheDocument();
		});

		it('should have proper button title for accessibility', () => {
			const item: InputDefinitionItem = { name: 'myInput', type: 'string' };

			render(<InputDefinitionRenderer item={item} actions={mockActions} />);

			const removeButton = screen.getByTitle('Remove');
			expect(removeButton).toHaveAttribute('title', 'Remove');
		});
	});
});
