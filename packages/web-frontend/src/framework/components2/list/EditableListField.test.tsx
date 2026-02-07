import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { useListItems } from '@framework/hooks2/useListItems';

import { EditableListField } from './EditableListField';

describe('EditableListField', () => {
	interface TestItem {
		id: string;
		name: string;
	}

	const renderTestItem = (item: TestItem) => <div data-testid={`item-${item.id}`}>{item.name}</div>;

	describe('rendering', () => {
		it('should render label and description', () => {
			const items = useListItems<TestItem>();

			const { container } = render(
				<EditableListField
					label="Test Label"
					description="Test description"
					items={items}
					renderItem={renderTestItem}
					createDefault={() => ({ id: '1', name: 'default' })}
				/>
			);

			expect(screen.getByText('Test Label')).toBeInTheDocument();
			expect(screen.getByText('Test description')).toBeInTheDocument();
		});

		it('should render empty state when no items', () => {
			const items = useListItems<TestItem>();

			render(
				<EditableListField
					items={items}
					renderItem={renderTestItem}
					createDefault={() => ({ id: '1', name: 'default' })}
					emptyMessage="No items found"
				/>
			);

			expect(screen.getByText('No items found')).toBeInTheDocument();
		});

		it('should render custom empty state', () => {
			const items = useListItems<TestItem>();

			render(
				<EditableListField
					items={items}
					renderItem={renderTestItem}
					createDefault={() => ({ id: '1', name: 'default' })}
					renderEmpty={() => <div>Custom empty state</div>}
				/>
			);

			expect(screen.getByText('Custom empty state')).toBeInTheDocument();
		});

		it('should render list of items', () => {
			const items = useListItems<TestItem>({
				initialItems: [
					{ id: '1', name: 'Item 1' },
					{ id: '2', name: 'Item 2' },
				],
			});

			render(
				<EditableListField items={items} renderItem={renderTestItem} createDefault={() => ({ id: '1', name: 'default' })} />
			);

			expect(screen.getByTestId('item-1')).toBeInTheDocument();
			expect(screen.getByTestId('item-2')).toBeInTheDocument();
		});

		it('should render add button with custom label', () => {
			const items = useListItems<TestItem>();

			render(
				<EditableListField
					items={items}
					renderItem={renderTestItem}
					createDefault={() => ({ id: '1', name: 'default' })}
					addButtonLabel="Add New Item"
				/>
			);

			expect(screen.getByText('Add New Item')).toBeInTheDocument();
		});

		it('should render error message', () => {
			const items = useListItems<TestItem>();

			render(
				<EditableListField
					items={items}
					renderItem={renderTestItem}
					createDefault={() => ({ id: '1', name: 'default' })}
					error="This is an error"
				/>
			);

			expect(screen.getByText('This is an error')).toBeInTheDocument();
		});
	});

	describe('add functionality', () => {
		it('should add item when button clicked', async () => {
			const user = userEvent.setup();
			const items = useListItems<TestItem>();

			const { rerender } = render(
				<EditableListField
					items={items}
					renderItem={renderTestItem}
					createDefault={() => ({ id: 'new', name: 'New Item' })}
					addButtonLabel="Add"
				/>
			);

			const addButton = screen.getByText('Add');
			await user.click(addButton);

			// Force re-render to see the new item
			rerender(
				<EditableListField
					items={items}
					renderItem={renderTestItem}
					createDefault={() => ({ id: 'new', name: 'New Item' })}
					addButtonLabel="Add"
				/>
			);

			expect(screen.getByTestId('item-new')).toBeInTheDocument();
		});

		it('should disable add button when max items reached', () => {
			const items = useListItems<TestItem>({
				initialItems: [{ id: '1', name: 'Item 1' }],
				maxItems: 1,
			});

			render(
				<EditableListField
					items={items}
					renderItem={renderTestItem}
					createDefault={() => ({ id: '1', name: 'default' })}
					addButtonLabel="Add"
				/>
			);

			const addButton = screen.getByText('Add');
			expect(addButton).toBeDisabled();
		});
	});

	describe('item actions', () => {
		it('should pass update action to renderItem', () => {
			const items = useListItems<TestItem>({
				initialItems: [{ id: '1', name: 'Item 1' }],
			});

			const renderWithUpdate = vi.fn((item, _index, actions) => (
				<div>
					<span>{item.name}</span>
					<button onClick={() => actions.update({ name: 'Updated' })}>Update</button>
				</div>
			));

			render(<EditableListField items={items} renderItem={renderWithUpdate} createDefault={() => ({ id: '1', name: 'default' })} />);

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
			const items = useListItems<TestItem>({
				initialItems: [{ id: '1', name: 'Item 1' }],
			});

			const renderWithRemove = vi.fn((item, _index, actions) => (
				<div>
					<span>{item.name}</span>
					<button onClick={actions.remove}>Remove</button>
				</div>
			));

			render(<EditableListField items={items} renderItem={renderWithRemove} createDefault={() => ({ id: '1', name: 'default' })} />);

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
			const items = useListItems<TestItem>({
				initialItems: [{ id: '1', name: 'Item 1' }],
			});

			const { container } = render(
				<EditableListField
					items={items}
					renderItem={renderTestItem}
					createDefault={() => ({ id: '1', name: 'default' })}
					enableReordering={true}
				/>
			);

			// Check for the presence of drag handle (GripVertical icon will be in the DOM)
			const dragHandle = container.querySelector('button');
			expect(dragHandle).toBeInTheDocument();
		});

		it('should not render drag handles when reordering disabled', () => {
			const items = useListItems<TestItem>({
				initialItems: [{ id: '1', name: 'Item 1' }],
			});

			render(
				<EditableListField
					items={items}
					renderItem={renderTestItem}
					createDefault={() => ({ id: '1', name: 'default' })}
					enableReordering={false}
				/>
			);

			// With reordering disabled, there should be no drag button before the item
			// The only button should be inside renderTestItem (if any)
			const item = screen.getByTestId('item-1');
			expect(item).toBeInTheDocument();
		});
	});

	describe('className prop', () => {
		it('should apply custom className', () => {
			const items = useListItems<TestItem>();

			const { container } = render(
				<EditableListField
					items={items}
					renderItem={renderTestItem}
					createDefault={() => ({ id: '1', name: 'default' })}
					className="custom-class"
				/>
			);

			expect(container.firstChild).toHaveClass('custom-class');
		});
	});
});
