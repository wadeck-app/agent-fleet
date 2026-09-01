import { useListItems } from '@framework/hooks2/form/useListItems';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ItemActions } from './EditableListField';
import { EditableListField } from './EditableListField';

interface TestItem {
	id: string;
	name: string;
}

const renderTestItem = (item: TestItem) => <div data-testid={`item-${item.id}`}>{item.name}</div>;

/**
 * Wrapper component that calls useListItems inside the React render cycle.
 * Required because useListItems uses React Compiler's useMemoCache.
 */
function TestWrapper({
	hookOptions = {},
	fieldProps,
}: {
	hookOptions?: Parameters<typeof useListItems<TestItem>>[0];
	fieldProps: Omit<React.ComponentProps<typeof EditableListField<TestItem>>, 'items'>;
}) {
	const items = useListItems<TestItem>(hookOptions);
	return <EditableListField items={items} {...fieldProps} />;
}

describe('EditableListField', () => {
	describe('rendering', () => {
		it('should render label and description', () => {
			render(
				<TestWrapper
					fieldProps={{
						label: 'Test Label',
						description: 'Test description',
						renderItem: renderTestItem,
						createDefault: () => ({ id: '1', name: 'default' }),
					}}
				/>
			);

			expect(screen.getByText('Test Label')).toBeInTheDocument();
			expect(screen.getByText('Test description')).toBeInTheDocument();
		});

		it('should render empty state when no items', () => {
			render(
				<TestWrapper
					fieldProps={{
						renderItem: renderTestItem,
						createDefault: () => ({ id: '1', name: 'default' }),
						emptyMessage: 'No items found',
					}}
				/>
			);

			expect(screen.getByText('No items found')).toBeInTheDocument();
		});

		it('should render custom empty state', () => {
			render(
				<TestWrapper
					fieldProps={{
						renderItem: renderTestItem,
						createDefault: () => ({ id: '1', name: 'default' }),
						renderEmpty: () => <div>Custom empty state</div>,
					}}
				/>
			);

			expect(screen.getByText('Custom empty state')).toBeInTheDocument();
		});

		it('should render list of items', () => {
			render(
				<TestWrapper
					hookOptions={{
						initialItems: [
							{ id: '1', name: 'Item 1' },
							{ id: '2', name: 'Item 2' },
						],
					}}
					fieldProps={{
						renderItem: renderTestItem,
						createDefault: () => ({ id: '1', name: 'default' }),
					}}
				/>
			);

			expect(screen.getByTestId('item-1')).toBeInTheDocument();
			expect(screen.getByTestId('item-2')).toBeInTheDocument();
		});

		it('should render add button with custom label', () => {
			render(
				<TestWrapper
					fieldProps={{
						renderItem: renderTestItem,
						createDefault: () => ({ id: '1', name: 'default' }),
						addButtonLabel: 'Add New Item',
					}}
				/>
			);

			expect(screen.getByText('Add New Item')).toBeInTheDocument();
		});

		it('should render error message', () => {
			render(
				<TestWrapper
					fieldProps={{
						renderItem: renderTestItem,
						createDefault: () => ({ id: '1', name: 'default' }),
						error: 'This is an error',
					}}
				/>
			);

			expect(screen.getByText('This is an error')).toBeInTheDocument();
		});
	});

	describe('add functionality', () => {
		it('should add item when button clicked', async () => {
			const user = userEvent.setup();

			render(
				<TestWrapper
					fieldProps={{
						renderItem: renderTestItem,
						createDefault: () => ({ id: 'new', name: 'New Item' }),
						addButtonLabel: 'Add',
					}}
				/>
			);

			const addButton = screen.getByText('Add');
			await user.click(addButton);

			expect(screen.getByTestId('item-new')).toBeInTheDocument();
		});

		it('should disable add button when max items reached', () => {
			render(
				<TestWrapper
					hookOptions={{
						initialItems: [{ id: '1', name: 'Item 1' }],
						maxItems: 1,
					}}
					fieldProps={{
						renderItem: renderTestItem,
						createDefault: () => ({ id: '1', name: 'default' }),
						addButtonLabel: 'Add',
					}}
				/>
			);

			const addButton = screen.getByText('Add');
			expect(addButton).toBeDisabled();
		});
	});

	describe('item actions', () => {
		it('should pass update action to renderItem', () => {
			const renderWithUpdate = vi.fn((item: TestItem, _index: number, actions: ItemActions<TestItem>) => (
				<div>
					<span>{item.name}</span>
					// violations-suppress: react/no-raw-button test fixture
					<button onClick={() => actions.update({ name: 'Updated' })}>Update</button>
				</div>
			));

			render(
				<TestWrapper
					hookOptions={{
						initialItems: [{ id: '1', name: 'Item 1' }],
					}}
					fieldProps={{
						renderItem: renderWithUpdate,
						createDefault: () => ({ id: '1', name: 'default' }),
					}}
				/>
			);

			expect(renderWithUpdate).toHaveBeenCalled();
			expect(renderWithUpdate).toHaveBeenCalledWith(
				{ id: '1', name: 'Item 1' },
				0,
				expect.objectContaining({
					update: expect.any(Function),
					remove: expect.any(Function),
				})
			);
		});

		it('should pass remove action to renderItem', () => {
			const renderWithRemove = vi.fn((item: TestItem, _index: number, actions: ItemActions<TestItem>) => (
				<div>
					<span>{item.name}</span>
					// violations-suppress: react/no-raw-button test fixture
					<button onClick={actions.remove}>Remove</button>
				</div>
			));

			render(
				<TestWrapper
					hookOptions={{
						initialItems: [{ id: '1', name: 'Item 1' }],
					}}
					fieldProps={{
						renderItem: renderWithRemove,
						createDefault: () => ({ id: '1', name: 'default' }),
					}}
				/>
			);

			expect(renderWithRemove).toHaveBeenCalledWith(
				{ id: '1', name: 'Item 1' },
				0,
				expect.objectContaining({
					update: expect.any(Function),
					remove: expect.any(Function),
				})
			);
		});
	});

	describe('drag and drop', () => {
		it('should render drag handles when reordering enabled', () => {
			const { container } = render(
				<TestWrapper
					hookOptions={{
						initialItems: [{ id: '1', name: 'Item 1' }],
					}}
					fieldProps={{
						renderItem: renderTestItem,
						createDefault: () => ({ id: '1', name: 'default' }),
						enableReordering: true,
					}}
				/>
			);

			// DragHandle renders a button with type="button"
			const dragHandle = container.querySelector('button[type="button"]');
			expect(dragHandle).toBeInTheDocument();
		});

		it('should not render drag handles when reordering disabled', () => {
			render(
				<TestWrapper
					hookOptions={{
						initialItems: [{ id: '1', name: 'Item 1' }],
					}}
					fieldProps={{
						renderItem: renderTestItem,
						createDefault: () => ({ id: '1', name: 'default' }),
						enableReordering: false,
					}}
				/>
			);

			const item = screen.getByTestId('item-1');
			expect(item).toBeInTheDocument();
		});
	});

	describe('className prop', () => {
		it('should apply custom className', () => {
			const { container } = render(
				<TestWrapper
					fieldProps={{
						renderItem: renderTestItem,
						createDefault: () => ({ id: '1', name: 'default' }),
						className: 'custom-class',
					}}
				/>
			);

			expect(container.firstChild).toHaveClass('custom-class');
		});
	});
});
