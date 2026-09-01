import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { PageSizeSelector, type PageSizeSelectorProps } from './PageSizeSelector';

const meta: Meta<typeof PageSizeSelector> = {
	title: 'UI/PageSizeSelector',
	component: PageSizeSelector,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		value: {
			control: 'number',
			description: 'Current page size value',
		},
		onChange: {
			action: 'changed',
			description: 'Callback when page size changes',
		},
		options: {
			control: 'object',
			description: 'Available page size options',
		},
		disabled: {
			control: 'boolean',
			description: 'Disabled state',
		},
		label: {
			control: 'text',
			description: 'Label text',
		},
		showLabel: {
			control: 'boolean',
			description: 'Show label',
		},
		size: {
			control: 'select',
			options: ['sm', 'default'],
			description: 'Size variant',
		},
	},
};

export default meta;
type Story = StoryObj<typeof PageSizeSelector>;

// Helper component for interactive stories
function InteractivePageSizeSelector(props: Partial<Omit<PageSizeSelectorProps, 'value' | 'onChange'>>) {
	const [pageSize, setPageSize] = useState(10);
	return <PageSizeSelector value={pageSize} onChange={setPageSize} {...props} />;
}

export const Default: Story = {
	render: () => <InteractivePageSizeSelector />,
	parameters: {
		docs: {
			description: {
				story: 'Default page size selector with standard options (5, 10, 20, 50).',
			},
		},
	},
};

export const CustomOptions: Story = {
	render: () => <InteractivePageSizeSelector options={[10, 25, 50, 100]} />,
	parameters: {
		docs: {
			description: {
				story: 'Page size selector with custom options.',
			},
		},
	},
};

export const CustomLabel: Story = {
	render: () => <InteractivePageSizeSelector label="Rows per page:" />,
	parameters: {
		docs: {
			description: {
				story: 'Page size selector with custom label text.',
			},
		},
	},
};

export const WithoutLabel: Story = {
	render: () => <InteractivePageSizeSelector showLabel={false} aria-label="Select page size" />,
	parameters: {
		docs: {
			description: {
				story: 'Page size selector without visible label (uses aria-label for accessibility).',
			},
		},
	},
};

export const SmallSize: Story = {
	render: () => <InteractivePageSizeSelector size="sm" />,
	parameters: {
		docs: {
			description: {
				story: 'Small size variant (default), optimized for pagination controls.',
			},
		},
	},
};

export const DefaultSize: Story = {
	render: () => <InteractivePageSizeSelector size="default" />,
	parameters: {
		docs: {
			description: {
				story: 'Default size variant, larger than small size.',
			},
		},
	},
};

export const Disabled: Story = {
	render: () => <InteractivePageSizeSelector disabled />,
	parameters: {
		docs: {
			description: {
				story: 'Disabled state - user cannot interact with the selector.',
			},
		},
	},
};

export const WithPaginationContext: Story = {
	render: () => {
		const [pageSize, setPageSize] = useState(10);
		const [currentPage, setCurrentPage] = useState(1);

		const totalItems = 127;
		const totalPages = Math.ceil(totalItems / pageSize);
		const startItem = (currentPage - 1) * pageSize + 1;
		const endItem = Math.min(currentPage * pageSize, totalItems);

		return (
			<div className="space-y-4">
				{/* Sample data display */}
				<div className="w-[600px] rounded-lg border p-4">
					<div className="mb-2 text-sm font-medium">Sample Data</div>
					<div className="space-y-1 text-sm text-muted-foreground">
						{Array.from({ length: endItem - startItem + 1 }).map((_, i) => (
							<div key={i}>Item {startItem + i}</div>
						))}
					</div>
				</div>

				{/* Pagination controls */}
				<div className="flex items-center justify-between gap-4 border-t pt-3">
					<div className="text-sm text-muted-foreground">
						Showing {startItem}-{endItem} of {totalItems}
					</div>

					<div className="flex items-center gap-4">
						<PageSizeSelector
							value={pageSize}
							onChange={newSize => {
								setPageSize(newSize);
								setCurrentPage(1); // Reset to page 1 when size changes
							}}
						/>
						<div className="text-sm text-muted-foreground">
							Page {currentPage} of {totalPages}
						</div>
						<div className="flex gap-1">
							// violations-suppress: react/no-raw-button story fixture
							<button
								onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
								disabled={currentPage === 1}
								className={`
          rounded border px-3 py-1 text-sm
          disabled:opacity-50
        `}
							>
								Previous
							</button>
							// violations-suppress: react/no-raw-button story fixture
							<button
								onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
								disabled={currentPage === totalPages}
								className={`
          rounded border px-3 py-1 text-sm
          disabled:opacity-50
        `}
							>
								Next
							</button>
						</div>
					</div>
				</div>
			</div>
		);
	},
	parameters: {
		docs: {
			description: {
				story: 'Page size selector integrated with pagination controls. Notice how changing the page size resets to page 1.',
			},
		},
	},
};

export const MinimalOptions: Story = {
	render: () => <InteractivePageSizeSelector options={[5, 10]} />,
	parameters: {
		docs: {
			description: {
				story: 'Page size selector with minimal options.',
			},
		},
	},
};

export const LargeDatasetOptions: Story = {
	render: () => <InteractivePageSizeSelector options={[25, 50, 100, 200, 500]} />,
	parameters: {
		docs: {
			description: {
				story: 'Page size selector for large datasets with higher page size options.',
			},
		},
	},
};
