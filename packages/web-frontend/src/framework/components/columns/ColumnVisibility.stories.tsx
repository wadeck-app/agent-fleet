import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';

import { type ColumnDef, ColumnVisibility } from './ColumnVisibility';

/**
 * ColumnVisibility provides a dropdown menu for toggling column visibility in tables.
 *
 * Features:
 * - Checkbox for each column with accessibility support
 * - Show All / Hide All bulk actions
 * - Reset to Default button
 * - Visual badge showing visible/total count
 * - Support for columns that cannot be hidden
 * - Scrollable list for many columns
 *
 * Perfect for data tables where users want to customize which columns they see.
 */
const meta: Meta<typeof ColumnVisibility> = {
	title: 'Components/ColumnVisibility',
	component: ColumnVisibility,
	tags: ['autodocs'],
	parameters: {
		layout: 'centered',
	},
};

export default meta;
type Story = StoryObj<typeof ColumnVisibility>;

const basicColumns: ColumnDef[] = [
	{ id: 'id', label: 'ID' },
	{ id: 'name', label: 'Name' },
	{ id: 'email', label: 'Email' },
	{ id: 'phone', label: 'Phone' },
];

/**
 * Default state with all columns visible
 */
export const Default: Story = {
	args: {
		columns: basicColumns,
		visibleColumns: new Set(['id', 'name', 'email', 'phone']),
		onToggle: fn(),
		onReset: fn(),
		onShowAll: fn(),
		onHideAll: fn(),
	},
};

/**
 * Partial visibility - some columns are hidden
 * Notice the badge showing "2/4" visible columns
 */
export const PartialVisibility: Story = {
	args: {
		columns: basicColumns,
		visibleColumns: new Set(['id', 'name']),
		onToggle: fn(),
		onReset: fn(),
		onShowAll: fn(),
		onHideAll: fn(),
	},
};

/**
 * Custom label for the trigger button
 */
export const WithCustomLabel: Story = {
	args: {
		columns: basicColumns,
		visibleColumns: new Set(['id', 'name', 'email']),
		onToggle: fn(),
		onReset: fn(),
		onShowAll: fn(),
		onHideAll: fn(),
		label: 'Manage Columns',
	},
};

/**
 * Columns with canHide: false cannot be toggled off
 * The ID column is disabled and shows a tooltip
 */
export const WithDisabledColumns: Story = {
	args: {
		columns: [
			{ id: 'id', label: 'ID', canHide: false },
			{ id: 'name', label: 'Name' },
			{ id: 'email', label: 'Email' },
			{ id: 'phone', label: 'Phone' },
		],
		visibleColumns: new Set(['id', 'name', 'email', 'phone']),
		onToggle: fn(),
		onReset: fn(),
		onShowAll: fn(),
		onHideAll: fn(),
	},
};

/**
 * Minimal configuration without Show All / Hide All buttons
 */
export const MinimalButtons: Story = {
	args: {
		columns: basicColumns,
		visibleColumns: new Set(['id', 'name', 'email']),
		onToggle: fn(),
		onReset: fn(),
		// onShowAll and onHideAll are undefined
	},
};

/**
 * Many columns to demonstrate scrollable behavior
 */
export const ManyColumns: Story = {
	args: {
		columns: [
			{ id: 'id', label: 'ID', canHide: false },
			{ id: 'firstName', label: 'First Name' },
			{ id: 'lastName', label: 'Last Name' },
			{ id: 'email', label: 'Email' },
			{ id: 'phone', label: 'Phone' },
			{ id: 'address', label: 'Address' },
			{ id: 'city', label: 'City' },
			{ id: 'state', label: 'State' },
			{ id: 'zipCode', label: 'Zip Code' },
			{ id: 'country', label: 'Country' },
			{ id: 'company', label: 'Company' },
			{ id: 'jobTitle', label: 'Job Title' },
			{ id: 'department', label: 'Department' },
			{ id: 'salary', label: 'Salary' },
			{ id: 'startDate', label: 'Start Date' },
		],
		visibleColumns: new Set(['id', 'firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle']),
		onToggle: fn(),
		onReset: fn(),
		onShowAll: fn(),
		onHideAll: fn(),
	},
};

