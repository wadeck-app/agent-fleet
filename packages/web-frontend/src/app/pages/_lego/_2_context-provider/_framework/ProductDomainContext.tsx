import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { CreateProduct, Product } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { createDomainContext } from './DomainContext';

/**
 * ===========================================================================================
 * PRODUCT DOMAIN CONTEXT
 * ===========================================================================================
 *
 * Provider that owns all Product-related state and business logic.
 * View components read from this context - they have no data props, no service, no fetch logic.
 *
 * State Management:
 * - items: Current product list
 * - loading: Loading state
 * - error: Error message
 * - pagination: Page, pageSize, total, totalPages
 * - query: Search, filters, sorting
 * - selectedItem: Currently selected product (for detail panel)
 *
 * Actions:
 * - create: Create new product
 * - update: Update existing product
 * - delete: Delete product
 * - bulkDelete: Delete multiple products
 * - select: Select a product for detail view
 * - setQuery: Update query parameters (triggers refetch)
 * - refresh: Force refetch with current query
 *
 * ===========================================================================================
 */

/**
 * Query parameters for product list
 */
export interface ProductQuery {
	search: string;
	page: number;
	pageSize: number;
	sortBy: string | undefined;
	sortOrder: 'asc' | 'desc' | undefined;
}

/**
 * Available actions for product domain
 */
export interface ProductActions {
	create: (data: CreateProduct) => Promise<void>;
	update: (id: string, data: CreateProduct & { version: number }) => Promise<void>;
	delete: (id: string) => Promise<void>;
	bulkDelete: (ids: string[]) => Promise<void>;
	select: (item: Product | null) => void;
	setQuery: (patch: Partial<ProductQuery>) => void;
	refresh: () => Promise<void>;
}

const { Context: ProductContext, useContext: useProductDomain } = createDomainContext<
	Product,
	ProductQuery,
	ProductActions
>('Product');

export { useProductDomain };

/**
 * Product provider props
 */
export interface ProductProviderProps {
	children: ReactNode;
	defaultPageSize?: number;
}

/**
 * Product provider component
 * Owns all state, fetches on query change, provides context
 */
export function ProductProvider({ children, defaultPageSize = 10 }: ProductProviderProps) {
	const [items, setItems] = useState<Product[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedItem, setSelectedItem] = useState<Product | null>(null);

	const [query, setQueryState] = useState<ProductQuery>({
		search: '',
		page: 1,
		pageSize: defaultPageSize,
		sortBy: undefined,
		sortOrder: undefined,
	});

	const [pagination, setPagination] = useState({
		page: 1,
		pageSize: defaultPageSize,
		total: 0,
		totalPages: 0,
	});

	/**
	 * Fetch products based on current query
	 */
	const fetchProducts = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await productsService.getProducts({
				page: query.page,
				pageSize: query.pageSize,
				search: query.search || undefined,
				sortBy: query.sortBy,
				sortOrder: query.sortOrder,
			});

			setItems(response.items);
			setPagination({
				page: response.pagination?.page ?? 1,
				pageSize: response.pagination?.pageSize ?? 10,
				total: response.pagination?.total ?? 0,
				totalPages: response.pagination?.totalPages ?? 0,
			});
		} catch (err) {
			setError(getErrorMessage(err));
			setItems([]);
		} finally {
			setLoading(false);
		}
	}, [query]);

	/**
	 * Fetch products when query changes
	 */
	useEffect(() => {
		void fetchProducts();
	}, [fetchProducts]);

	/**
	 * Actions
	 */
	const actions: ProductActions = useMemo(
		() => ({
			create: async (data: CreateProduct) => {
				await productsService.createProduct(data);
				await fetchProducts();
			},

			update: async (id: string, data: CreateProduct & { version: number }) => {
				await productsService.updateProduct(id, data);
				await fetchProducts();
			},

			delete: async (id: string) => {
				await productsService.deleteProduct(id);
				await fetchProducts();
			},

			bulkDelete: async (ids: string[]) => {
				await productsService.bulkDeleteProducts(ids);
				await fetchProducts();
			},

			select: (item: Product | null) => {
				setSelectedItem(item);
			},

			setQuery: (patch: Partial<ProductQuery>) => {
				setQueryState(prev => ({ ...prev, ...patch }));
			},

			refresh: async () => {
				await fetchProducts();
			},
		}),
		[fetchProducts]
	);

	/**
	 * Context value
	 */
	const value = useMemo(
		() => ({
			items,
			loading,
			error,
			pagination,
			query,
			selectedItem,
			actions,
		}),
		[items, loading, error, pagination, query, selectedItem, actions]
	);

	return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}
