import type { FeatureContract } from '@framework/types/FeatureContract';
import type { QueryResultDisplayerProps } from '@framework/types/QueryResultDisplayerContract';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Data2 } from './Data2';

describe('Data2', () => {
	// Mock feature for testing (returns separated props for new API)
	const createMockFeature = <TQuery extends Record<string, unknown>>(query: TQuery, state: any = {}) => {
		const fstate = state; // Stable reference
		const actions = {}; // Stable reference
		const toQuery = vi.fn(() => query); // Changes when query changes

		return {
			state,
			fstate,
			actions,
			toQuery,
		};
	};

	// Helper to spread feature props for Data2 (makes tests more readable)
	const spreadFeatureProps = (feature: any, prefix: 'pagination' | 'sorting' | 'search' | 'filter') => {
		if (!feature) return {};

		const result: any = {};
		result[`${prefix}ToQuery`] = feature.toQuery;
		result[`${prefix}Actions`] = feature.actions;
		result[`${prefix}Fstate`] = feature.fstate;
		return result;
	};

	// Mock displayer component
	const TestDisplayer = ({ data, isLoading, error }: QueryResultDisplayerProps<any>) => (
		<div>
			<div data-testid="loading">{isLoading ? 'loading' : 'not-loading'}</div>
			<div data-testid="error">{error || 'no-error'}</div>
			<div data-testid="data">{JSON.stringify(data)}</div>
		</div>
	);

	describe('query composition', () => {
		it('should fetch data with composed query from multiple features', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				items: [{ id: '1', name: 'Test' }],
				pagination: { total: 1, page: 1, pageSize: 10, totalPages: 1 },
			});

			const pagination = createMockFeature({ page: 1, pageSize: 10 });
			const sorting = createMockFeature({ sortBy: 'name', sortOrder: 'asc' });
			const search = createMockFeature({ search: 'chicken' });

			render(
				<Data2
					fetchData={mockFetch}
					{...spreadFeatureProps(pagination, 'pagination')}
					{...spreadFeatureProps(sorting, 'sorting')}
					{...spreadFeatureProps(search, 'search')}
				>
					<TestDisplayer data={[]} isLoading={false} error={null} />
				</Data2>
			);

			await waitFor(() => {
				expect(mockFetch).toHaveBeenCalledWith({
					page: 1,
					pageSize: 10,
					sortBy: 'name',
					sortOrder: 'asc',
					search: 'chicken',
				});
			});
		});

		it('should filter out empty feature queries', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				items: [],
			});

			const pagination = createMockFeature({ page: 1, pageSize: 10 });
			const search = createMockFeature({}); // Empty search

			render(
				<Data2
					fetchData={mockFetch}
					{...spreadFeatureProps(pagination, 'pagination')}
					{...spreadFeatureProps(search, 'search')}
				>
					<TestDisplayer data={[]} isLoading={false} error={null} />
				</Data2>
			);

			await waitFor(() => {
				expect(mockFetch).toHaveBeenCalledWith({
					page: 1,
					pageSize: 10,
				});
			});
		});

		it('should handle undefined features gracefully', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				items: [],
			});

			const pagination = createMockFeature({ page: 1, pageSize: 10 });

			render(
				<Data2 fetchData={mockFetch} {...spreadFeatureProps(pagination, 'pagination')}>
					<TestDisplayer data={[]} isLoading={false} error={null} />
				</Data2>
			);

			await waitFor(() => {
				expect(mockFetch).toHaveBeenCalledWith({
					page: 1,
					pageSize: 10,
				});
			});
		});
	});

	describe('data fetching', () => {
		it('should display loading state initially', () => {
			const mockFetch = vi.fn().mockImplementation(
				() => new Promise(() => {}) // Never resolves
			);

			render(
				<Data2 fetchData={mockFetch}>
					<TestDisplayer data={[]} isLoading={false} error={null} />
				</Data2>
			);

			expect(screen.getByText('Loading...')).toBeInTheDocument();
		});

		it('should display custom loading component when provided', () => {
			const mockFetch = vi.fn().mockImplementation(
				() => new Promise(() => {}) // Never resolves
			);

			render(
				<Data2
					fetchData={mockFetch}
					loadingComponent={<div data-testid="custom-loader">Custom Loading...</div>}
				>
					<TestDisplayer data={[]} isLoading={false} error={null} />
				</Data2>
			);

			expect(screen.getByTestId('custom-loader')).toBeInTheDocument();
		});

		it('should display data after successful fetch', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				items: [
					{ id: '1', name: 'Item 1' },
					{ id: '2', name: 'Item 2' },
				],
			});

			render(
				<Data2 fetchData={mockFetch}>
					<TestDisplayer data={[]} isLoading={false} error={null} />
				</Data2>
			);

			await waitFor(() => {
				const dataElement = screen.getByTestId('data');
				expect(JSON.parse(dataElement.textContent!)).toHaveLength(2);
			});
		});

		it('should display error after failed fetch', async () => {
			const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

			render(
				<Data2 fetchData={mockFetch}>
					<TestDisplayer data={[]} isLoading={false} error={null} />
				</Data2>
			);

			await waitFor(() => {
				expect(screen.getByText('Error loading data')).toBeInTheDocument();
				expect(screen.getByText('Network error')).toBeInTheDocument();
			});
		});

		it('should display custom error component when provided', async () => {
			const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

			render(
				<Data2
					fetchData={mockFetch}
					errorComponent={error => <div data-testid="custom-error">Custom: {error}</div>}
				>
					<TestDisplayer data={[]} isLoading={false} error={null} />
				</Data2>
			);

			await waitFor(() => {
				expect(screen.getByTestId('custom-error')).toBeInTheDocument();
				expect(screen.getByText('Custom: Network error')).toBeInTheDocument();
			});
		});
	});

	describe('prop injection (cloneElement)', () => {
		it('should inject data props into child component', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				items: [{ id: '1', name: 'Test' }],
			});

			render(
				<Data2 fetchData={mockFetch}>
					<TestDisplayer data={[]} isLoading={false} error={null} />
				</Data2>
			);

			await waitFor(() => {
				expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
				expect(screen.getByTestId('error')).toHaveTextContent('no-error');
				const dataElement = screen.getByTestId('data');
				expect(JSON.parse(dataElement.textContent!)).toHaveLength(1);
			});
		});

		it('should inject pagination props when pagination feature enabled', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				items: [{ id: '1' }],
				pagination: { total: 50, page: 2, pageSize: 10, totalPages: 5 },
			});

			const setPage = vi.fn();
			const setPageSize = vi.fn();
			const pagination = {
				fstate: {},
				actions: { setPage, setPageSize },
				toQuery: vi.fn(() => ({ page: 2, pageSize: 10 })),
			};

			const TestPaginationDisplayer = ({ pagination }: QueryResultDisplayerProps<any>) => (
				<div>
					{pagination && (
						<>
							<div data-testid="current-page">{pagination.currentPage}</div>
							<div data-testid="total-pages">{pagination.totalPages}</div>
							<div data-testid="total-items">{pagination.totalItems}</div>
							<div data-testid="page-size">{pagination.pageSize}</div>
						</>
					)}
				</div>
			);

			render(
				<Data2 fetchData={mockFetch} {...spreadFeatureProps(pagination, 'pagination')}>
					<TestPaginationDisplayer data={[]} isLoading={false} error={null} />
				</Data2>
			);

			await waitFor(() => {
				expect(screen.getByTestId('current-page')).toHaveTextContent('2');
				expect(screen.getByTestId('total-pages')).toHaveTextContent('5');
				expect(screen.getByTestId('total-items')).toHaveTextContent('50');
				expect(screen.getByTestId('page-size')).toHaveTextContent('10');
			});
		});

		it('should inject sorting props when sorting feature enabled', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				items: [{ id: '1' }],
			});

			const handleSort = vi.fn();
			const sorting = {
				state: {
					sortConfigs: [
						{ key: 'name', direction: 'asc' },
						{ key: 'createdAt', direction: 'desc' },
					],
				},
				fstate: {},
				actions: { handleSort },
				toQuery: vi.fn(() => ({ sortBy: 'name,createdAt', sortOrder: 'asc,desc' })),
			};

			const TestSortingDisplayer = ({ sorting }: QueryResultDisplayerProps<any>) => (
				<div>{sorting && <div data-testid="sort-configs">{JSON.stringify(sorting.sortConfigs)}</div>}</div>
			);

			render(
				<Data2 fetchData={mockFetch} {...spreadFeatureProps(sorting, 'sorting')}>
					<TestSortingDisplayer data={[]} isLoading={false} error={null} />
				</Data2>
			);

			await waitFor(() => {
				const sortConfigsElement = screen.getByTestId('sort-configs');
				const sortConfigs = JSON.parse(sortConfigsElement.textContent!);
				expect(sortConfigs).toHaveLength(2);
				expect(sortConfigs[0]).toEqual({ key: 'name', direction: 'asc' });
			});
		});
	});

	describe('render prop pattern', () => {
		it('should work with render prop function', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				items: [{ id: '1', name: 'Test' }],
			});

			render(
				<Data2 fetchData={mockFetch}>
					{({ data, isLoading }) => (
						<div>
							<div data-testid="render-prop-loading">{isLoading ? 'loading' : 'loaded'}</div>
							<div data-testid="render-prop-data">{JSON.stringify(data)}</div>
						</div>
					)}
				</Data2>
			);

			await waitFor(() => {
				expect(screen.getByTestId('render-prop-loading')).toHaveTextContent('loaded');
				const dataElement = screen.getByTestId('render-prop-data');
				expect(JSON.parse(dataElement.textContent!)).toHaveLength(1);
			});
		});
	});

	describe('abort controller', () => {
		it('should abort stale requests when features change', async () => {
			let resolveCount = 0;
			const mockFetch = vi.fn().mockImplementation(
				() =>
					new Promise(resolve => {
						setTimeout(() => {
							resolveCount++;
							resolve({ items: [{ id: resolveCount }] });
						}, 100);
					})
			);

			const pagination = createMockFeature({ page: 1, pageSize: 10 });

			const { rerender } = render(
				<Data2 fetchData={mockFetch} {...spreadFeatureProps(pagination, 'pagination')}>
					<TestDisplayer data={[]} isLoading={false} error={null} />
				</Data2>
			);

			// Change pagination (triggers new fetch)
			const newPagination = createMockFeature({ page: 2, pageSize: 10 });
			rerender(
				<Data2 fetchData={mockFetch} {...spreadFeatureProps(newPagination, 'pagination')}>
					<TestDisplayer data={[]} isLoading={false} error={null} />
				</Data2>
			);

			// Both fetches are called
			expect(mockFetch).toHaveBeenCalledTimes(2);

			// Wait for all promises to resolve
			await waitFor(
				() => {
					expect(resolveCount).toBe(2);
				},
				{ timeout: 500 }
			);

			// But only the latest data is displayed (first fetch was aborted)
			const dataElement = screen.getByTestId('data');
			const data = JSON.parse(dataElement.textContent!);
			expect(data).toHaveLength(1);
			expect(data[0].id).toBe(2); // Latest fetch result
		});
	});

	describe('infinite loop prevention', () => {
		it('should NOT cause infinite loop when toQuery is stable (same reference)', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				items: [{ id: '1', name: 'Test' }],
			});

			// Create stable toQuery reference (industry-standard: useCallback with deps)
			const stableToQuery = vi.fn(() => ({ page: 1, pageSize: 10 }));
			const stableActions = { setPage: vi.fn(), setPageSize: vi.fn() };
			const stableFstate = { page: 1, pageSize: 10 };

			const createProps = () => ({
				paginationToQuery: stableToQuery, // SAME reference
				paginationActions: stableActions, // SAME reference
				paginationFstate: stableFstate, // SAME reference
			});

			const { rerender } = render(
				<Data2 fetchData={mockFetch} {...createProps()}>
					<TestDisplayer data={[]} isLoading={false} error={null} />
				</Data2>
			);

			// Wait for initial fetch
			await waitFor(() => {
				expect(mockFetch).toHaveBeenCalledTimes(1);
			});

			// Simulate multiple re-renders with SAME toQuery reference
			// This simulates what happens when hooks use useCallback properly
			for (let i = 0; i < 5; i++) {
				rerender(
					<Data2 fetchData={mockFetch} {...createProps()}>
						<TestDisplayer data={[]} isLoading={false} error={null} />
					</Data2>
				);
			}

			// Give time for any potential infinite loop to manifest
			await new Promise(resolve => setTimeout(resolve, 100));

			// Should still only have been called once (no infinite loop)
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it('should fetch again ONLY when toQuery reference changes', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				items: [{ id: '1' }],
			});

			// Start with page 1
			const toQuery1 = vi.fn(() => ({ page: 1, pageSize: 10 }));
			const pagination1 = {
				toQuery: toQuery1,
				actions: { setPage: vi.fn(), setPageSize: vi.fn() },
				fstate: { page: 1, pageSize: 10 },
			};

			const { rerender } = render(
				<Data2 fetchData={mockFetch} {...spreadFeatureProps(pagination1, 'pagination')}>
					<TestDisplayer data={[]} isLoading={false} error={null} />
				</Data2>
			);

			// Wait for initial fetch
			await waitFor(() => {
				expect(mockFetch).toHaveBeenCalledTimes(1);
			});

			// Change to page 2 (NEW toQuery reference - simulates useCallback with new deps)
			const toQuery2 = vi.fn(() => ({ page: 2, pageSize: 10 }));
			const pagination2 = {
				toQuery: toQuery2,
				actions: { setPage: vi.fn(), setPageSize: vi.fn() },
				fstate: { page: 2, pageSize: 10 },
			};

			rerender(
				<Data2 fetchData={mockFetch} {...spreadFeatureProps(pagination2, 'pagination')}>
					<TestDisplayer data={[]} isLoading={false} error={null} />
				</Data2>
			);

			// Should fetch again because toQuery reference changed
			await waitFor(() => {
				expect(mockFetch).toHaveBeenCalledTimes(2);
			});

			// Verify correct queries were sent
			expect(mockFetch).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 10 });
			expect(mockFetch).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 10 });
		});
	});
});
