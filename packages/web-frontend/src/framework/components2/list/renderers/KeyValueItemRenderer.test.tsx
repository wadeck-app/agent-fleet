import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ItemActions } from '../EditableListField';
import { KeyValueItemRenderer, type KeyValueItem } from './KeyValueItemRenderer';

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
			const item: KeyValueItem = { key: 'TEST_KEY', value: 'test value' };

			render(<KeyValueItemRenderer item={item} actions={mockActions} />);

			const keyInput = screen.getByDisplayValue('TEST_KEY');
			const valueInput = screen.getByDisplayValue('test value');

			expect(keyInput).toBeInTheDocument();
			expect(valueInput).toBeInTheDocument();
		});

		it('should render remove button', () => {
			const item: KeyValueItem = { key: 'KEY', value: 'value' };

			render(<KeyValueItemRenderer item={item} actions={mockActions} />);

			const removeButton = screen.getByTitle('Remove');
			expect(removeButton).toBeInTheDocument();
		});

		it('should render with empty values', () => {
			const item: KeyValueItem = { key: '', value: '' };

			render(<KeyValueItemRenderer item={item} actions={mockActions} />);

			const inputs = screen.getAllByPlaceholderText(/KEY|value/);
			expect(inputs).toHaveLength(2);
		});
	});

	describe('interactions', () => {
		it('should call update when key changes', async () => {
			const user = userEvent.setup();
			const item: KeyValueItem = { key: 'OLD_KEY', value: 'value' };

			render(<KeyValueItemRenderer item={item} actions={mockActions} />);

			const keyInput = screen.getByDisplayValue('OLD_KEY');
			await user.clear(keyInput);
			await user.type(keyInput, 'NEW_KEY');

			expect(mockActions.update).toHaveBeenCalled();
			// Check that the last call contains the new key
			const lastCall = (mockActions.update as any).mock.calls.at(-1);
			expect(lastCall[0]).toEqual({ key: 'NEW_KEY' });
		});

		it('should call update when value changes', async () => {
			const user = userEvent.setup();
			const item: KeyValueItem = { key: 'KEY', value: 'old value' };

			render(<KeyValueItemRenderer item={item} actions={mockActions} />);

			const valueInput = screen.getByDisplayValue('old value');
			await user.clear(valueInput);
			await user.type(valueInput, 'new value');

			expect(mockActions.update).toHaveBeenCalled();
			// Check that the last call contains the new value
			const lastCall = (mockActions.update as any).mock.calls.at(-1);
			expect(lastCall[0]).toEqual({ value: 'new value' });
		});

		it('should call remove when remove button clicked', async () => {
			const user = userEvent.setup();
			const item: KeyValueItem = { key: 'KEY', value: 'value' };

			render(<KeyValueItemRenderer item={item} actions={mockActions} />);

			const removeButton = screen.getByTitle('Remove');
			await user.click(removeButton);

			expect(mockActions.remove).toHaveBeenCalledTimes(1);
		});
	});

	describe('accessibility', () => {
		it('should have proper labels', () => {
			const item: KeyValueItem = { key: 'KEY', value: 'value' };

			render(<KeyValueItemRenderer item={item} actions={mockActions} />);

			expect(screen.getByText('Key')).toBeInTheDocument();
			expect(screen.getByText('Value')).toBeInTheDocument();
		});

		it('should have proper button title for accessibility', () => {
			const item: KeyValueItem = { key: 'KEY', value: 'value' };

			render(<KeyValueItemRenderer item={item} actions={mockActions} />);

			const removeButton = screen.getByTitle('Remove');
			expect(removeButton).toHaveAttribute('title', 'Remove');
		});
	});
});
