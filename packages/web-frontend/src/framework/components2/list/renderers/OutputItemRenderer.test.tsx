import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ItemActions } from '../EditableListField';
import { type OutputItem, OutputItemRenderer } from './OutputItemRenderer';

describe('OutputItemRenderer', () => {
	const mockActions: ItemActions<OutputItem> = {
		update: vi.fn(),
		remove: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('rendering', () => {
		it('should render variable name and type selector', () => {
			const item: OutputItem = { name: 'myVar', type: 'string' };

			render(<OutputItemRenderer item={item} actions={mockActions} />);

			expect(screen.getByDisplayValue('myVar')).toBeInTheDocument();
			expect(screen.getByText('String')).toBeInTheDocument();
		});

		it('should render remove button', () => {
			const item: OutputItem = { name: 'myVar', type: 'string' };

			render(<OutputItemRenderer item={item} actions={mockActions} />);

			const removeButton = screen.getByTitle('Remove output');
			expect(removeButton).toBeInTheDocument();
		});

		it('should render pattern field for string type', () => {
			const item: OutputItem = { name: 'myVar', type: 'string', pattern: 'Result: (.*)' };

			render(<OutputItemRenderer item={item} actions={mockActions} />);

			expect(screen.getByDisplayValue('Result: (.*)')).toBeInTheDocument();
			expect(screen.getByText(/Regex pattern for extracting/)).toBeInTheDocument();
		});

		it('should not render pattern field for non-string types', () => {
			const item: OutputItem = { name: 'myVar', type: 'number' };

			render(<OutputItemRenderer item={item} actions={mockActions} />);

			expect(screen.queryByText(/Regex pattern/)).not.toBeInTheDocument();
		});
	});

	describe('interactions', () => {
		it('should call update when name changes', async () => {
			const user = userEvent.setup();
			const item: OutputItem = { name: 'oldName', type: 'string' };

			render(<OutputItemRenderer item={item} actions={mockActions} />);

			const nameInput = screen.getByDisplayValue('oldName');
			await user.clear(nameInput);

			// Verify update was called with the name property
			expect(mockActions.update).toHaveBeenCalledWith(expect.objectContaining({ name: expect.any(String) }));
		});

		it('should call update when type changes', async () => {
			const user = userEvent.setup();
			const item: OutputItem = { name: 'myVar', type: 'string' };

			render(<OutputItemRenderer item={item} actions={mockActions} />);

			// Open the select dropdown
			const typeButton = screen.getByRole('combobox');
			await user.click(typeButton);

			// Select a different type
			const numberOption = screen.getByRole('option', { name: 'Number' });
			await user.click(numberOption);

			expect(mockActions.update).toHaveBeenCalledWith({ type: 'number' });
		});

		it('should call update when pattern changes', async () => {
			const user = userEvent.setup();
			const item: OutputItem = { name: 'myVar', type: 'string', pattern: 'old' };

			render(<OutputItemRenderer item={item} actions={mockActions} />);

			const patternInput = screen.getByDisplayValue('old');
			await user.clear(patternInput);

			// Verify update was called with the pattern property
			expect(mockActions.update).toHaveBeenCalledWith(expect.objectContaining({ pattern: expect.any(String) }));
		});

		it('should call remove when remove button clicked', async () => {
			const user = userEvent.setup();
			const item: OutputItem = { name: 'myVar', type: 'string' };

			render(<OutputItemRenderer item={item} actions={mockActions} />);

			const removeButton = screen.getByTitle('Remove output');
			await user.click(removeButton);

			expect(mockActions.remove).toHaveBeenCalledTimes(1);
		});
	});

	describe('type changes', () => {
		it('should show pattern field when type is string', () => {
			const item: OutputItem = { name: 'myVar', type: 'string' };

			render(<OutputItemRenderer item={item} actions={mockActions} />);

			expect(screen.getByText(/Extraction Pattern/)).toBeInTheDocument();
		});

		it('should hide pattern field when type is not string', () => {
			const item: OutputItem = { name: 'myVar', type: 'boolean' };

			render(<OutputItemRenderer item={item} actions={mockActions} />);

			expect(screen.queryByText(/Extraction Pattern/)).not.toBeInTheDocument();
		});
	});

	describe('accessibility', () => {
		it('should have proper labels', () => {
			const item: OutputItem = { name: 'myVar', type: 'string' };

			render(<OutputItemRenderer item={item} actions={mockActions} />);

			expect(screen.getByText('Variable Name')).toBeInTheDocument();
			expect(screen.getByText('Type')).toBeInTheDocument();
		});
	});
});
