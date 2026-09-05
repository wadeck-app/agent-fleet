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
		const [currentPage, setCurrentPage] = useState();

		return (
			<div>
				<div className="mb- rounded bg-muted p- text-sm">
					<p>
						<strong>Current Page:</strong> {currentPage} of 
					</p>
				</div>
				<Pagination currentPage={currentPage} totalPages={} onPageChange={setCurrentPage} />
			</div>
		);
	},
};

export const ManyPages: Story = {
	args: undefined as any,
	render: () => {
		const [currentPage, setCurrentPage] = useState();

		return (
			<div>
				<div className="mb- rounded bg-muted p- text-sm">
					<p>
						<strong>Current Page:</strong> {currentPage} of 
					</p>
				</div>
				<Pagination currentPage={currentPage} totalPages={} onPageChange={setCurrentPage} />
			</div>
		);
	},
};

export const FewPages: Story = {
	args: undefined as any,
	render: () => {
		const [currentPage, setCurrentPage] = useState();

		return (
			<div>
				<div className="mb- rounded bg-muted p- text-sm">
					<p>
						<strong>Current Page:</strong> {currentPage} of 
					</p>
				</div>
				<Pagination currentPage={currentPage} totalPages={} onPageChange={setCurrentPage} />
			</div>
		);
	},
};

export const WithoutFirstLast: Story = {
	args: undefined as any,
	render: () => {
		const [currentPage, setCurrentPage] = useState();

		return (
			<div>
				<div className="mb- rounded bg-muted p- text-sm">
					<p>
						<strong>Note:</strong> First/Last buttons are hidden
					</p>
					<p>
						<strong>Current Page:</strong> {currentPage} of 
					</p>
				</div>
				<Pagination
					currentPage={currentPage}
					totalPages={}
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
		const [currentPage, setCurrentPage] = useState();

		return (
			<div>
				<div className="mb- rounded bg-muted p- text-sm">
					<p>
						<strong>Note:</strong> Custom labels with icons
					</p>
					<p>
						<strong>Current Page:</strong> {currentPage} of 
					</p>
				</div>
				<Pagination
					currentPage={currentPage}
					totalPages={}
					onPageChange={setCurrentPage}
					firstLabel=" First"
					previousLabel=" Prev"
					nextLabel="Next "
					lastLabel="Last "
				/>
			</div>
		);
	},
};

export const LimitedVisiblePages: Story = {
	args: undefined as any,
	render: () => {
		const [currentPage, setCurrentPage] = useState();

		return (
			<div>
				<div className="mb- rounded bg-muted p- text-sm">
					<p>
						<strong>Note:</strong> Only  page numbers visible at a time
					</p>
					<p>
						<strong>Current Page:</strong> {currentPage} of 
					</p>
				</div>
				<Pagination
					currentPage={currentPage}
					totalPages={}
					onPageChange={setCurrentPage}
					maxVisiblePages={}
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
				<div className="mb- rounded bg-muted p- text-sm">
					<p>
						<strong>Note:</strong> All buttons are disabled
					</p>
				</div>
				<Pagination currentPage={} totalPages={} onPageChange={() => {}} disabled />
			</div>
		);
	},
};

export const AtFirstPage: Story = {
	args: undefined as any,
	render: () => {
		const [currentPage, setCurrentPage] = useState();

		return (
			<div>
				<div className="mb- rounded bg-muted p- text-sm">
					<p>
						<strong>Note:</strong> Previous/First buttons are disabled
					</p>
					<p>
						<strong>Current Page:</strong> {currentPage} of 
					</p>
				</div>
				<Pagination currentPage={currentPage} totalPages={} onPageChange={setCurrentPage} />
			</div>
		);
	},
};

export const AtLastPage: Story = {
	args: undefined as any,
	render: () => {
		const [currentPage, setCurrentPage] = useState();

		return (
			<div>
				<div className="mb- rounded bg-muted p- text-sm">
					<p>
						<strong>Note:</strong> Next/Last buttons are disabled
					</p>
					<p>
						<strong>Current Page:</strong> {currentPage} of 
					</p>
				</div>
				<Pagination currentPage={currentPage} totalPages={} onPageChange={setCurrentPage} />
			</div>
		);
	},
};

export const WithTable: Story = {
	args: undefined as any,
	render: () => {
		const [currentPage, setCurrentPage] = useState();
		const itemsPerPage = ;
		const totalItems = ;
		const totalPages = Math.ceil(totalItems / itemsPerPage);

		// Generate mock data
		const allItems = Array.from({ length: totalItems }, (_, i) => ({
			id: i + ,
			name: `Item ${i + }`,
			value: Math.floor(Math.random()  ),
		}));

		// Get items for current page
		const startIndex = (currentPage - )  itemsPerPage;
		const currentItems = allItems.slice(startIndex, startIndex + itemsPerPage);

		return (
			<div>
				<div className="mb- rounded bg-muted p- text-sm">
					<p>
						<strong>Showing:</strong> {startIndex + }-{Math.min(startIndex + itemsPerPage, totalItems)} of{' '}
						{totalItems} items
					</p>
				</div>

				<div className="overflow-hidden rounded-lg border border-border">
					<table className="w-full">
						<thead className="bg-muted/">
							<tr>
								<th
									className={`
           border-b border-border px- py- text-left text-sm font-medium
         `}
								>
									ID
								</th>
								<th
									className={`
           border-b border-border px- py- text-left text-sm font-medium
         `}
								>
									Name
								</th>
								<th
									className={`
           border-b border-border px- py- text-left text-sm font-medium
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
           last:border-b-
         `}
								>
									<td className="px- py- text-sm">{item.id}</td>
									<td className="px- py- text-sm">{item.name}</td>
									<td className="px- py- text-sm">{item.value}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<div className="mt-">
					<Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
				</div>
			</div>
		);
	},
};
