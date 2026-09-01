import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { SearchInput } from './SearchInput';

const meta: Meta<typeof SearchInput> = {
	title: 'Components/SearchInput',
	component: SearchInput,
	tags: ['autodocs'],
	parameters: {
		layout: 'padded',
	},
	argTypes: {
		debounceMs: {
			control: { type: 'number', min: 0, max: 2000, step: 100 },
		},
	},
};

export default meta;
type Story = StoryObj<typeof SearchInput>;

export const Default: Story = {
	args: undefined as any,
	render: () => {
		const [value, setValue] = useState('');

		return (
			<div className="w-full max-w-md">
				<SearchInput value={value} onChange={setValue} />
				<div className="mt-4 text-sm text-muted-foreground">
					Current value: <span className="font-medium">{value || '(empty)'}</span>
				</div>
			</div>
		);
	},
};

export const WithValue: Story = {
	args: undefined as any,
	render: () => {
		const [value, setValue] = useState('React components');

		return (
			<div className="w-full max-w-md">
				<SearchInput value={value} onChange={setValue} />
				<div className="mt-4 text-sm text-muted-foreground">
					Current value: <span className="font-medium">{value}</span>
				</div>
			</div>
		);
	},
};

export const CustomPlaceholder: Story = {
	args: undefined as any,
	render: () => {
		const [value, setValue] = useState('');

		return (
			<div className="w-full max-w-md">
				<SearchInput
					value={value}
					onChange={setValue}
					placeholder="Search books by title or author..."
					aria-label="Search books"
				/>
				<div className="mt-4 text-sm text-muted-foreground">
					Current value: <span className="font-medium">{value || '(empty)'}</span>
				</div>
			</div>
		);
	},
};

export const Disabled: Story = {
	args: undefined as any,
	render: () => {
		const [value, setValue] = useState('Cannot edit this');

		return (
			<div className="w-full max-w-md">
				<SearchInput value={value} onChange={setValue} disabled />
				<div className="mt-4 text-sm text-muted-foreground">The input is disabled and cannot be edited.</div>
			</div>
		);
	},
};

export const FastDebounce: Story = {
	args: undefined as any,
	render: () => {
		const [value, setValue] = useState('');
		const [debouncedValue, setDebouncedValue] = useState('');

		const handleChange = (newValue: string) => {
			setValue(newValue);
			// In real usage, this would be the debounced callback
			setTimeout(() => setDebouncedValue(newValue), 200);
		};

		return (
			<div className="w-full max-w-md">
				<SearchInput value={value} onChange={handleChange} debounceMs={200} />
				<div className="mt-4 space-y-2 text-sm">
					<div className="text-muted-foreground">
						Immediate value: <span className="font-medium">{value || '(empty)'}</span>
					</div>
					<div className="text-muted-foreground">
						Debounced value (200ms): <span className="font-medium">{debouncedValue || '(empty)'}</span>
					</div>
					<p className="text-xs text-muted-foreground">
						Type quickly to see the debouncing effect. The "Debounced value" updates 200ms after you stop
						typing.
					</p>
				</div>
			</div>
		);
	},
};

export const Interactive: Story = {
	args: undefined as any,
	render: () => {
		const [value, setValue] = useState('');
		const [log, setLog] = useState<string[]>([]);

		const handleChange = (newValue: string) => {
			setValue(newValue);
			setLog(prev => [...prev, `onChange: "${newValue}" at ${new Date().toLocaleTimeString()}`]);
		};

		const handleClear = () => {
			setLog(prev => [...prev, `onClear called at ${new Date().toLocaleTimeString()}`]);
		};

		return (
			<div className="w-full max-w-md">
				<SearchInput value={value} onChange={handleChange} onClear={handleClear} debounceMs={400} />
				<div className="mt-4 space-y-2">
					<div className="text-sm text-muted-foreground">
						Current value: <span className="font-medium">{value || '(empty)'}</span>
					</div>
					<div className="rounded-md border border-border bg-muted p-3">
						<div className="mb-2 flex items-center justify-between">
							<span className="text-sm font-medium">Event Log</span>
							// violations-suppress: react/no-raw-button story fixture
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
								<div className="text-muted-foreground">No events yet. Start typing!</div>
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
			</div>
		);
	},
};

export const InFormContext: Story = {
	args: undefined as any,
	render: () => {
		const [searchTerm, setSearchTerm] = useState('');
		const [results, setResults] = useState<string[]>([]);
		const [isSearching, setIsSearching] = useState(false);

		const handleSearch = (term: string) => {
			setSearchTerm(term);

			if (!term) {
				setResults([]);
				return;
			}

			// Simulate async search
			setIsSearching(true);
			setTimeout(() => {
				const mockResults = [
					'React Essentials',
					'Advanced React Patterns',
					'React Testing Guide',
					'Modern React with TypeScript',
					'React Performance Optimization',
				].filter(item => item.toLowerCase().includes(term.toLowerCase()));

				setResults(mockResults);
				setIsSearching(false);
			}, 300);
		};

		return (
			<div className="w-full max-w-md">
				<div className="space-y-4">
					<div>
						<label htmlFor="book-search" className="mb-2 block text-sm font-medium">
							Search Books
						</label>
						<SearchInput
							id="book-search"
							value={searchTerm}
							onChange={handleSearch}
							placeholder="Enter book title..."
							aria-label="Search books"
						/>
					</div>

					{searchTerm && (
						<div className="rounded-md border border-border bg-card p-4">
							<div className="mb-3 flex items-center justify-between">
								<span className="text-sm font-medium">
									Search Results{' '}
									{isSearching && <span className="text-muted-foreground">(searching...)</span>}
								</span>
								<span className="text-xs text-muted-foreground">{results.length} found</span>
							</div>

							{results.length === 0 && !isSearching ? (
								<div className="text-sm text-muted-foreground">
									No books found matching "{searchTerm}"
								</div>
							) : (
								<ul className="space-y-2">
									{results.map(result => (
										<li key={result} className="rounded-md bg-muted p-2 text-sm">
											{result}
										</li>
									))}
								</ul>
							)}
						</div>
					)}
				</div>
			</div>
		);
	},
};

export const MultipleSearches: Story = {
	args: undefined as any,
	render: () => {
		const [bookSearch, setBookSearch] = useState('');
		const [authorSearch, setAuthorSearch] = useState('');

		return (
			<div className="w-full max-w-md space-y-6">
				<div>
					<label className="mb-2 block text-sm font-medium">Search by Book Title</label>
					<SearchInput
						value={bookSearch}
						onChange={setBookSearch}
						placeholder="Enter book title..."
						aria-label="Search by book title"
					/>
					<div className="mt-2 text-xs text-muted-foreground">Value: {bookSearch || '(empty)'}</div>
				</div>

				<div>
					<label className="mb-2 block text-sm font-medium">Search by Author</label>
					<SearchInput
						value={authorSearch}
						onChange={setAuthorSearch}
						placeholder="Enter author name..."
						aria-label="Search by author"
					/>
					<div className="mt-2 text-xs text-muted-foreground">Value: {authorSearch || '(empty)'}</div>
				</div>

				<div className="rounded-md border border-border bg-muted p-3">
					<div className="text-sm font-medium">Active Filters</div>
					<div className="mt-2 space-y-1 text-sm text-muted-foreground">
						{!bookSearch && !authorSearch && <div>No filters applied</div>}
						{bookSearch && <div>Title: "{bookSearch}"</div>}
						{authorSearch && <div>Author: "{authorSearch}"</div>}
					</div>
				</div>
			</div>
		);
	},
};
