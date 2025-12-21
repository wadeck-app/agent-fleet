import { useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import type { Meta, StoryObj } from '@storybook/react';

import { Table, TableColumn } from './Table';

const meta: Meta<typeof Table> = {
	title: 'Components/Table',
	component: Table,
	tags: ['autodocs'],
	parameters: {
		layout: 'padded',
	},
};

export default meta;
type Story = StoryObj<typeof Table>;

// Mock data type
interface MockItem {
	id: string;
	name: string;
	email: string;
	role: string;
	status: string;
}

// Mock data
const mockData: MockItem[] = [
	{ id: '1', name: 'John Doe', email: 'john@example.com', role: 'Admin', status: 'Active' },
	{ id: '2', name: 'Jane Smith', email: 'jane@example.com', role: 'User', status: 'Active' },
	{ id: '3', name: 'Bob Johnson', email: 'bob@example.com', role: 'User', status: 'Inactive' },
	{
		id: '4',
		name: 'Alice Williams',
		email: 'alice@example.com',
		role: 'Manager',
		status: 'Active',
	},
	{
		id: '5',
		name: 'Charlie Brown',
		email: 'charlie@example.com',
		role: 'User',
		status: 'Active',
	},
];
export const Basic: Story = {
	args: undefined as any,
	render: () => {
		const columns: TableColumn<MockItem>[] = [
			{
				key: 'name',
				label: 'Name',
				render: item => <span className="font-medium">{item.name}</span>,
			},
			{ key: 'email', label: 'Email', render: item => item.email },
			{ key: 'role', label: 'Role', render: item => item.role },
			{ key: 'status', label: 'Status', render: item => item.status },
		];

		return <Table data={mockData} columns={columns} getItemId={item => item.id} />;
	},
};
export const WithSelection: Story = {
	args: undefined as any,
	render: () => {
		const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

		const columns: TableColumn<MockItem>[] = [
			{
				key: 'name',
				label: 'Name',
				render: item => <span className="font-medium">{item.name}</span>,
			},
			{ key: 'email', label: 'Email', render: item => item.email },
			{ key: 'role', label: 'Role', render: item => item.role },
		];

		return (
			<div>
				<div className="mb-4 rounded bg-muted p-4">
					<strong>Selected:</strong>{' '}
					{selectedIds.size === 0 ? (
						<span>None</span>
					) : (
						<span>
							{selectedIds.size} item(s) - IDs: {Array.from(selectedIds).join(', ')}
						</span>
					)}
					{selectedIds.size > 0 && (
						<button
							onClick={() => setSelectedIds(new Set())}
							className={`
         ml-4 rounded bg-primary px-2 py-1 text-sm text-primary-foreground
       `}
						>
							Clear
						</button>
					)}
				</div>
				<Table
					data={mockData}
					columns={columns}
					getItemId={item => item.id}
					selectable
					selectedIds={selectedIds}
					onSelectionChange={setSelectedIds}
				/>
			</div>
		);
	},
};
export const WithActions: Story = {
	args: undefined as any,
	render: () => {
		const [data, setData] = useState<MockItem[]>(mockData);
		const [editingId, setEditingId] = useState<string | null>(null);

		const columns: TableColumn<MockItem>[] = [
			{
				key: 'name',
				label: 'Name',
				render: item => <span className="font-medium">{item.name}</span>,
			},
			{ key: 'email', label: 'Email', render: item => item.email },
			{ key: 'role', label: 'Role', render: item => item.role },
		];

		const handleDelete = (id: string) => {
			setData(prev => prev.filter(item => item.id !== id));
		};

		return (
			<Table
				data={data}
				columns={columns}
				getItemId={item => item.id}
				editingId={editingId}
				renderActions={(item, isEditing) =>
					isEditing ? (
						<div className="flex justify-center gap-2">
							<Button size="sm" variant="default" onClick={() => setEditingId(null)}>
								Save
							</Button>
							<Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
								Cancel
							</Button>
						</div>
					) : (
						<div className="flex justify-center gap-2">
							<Button size="sm" variant="outline" onClick={() => setEditingId(item.id)}>
								Edit
							</Button>
							<Button size="sm" variant="destructive" onClick={() => handleDelete(item.id)}>
								Delete
							</Button>
						</div>
					)
				}
			/>
		);
	},
};
export const Empty: Story = {
	args: undefined as any,
	render: () => {
		const columns: TableColumn<MockItem>[] = [
			{ key: 'name', label: 'Name', render: item => item.name },
			{ key: 'email', label: 'Email', render: item => item.email },
		];

		return (
			<Table
				data={[]}
				columns={columns}
				getItemId={item => item.id}
				emptyMessage="No users found. Add your first user to get started."
			/>
		);
	},
};
export const Loading: Story = {
	args: undefined as any,
	render: () => {
		const columns: TableColumn<MockItem>[] = [
			{ key: 'name', label: 'Name', render: item => item.name },
			{ key: 'email', label: 'Email', render: item => item.email },
		];

		return (
			<Table
				data={[]}
				columns={columns}
				getItemId={item => item.id}
				loading={true}
				loadingMessage="Loading users..."
			/>
		);
	},
};
export const WithCustomRowClasses: Story = {
	args: undefined as any,
	render: () => {
		const columns: TableColumn<MockItem>[] = [
			{
				key: 'name',
				label: 'Name',
				render: item => <span className="font-medium">{item.name}</span>,
			},
			{ key: 'email', label: 'Email', render: item => item.email },
			{ key: 'role', label: 'Role', render: item => item.role },
			{
				key: 'status',
				label: 'Status',
				render: item => (
					<span
						className={
							item.status === 'Active'
								? `
          text-green-600
          dark:text-green-400
        `
								: `
          text-red-600
          dark:text-red-400
        `
						}
					>
						{item.status}
					</span>
				),
			},
		];

		return (
			<Table
				data={mockData}
				columns={columns}
				getItemId={item => item.id}
				getRowClassName={item => (item.status === 'Inactive' ? 'opacity-50' : '')}
			/>
		);
	},
};
export const LargeDataset: Story = {
	args: undefined as any,
	render: () => {
		const largeData = Array.from({ length: 50 }, (_, i) => ({
			id: String(i + 1),
			name: `User ${i + 1}`,
			email: `user${i + 1}@example.com`,
			role: i % 3 === 0 ? 'Admin' : i % 3 === 1 ? 'Manager' : 'User',
			status: i % 5 === 0 ? 'Inactive' : 'Active',
		}));

		const columns: TableColumn<MockItem>[] = [
			{
				key: 'name',
				label: 'Name',
				render: item => <span className="font-medium">{item.name}</span>,
			},
			{ key: 'email', label: 'Email', render: item => item.email },
			{ key: 'role', label: 'Role', render: item => item.role },
			{ key: 'status', label: 'Status', render: item => item.status },
		];

		return (
			<div className="max-h-[500px] overflow-auto">
				<Table data={largeData} columns={columns} getItemId={item => item.id} />
			</div>
		);
	},
};