/**
 * Interactive demo with full state management
 * Try toggling columns, using Show All / Hide All, and Reset to Default
 */
export const Interactive: Story = {
	args: undefined as any,
	render: () => {
		const columns: ColumnDef[] = [
			{ id: 'id', label: 'ID', canHide: false },
			{ id: 'name', label: 'Name' },
			{ id: 'email', label: 'Email' },
			{ id: 'phone', label: 'Phone' },
			{ id: 'status', label: 'Status' },
		];

		const defaultVisible = new Set(['id', 'name', 'email']);
		const [visibleColumns, setVisibleColumns] = useState(defaultVisible);
		const [log, setLog] = useState<string[]>([]);

		const addLog = (message: string) => {
			setLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
		};

		const handleToggle = (columnId: string) => {
			setVisibleColumns(prev => {
				const next = new Set(prev);
				if (next.has(columnId)) {
					next.delete(columnId);
					addLog(`Hid column: ${columnId}`);
				} else {
					next.add(columnId);
					addLog(`Showed column: ${columnId}`);
				}
				return next;
			});
		};

		const handleShowAll = () => {
			setVisibleColumns(new Set(columns.map(c => c.id)));
			addLog('Showed all columns');
		};

		const handleHideAll = () => {
			setVisibleColumns(new Set());
			addLog('Hid all columns');
		};

		const handleReset = () => {
			setVisibleColumns(defaultVisible);
			addLog('Reset to default columns');
		};

		return (
			<div className="space-y-4">
				<div className="flex items-center gap-4">
					<ColumnVisibility
						columns={columns}
						visibleColumns={visibleColumns}
						onToggle={handleToggle}
						onReset={handleReset}
						onShowAll={handleShowAll}
						onHideAll={handleHideAll}
					/>
					<span className="text-sm text-muted-foreground">
						{visibleColumns.size} of {columns.length} columns visible
					</span>
				</div>

				<div className="rounded-md border border-border bg-muted p-4">
					<div className="mb-3 flex items-center justify-between">
						<span className="text-sm font-medium">Visible Columns</span>
						<span className="text-xs text-muted-foreground">{visibleColumns.size} visible</span>
					</div>
					<div className="space-y-1">
						{columns.map(column => (
							<div
								key={column.id}
								className={`
          text-sm
          ${
				visibleColumns.has(column.id)
					? 'text-foreground'
					: `
            text-muted-foreground line-through
          `
			}
        `}
							>
								{column.label}
								{column.canHide === false && ' (required)'}
							</div>
						))}
					</div>
				</div>

				<div className="rounded-md border border-border bg-card p-4">
					<div className="mb-3 flex items-center justify-between">
						<span className="text-sm font-medium">Event Log</span>
						<button
							onClick={() => setLog([])}
							className={`
         text-xs text-muted-foreground
         hover:text-foreground
       `}
						>
							Clear log
						</button>
					</div>
					<div className="max-h-48 space-y-1 overflow-auto font-mono text-xs">
						{log.length === 0 ? (
							<div className="text-muted-foreground">No events yet. Try toggling columns!</div>
						) : (
							log.map((entry, i) => (
								<div key={i} className="text-foreground">
									{entry}
								</div>
							))
						)}
					</div>
				</div>
			</div>
		);
	},
};

/**
 * In table context - real-world usage example
 */
