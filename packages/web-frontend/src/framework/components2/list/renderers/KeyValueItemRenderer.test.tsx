import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ItemActions } from '../EditableListField';
import { type KeyValueItem, KeyValueItemRenderer } from './KeyValueItemRenderer';

describe('KeyValueItemRenderer', () => {
	const mockActions: ItemActions<KeyValueItem> = {
		update: vi.fn(),
		remove: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('rendering', () => {
		it('should render key and value inputs', () => {
			const item: KeyValueItem = { id: 'item-1', key: 'TEST_KEY', value: 'test value' };

			render(<KeyValueItemRenderer item={item} actions={mockActions} />);

			const keyInput = screen.getByDisplayValue('TEST_KEY');
			const valueInput = screen.getByDisplayValue('test value');

			expect(keyInput).toBeInTheDocument();
			expect(valueInput).toBeInTheDocument();
		});

		it('should render remove button', () => {
			const item: KeyValueItem = { id: 'item-1', key: 'KEY', value: 'value' };

			render(<KeyValueItemRenderer item={item} actions={mockActions} />);

			const removeButton = screen.getByTitle('Remove variable');
			expect(removeButton).toBeInTheDocument();
		});

		it('should render with empty values', () => {
			const item: KeyValueItem = { id: 'item-1', key: '', value: '' };

			render(<KeyValueItemRenderer item={item} actions={mockActions} />);

			const inputs = screen.getAllByPlaceholderText(/KEY|value/);
			expect(inputs).toHaveLength(2);
		});
	});

	describe('interactions', () => {
		it('should call update when key changes', async () => {
			const user = userEvent.setup();
			const item: KeyValueItem = { id: 'item-1', key: 'OLD_KEY', value: 'value' };

			render(<KeyValueItemRenderer item={item} actions={mockActions} />);

			const keyInput = screen.getByDisplayValue('OLD_KEY');
			await user.clear(keyInput);

			// Verify update was called with the key property
			expect(mockActions.update).toHaveBeenCalledWith(expect.objectContaining({ key: expect.any(String) }));
		});

		it('should call update when value changes', async () => {
			const user = userEvent.setup();
			const item: KeyValueItem = { id: 'item-1', key: 'KEY', value: 'old value' };

			render(<KeyValueItemRenderer item={item} actions={mockActions} />);

			const valueInput = screen.getByDisplayValue('old value');
			await user.clear(valueInput);

			// Verify update was called with the value property
			expect(mockActions.update).toHaveBeenCalledWith(expect.objectContaining({ value: expect.any(String) }));
		});

		it('should call remove when remove button clicked', async () => {
			const user = userEvent.setup();
			const item: KeyValueItem = { id: 'item-1', key: 'KEY', value: 'value' };

			render(<KeyValueItemRenderer item={item} actions={mockActions} />);

			const removeButton = screen.getByTitle('Remove variable');
			await user.click(removeButton);

			expect(mockActions.remove).toHaveBeenCalledTimes(1);
		});
	});

	describe('accessibility', () => {
		it('should have proper labels', () => {
			const item: KeyValueItem = { id: 'item-1', key: 'KEY', value: 'value' };

			render(<KeyValueItemRenderer item={item} actions={mockActions} />);

			expect(screen.getByText('Key')).toBeInTheDocument();
			expect(screen.getByText('Value')).toBeInTheDocument();
		});

		it('should have proper button title for accessibility', () => {
			const item: KeyValueItem = { id: 'item-1', key: 'KEY', value: 'value' };

			render(<KeyValueItemRenderer item={item} actions={mockActions} />);

			const removeButton = screen.getByTitle('Remove variable');
			expect(removeButton).toHaveAttribute('title', 'Remove variable');
		});
	});
});
