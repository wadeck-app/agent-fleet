import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

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
 * DESIGN NOTES - Approach A2 Trade-offs
 * ===========================================================================================
 *
 * A2.a - Single Data Source Coupling:
 * This DomainContext is tightly coupled to a single item list (Product[]).
 * Limitation: Single-item detail pages or multi-source pages (e.g., Orders + Products)
 * require a separate context. The provider cannot serve multiple independent data sources.
 *
 * A2.f - Provider Position Requirement:
 * The ProductProvider must be positioned ABOVE the page/consuming components in the React tree.
 * This is required because React context only flows downward - child components can only access
 * context from providers that are ancestors in the component tree.
 *
 * A2.h - Simplicity vs Factory Anti-pattern:
 * This approach creates tension: simple views benefit from centralized state (pro),
 * but as features grow, the provider becomes a factory anti-pattern (con). Each new
 * feature requires expanding the provider's surface area, leading to tight coupling.
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
	selectItem: (id: string) => Promise<void>;
	navigatePrev: () => void;
	navigateNext: () => void;
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
	featuredOnly?: boolean;
}

/**
 * Product provider component
 * Owns all state, fetches on query change, provides context
 */
export function ProductProvider({ children, defaultPageSize = 10, featuredOnly = false }: ProductProviderProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const [items, setItems] = useState<Product[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedItem, setSelectedItem] = useState<Product | null>(null);
	const [selectedItemLoading, setSelectedItemLoading] = useState(false);

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

			const allItems = response.items;
			const filteredItems = featuredOnly ? allItems.filter(p => p.featured) : allItems;

			setItems(filteredItems);
			setPagination({
				page: response.pagination?.page ?? 1,
				pageSize: response.pagination?.pageSize ?? defaultPageSize,
				total: response.pagination?.total ?? 0,
				totalPages: response.pagination?.totalPages ?? 0,
			});
		} catch (err) {
			setError(getErrorMessage(err));
			setItems([]);
		} finally {
			setLoading(false);
		}
	}, [query, featuredOnly, defaultPageSize]);

	/**
	 * Fetch products when query changes
	 */
	useEffect(() => {
		// fetchProducts has internal error handling via try/catch
		void fetchProducts();
	}, [fetchProducts]);

	/**
	 * Load a single item by ID
	 */
	const loadItem = useCallback(
		async (id: string) => {
			setSelectedItemLoading(true);
			try {
				const item = await productsService.getProduct(id);
				setSelectedItem(item);
				setSearchParams({ id });
			} catch (err) {
				console.error('Failed to load item:', err);
				setSelectedItem(null);
			} finally {
				setSelectedItemLoading(false);
			}
		},
		[setSearchParams]
	);

	/**
	 * Load initial item from URL
	 */
	// intentional: read initial URL state once on mount
	useEffect(() => {
		const id = searchParams.get('id');
		if (id) {
			void loadItem(id);
		}
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

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
				if (item) {
					setSearchParams({ id: item.id });
				} else {
					setSearchParams({});
				}
			},

			selectItem: async (id: string) => {
				await loadItem(id);
			},

			navigatePrev: () => {
				if (!selectedItem || items.length === 0) {
					return;
				}

				const currentIndex = items.findIndex(i => i.id === selectedItem.id);
				if (currentIndex > 0) {
					void loadItem(items[currentIndex - 1].id);
				}
			},

			navigateNext: () => {
				if (!selectedItem || items.length === 0) {
					return;
				}

				const currentIndex = items.findIndex(i => i.id === selectedItem.id);
				if (currentIndex < items.length - 1) {
					void loadItem(items[currentIndex + 1].id);
				}
			},

			setQuery: (patch: Partial<ProductQuery>) => {
				setQueryState(prev => ({ ...prev, ...patch }));
			},

			refresh: async () => {
				await fetchProducts();
			},
		}),
		[fetchProducts, loadItem, selectedItem, items, setSearchParams]
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
			selectedItemLoading,
			actions,
		}),
		[items, loading, error, pagination, query, selectedItem, selectedItemLoading, actions]
	);

	return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}