export const InTableContext: Story = {
	args: undefined as any,
	render: () => {
		const columns: ColumnDef[] = [
			{ id: 'id', label: 'ID', canHide: false },
			{ id: 'title', label: 'Title' },
			{ id: 'author', label: 'Author' },
			{ id: 'genre', label: 'Genre' },
			{ id: 'pages', label: 'Pages' },
			{ id: 'year', label: 'Year' },
		];

		const defaultVisible = new Set(['id', 'title', 'author', 'genre']);
		const [visibleColumns, setVisibleColumns] = useState(defaultVisible);

		const handleToggle = (columnId: string) => {
			setVisibleColumns(prev => {
				const next = new Set(prev);
				if (next.has(columnId)) {
					next.delete(columnId);
				} else {
					next.add(columnId);
				}
				return next;
			});
		};

		const handleShowAll = () => {
			setVisibleColumns(new Set(columns.map(c => c.id)));
		};

		const handleHideAll = () => {
			// Keep columns with canHide: false visible
			setVisibleColumns(new Set(columns.filter(c => c.canHide === false).map(c => c.id)));
		};

		const handleReset = () => {
			setVisibleColumns(defaultVisible);
		};

		const books = [
			{
				id: 1,
				title: 'The Pragmatic Programmer',
				author: 'Hunt & Thomas',
				genre: 'Programming',
				pages: 352,
				year: 1999,
			},
			{
				id: 2,
				title: 'Clean Code',
				author: 'Robert C. Martin',
				genre: 'Programming',
				pages: 464,
				year: 2008,
			},
			{
				id: 3,
				title: 'Refactoring',
				author: 'Martin Fowler',
				genre: 'Programming',
				pages: 448,
				year: 1999,
			},
		];

		return (
			<div className="w-full max-w-4xl space-y-4">
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-semibold">Books</h3>
					<ColumnVisibility
						columns={columns}
						visibleColumns={visibleColumns}
						onToggle={handleToggle}
						onReset={handleReset}
						onShowAll={handleShowAll}
						onHideAll={handleHideAll}
					/>
				</div>

				<div className="overflow-hidden rounded-md border border-border">
					<table className="w-full">
						<thead className="bg-muted">
							<tr>
								{columns
									.filter(col => visibleColumns.has(col.id))
									.map(col => (
										<th key={col.id} className="p-3 text-left text-sm font-medium">
											{col.label}
										</th>
									))}
							</tr>
						</thead>
						<tbody>
							{books.map(book => (
								<tr key={book.id} className="border-t border-border">
									{visibleColumns.has('id') && <td className="p-3 text-sm">{book.id}</td>}
									{visibleColumns.has('title') && <td className="p-3 text-sm">{book.title}</td>}
									{visibleColumns.has('author') && <td className="p-3 text-sm">{book.author}</td>}
									{visibleColumns.has('genre') && <td className="p-3 text-sm">{book.genre}</td>}
									{visibleColumns.has('pages') && <td className="p-3 text-sm">{book.pages}</td>}
									{visibleColumns.has('year') && <td className="p-3 text-sm">{book.year}</td>}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		);
	},
};

/**
 * Modified columns show visual indicators
 * - Small dot indicator next to modified column names
 * - Per-column reset button (undo icon) for modified columns
 * - Global "Reset to Default" still available
 *
 * In this example:
 * - Phone was hidden (default visible) → shows modified indicator
 * - Address was shown (default hidden) → shows modified indicator
 */
export const WithModifiedColumns: Story = {
	args: {
		columns: [
			{ id: 'id', label: 'ID', canHide: false },
			{ id: 'name', label: 'Name' },
			{ id: 'email', label: 'Email' },
			{ id: 'phone', label: 'Phone' },
			{ id: 'address', label: 'Address' },
		],
		// Current state: phone hidden (was default visible), address shown (was default hidden)
		visibleColumns: new Set(['id', 'name', 'email', 'address']),
		// Default state
		defaultVisible: new Set(['id', 'name', 'email', 'phone']),
		onToggle: fn(),
		onReset: fn(),
		onShowAll: fn(),
		onHideAll: fn(),
	},
};

/**
 * Interactive demo with modified state tracking
 * - Shows how indicators appear when columns are toggled
 * - Demonstrates per-column reset functionality
 * - Compare with global reset behavior
 */
export const InteractiveWithModifiedState: Story = {
	args: undefined as any,
	render: () => {
		const columns: ColumnDef[] = [
			{ id: 'id', label: 'ID', canHide: false },
			{ id: 'name', label: 'Name' },
			{ id: 'email', label: 'Email' },
			{ id: 'phone', label: 'Phone' },
			{ id: 'status', label: 'Status' },
			{ id: 'department', label: 'Department' },
		];

		const defaultVisible = new Set(['id', 'name', 'email', 'phone']);
		const [visibleColumns, setVisibleColumns] = useState(defaultVisible);
		const [log, setLog] = useState<string[]>([]);

		const addLog = (message: string) => {
			setLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
		};

		const handleToggle = (columnId: string) => {
			setVisibleColumns(prev => {
				const next = new Set(prev);
				if (next.has(columnId)) {
					next.delete(columnId);
					addLog(`Hid column: ${columnId}`);
				} else {
					next.add(columnId);
					addLog(`Showed column: ${columnId}`);
				}
				return next;
			});
		};

		// Calculate modified columns
		const modifiedColumns = columns
			.filter(col => {
				const isVisible = visibleColumns.has(col.id);
				const isDefault = defaultVisible.has(col.id);
				return isVisible !== isDefault;
			})
			.map(col => col.label);

		const handleShowAll = () => {
			setVisibleColumns(new Set(columns.map(c => c.id)));
			addLog('Showed all columns');
		};

		const handleHideAll = () => {
			setVisibleColumns(new Set());
			addLog('Hid all columns');
		};

		const handleReset = () => {
			setVisibleColumns(defaultVisible);
			addLog('Reset to default columns');
		};

		return (
			<div className="space-y-4">
				<div className="flex items-center gap-4">
					<ColumnVisibility
						columns={columns}
						visibleColumns={visibleColumns}
						defaultVisible={defaultVisible}
						onToggle={handleToggle}
						onReset={handleReset}
						onShowAll={handleShowAll}
						onHideAll={handleHideAll}
					/>
					<span className="text-sm text-muted-foreground">
						{visibleColumns.size} of {columns.length} visible
						{modifiedColumns.length > 0 && (
							<span className="ml-2 text-primary">({modifiedColumns.length} modified)</span>
						)}
					</span>
				</div>

				{modifiedColumns.length > 0 && (
					<div className="rounded-md border border-primary/20 bg-primary/5 p-3">
						<div className="text-sm font-medium text-primary">Modified Columns</div>
						<div className="mt-1 text-xs text-muted-foreground">{modifiedColumns.join(', ')}</div>
					</div>
				)}

				<div className="rounded-md border border-border bg-muted p-4">
					<div className="mb-3 flex items-center justify-between">
						<span className="text-sm font-medium">Current State</span>
						<span className="text-xs text-muted-foreground">{visibleColumns.size} visible</span>
					</div>
					<div className="space-y-1">
						{columns.map(column => {
							const isVisible = visibleColumns.has(column.id);
							const isDefault = defaultVisible.has(column.id);
							const isModified = isVisible !== isDefault;

							return (
								<div
									key={column.id}
									className={`
           flex items-center gap-2 text-sm
           ${
				isVisible
					? `text-foreground`
					: `
             text-muted-foreground line-through
           `
			}
         `}
								>
									{column.label}
									{column.canHide === false && ' (required)'}
									{isModified && (
										<span
											className={`
             rounded-md bg-primary/10 px-1.5 py-0.5 text-xs text-primary
           `}
										>
											modified
										</span>
									)}
								</div>
							);
						})}
					</div>
				</div>

				<div className="rounded-md border border-border bg-card p-4">
					<div className="mb-3 flex items-center justify-between">
						<span className="text-sm font-medium">Event Log</span>
						<button
							onClick={() => setLog([])}
							className={`
         text-xs text-muted-foreground
         hover:text-foreground
       `}
						>
							Clear log
						</button>
					</div>
					<div className="max-h-48 space-y-1 overflow-auto font-mono text-xs">
						{log.length === 0 ? (
							<div className="text-muted-foreground">
								Toggle columns to see modified state indicators!
							</div>
						) : (
							log.map((entry, i) => (
								<div key={i} className="text-foreground">
									{entry}
								</div>
							))
						)}
					</div>
				</div>
			</div>
		);
	},
};
