import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { Pagination } from './Pagination';

const meta: Meta<typeof Pagination> = {
	title: 'Components/Pagination',
	component: Pagination,
	tags: ['autodocs'],
	parameters: {
		layout: 'padded',
	},
};

export default meta;
type Story = StoryObj<typeof Pagination>;

export const Default: Story = {
	args: undefined as any,
	render: () => {
		const [currentPage, setCurrentPage] = useState(1);

		return (
			<div>
				<div className="mb-4 rounded bg-muted p-4 text-sm">
					<p>
						<strong>Current Page:</strong> {currentPage} of 10
					</p>
				</div>
				<Pagination currentPage={currentPage} totalPages={10} onPageChange={setCurrentPage} />
			</div>
		);
	},
};

export const ManyPages: Story = {
	args: undefined as any,
	render: () => {
		const [currentPage, setCurrentPage] = useState(15);

		return (
			<div>
				<div className="mb-4 rounded bg-muted p-4 text-sm">
					<p>
						<strong>Current Page:</strong> {currentPage} of 50
					</p>
				</div>
				<Pagination currentPage={currentPage} totalPages={50} onPageChange={setCurrentPage} />
			</div>
		);
	},
};

export const FewPages: Story = {
	args: undefined as any,
	render: () => {
		const [currentPage, setCurrentPage] = useState(1);

		return (
			<div>
				<div className="mb-4 rounded bg-muted p-4 text-sm">
					<p>
						<strong>Current Page:</strong> {currentPage} of 3
					</p>
				</div>
				<Pagination currentPage={currentPage} totalPages={3} onPageChange={setCurrentPage} />
			</div>
		);
	},
};

export const WithoutFirstLast: Story = {
	args: undefined as any,
	render: () => {
		const [currentPage, setCurrentPage] = useState(5);

		return (
			<div>
				<div className="mb-4 rounded bg-muted p-4 text-sm">
					<p>
						<strong>Note:</strong> First/Last buttons are hidden
					</p>
					<p>
						<strong>Current Page:</strong> {currentPage} of 20
					</p>
				</div>
				<Pagination
					currentPage={currentPage}
					totalPages={20}
					onPageChange={setCurrentPage}
					showFirstLast={false}
				/>
			</div>
		);
	},
};

export const CustomLabels: Story = {
	args: undefined as any,
	render: () => {
		const [currentPage, setCurrentPage] = useState(1);

		return (
			<div>
				<div className="mb-4 rounded bg-muted p-4 text-sm">
					<p>
						<strong>Note:</strong> Custom labels with icons
					</p>
					<p>
						<strong>Current Page:</strong> {currentPage} of 10
					</p>
				</div>
				<Pagination
					currentPage={currentPage}
					totalPages={10}
					onPageChange={setCurrentPage}
					firstLabel="⏮️ First"
					previousLabel="⬅️ Prev"
					nextLabel="Next ➡️"
					lastLabel="Last ⏭️"
				/>
			</div>
		);
	},
};

export const LimitedVisiblePages: Story = {
	args: undefined as any,
	render: () => {
		const [currentPage, setCurrentPage] = useState(10);

		return (
			<div>
				<div className="mb-4 rounded bg-muted p-4 text-sm">
					<p>
						<strong>Note:</strong> Only 5 page numbers visible at a time
					</p>
					<p>
						<strong>Current Page:</strong> {currentPage} of 50
					</p>
				</div>
				<Pagination
					currentPage={currentPage}
					totalPages={50}
					onPageChange={setCurrentPage}
					maxVisiblePages={5}
				/>
			</div>
		);
	},
};

export const Disabled: Story = {
	args: undefined as any,
	render: () => {
		return (
			<div>
				<div className="mb-4 rounded bg-muted p-4 text-sm">
					<p>
						<strong>Note:</strong> All buttons are disabled
					</p>
				</div>
				<Pagination currentPage={5} totalPages={10} onPageChange={() => {}} disabled />
			</div>
		);
	},
};

export const AtFirstPage: Story = {
	args: undefined as any,
	render: () => {
		const [currentPage, setCurrentPage] = useState(1);

		return (
			<div>
				<div className="mb-4 rounded bg-muted p-4 text-sm">
					<p>
						<strong>Note:</strong> Previous/First buttons are disabled
					</p>
					<p>
						<strong>Current Page:</strong> {currentPage} of 10
					</p>
				</div>
				<Pagination currentPage={currentPage} totalPages={10} onPageChange={setCurrentPage} />
			</div>
		);
	},
};

export const AtLastPage: Story = {
	args: undefined as any,
	render: () => {
		const [currentPage, setCurrentPage] = useState(10);

		return (
			<div>
				<div className="mb-4 rounded bg-muted p-4 text-sm">
					<p>
						<strong>Note:</strong> Next/Last buttons are disabled
					</p>
					<p>
						<strong>Current Page:</strong> {currentPage} of 10
					</p>
				</div>
				<Pagination currentPage={currentPage} totalPages={10} onPageChange={setCurrentPage} />
			</div>
		);
	},
};

export const WithTable: Story = {
	args: undefined as any,
	render: () => {
		const [currentPage, setCurrentPage] = useState(1);
		const itemsPerPage = 5;
		const totalItems = 47;
		const totalPages = Math.ceil(totalItems / itemsPerPage);

		// Generate mock data
		const allItems = Array.from({ length: totalItems }, (_, i) => ({
			id: i + 1,
			name: `Item ${i + 1}`,
			value: Math.floor(Math.random() * 100),
		}));

		// Get items for current page
		const startIndex = (currentPage - 1) * itemsPerPage;
		const currentItems = allItems.slice(startIndex, startIndex + itemsPerPage);

		return (
			<div>
				<div className="mb-4 rounded bg-muted p-4 text-sm">
					<p>
						<strong>Showing:</strong> {startIndex + 1}-{Math.min(startIndex + itemsPerPage, totalItems)} of{' '}
						{totalItems} items
					</p>
				</div>

				<div className="overflow-hidden rounded-lg border border-border">
					<table className="w-full">
						<thead className="bg-muted/50">
							<tr>
								<th
									className={`
          border-b border-border px-4 py-2 text-left text-sm font-medium
        `}
								>
									ID
								</th>
								<th
									className={`
          border-b border-border px-4 py-2 text-left text-sm font-medium
        `}
								>
									Name
								</th>
								<th
									className={`
          border-b border-border px-4 py-2 text-left text-sm font-medium
        `}
								>
									Value
								</th>
							</tr>
						</thead>
						<tbody>
							{currentItems.map(item => (
								<tr
									key={item.id}
									className={`
          border-b border-border
          last:border-b-0
        `}
								>
									<td className="px-4 py-2 text-sm">{item.id}</td>
									<td className="px-4 py-2 text-sm">{item.name}</td>
									<td className="px-4 py-2 text-sm">{item.value}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<div className="mt-4">
					<Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
				</div>
			</div>
		);
	},
};
