import { useCallback, useState } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { Table2, type Table2Column } from '@framework/components2/table/Table2';
import { Button } from '@framework/components/primitives/Button';
import { SearchInput } from '@framework/components/search/SearchInput';
import { useCacheControl2 } from '@framework/hooks2/data/useCacheControl2';
import type { FetchDataResult } from '@framework/hooks2/data/useDataFetch';
import { usePagination2 } from '@framework/hooks2/data/usePagination2';
import { useSimpleSearch } from '@framework/hooks2/data/useSimpleSearch';
import { useSorting2 } from '@framework/hooks2/data/useSorting2';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import { col } from '@framework/lego';
import type { CreateProduct, Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageLayout';
import { adaptCol } from '../_framework/adaptCol';

/**
 * ===========================================================================================
 * S10: INLINE EDITING
 * ===========================================================================================
 *
 * Architecture: A6 Data2-Based
 *
 * Full-featured table with CRUD operations.
 * - Search, pagination, sorting features
 * - Add button for creating new products
 * - Edit/Delete buttons per row via renderActions
 * - Dialog-based editing (ProductDialogAdapter)
 * - Cache refresh after mutations
 *
 * Features:
 * - Search (debounced)
 * - Pagination
 * - Sorting (multi-column)
 * - CRUD dialog
 * - Cache control (refresh after save/delete)
 *
 * ===========================================================================================
 */

const columns: Table2Column<Product>[] = [
	adaptCol(col.text<Product>('name', 'Name', { sortable: true, sticky: 'left' })),
	adaptCol(col.number<Product>('price', 'Price', { prefix: '$', sortable: true })),
	adaptCol(col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true })),
	adaptCol(col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true })),
	adaptCol(col.boolean<Product>('featured', 'Featured')),
	adaptCol(col.number<Product>('stock', 'Stock', { sortable: true })),
	adaptCol(col.number<Product>('rating', 'Rating', { sortable: true })),
	adaptCol(col.date<Product>('createdAt', 'Created')),
];

export function S10Page() {
	const pagination = usePagination2({ pageSize: 10 });
	const sorting = useSorting2({});
	const search = useSimpleSearch({
		onSearchChange: () => {
			pagination.actions.resetPage();
		},
	});
	const cache = useCacheControl2({ enabled: true });

	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingProduct, setEditingProduct] = useState<Product | null>(null);

	const fetchProducts = useCallback(async (query: ComposedQuery): Promise<FetchDataResult<Product>> => {
		const response = await productsService.getProducts(query);
		return {
			items: response.items,
			pagination: response.pagination,
		};
	}, []);

	const handleEdit = (item: Product) => {
		setEditingProduct(item);
		setDialogOpen(true);
	};

	const handleDelete = async (item: Product) => {
		if (confirm(`Delete product "${item.name}"?`)) {
			await productsService.deleteProduct(item.id);
			await cache.actions.refresh();
		}
	};

	const handleSave = async (data: unknown) => {
		const product = data as CreateProduct;
		if (editingProduct) {
			await productsService.updateProduct(editingProduct.id, {
				...product,
				version: editingProduct.version,
			});
		} else {
			await productsService.createProduct(product);
		}
		await cache.actions.refresh();
	};

	const handleClose = () => {
		setDialogOpen(false);
		setEditingProduct(null);
	};

	const renderActions = (item: Product) => (
		<div style={{ display: 'flex', gap: '0.5rem' }}>
			<Button size="sm" variant="outline" onClick={() => handleEdit(item)}>
				Edit
			</Button>
			<Button size="sm" variant="destructive" onClick={() => handleDelete(item)}>
				Delete
			</Button>
		</div>
	);

	return (
		<PageLayout>
			<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
				<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
					<SearchInput
						value={search.fstate.query}
						onChange={search.actions.setQuery}
						onClear={search.actions.clearQuery}
						placeholder="Search products..."
					/>

					<Button
						onClick={() => {
							setEditingProduct(null);
							setDialogOpen(true);
						}}
					>
						Add Product
					</Button>
				</div>

				<Data2
					fetchData={fetchProducts}
					pagination={pagination}
					sorting={sorting}
					search={search}
					cache={cache}
				>
					{injectedProps => (
						<Table2
							{...injectedProps}
							columns={columns}
							getItemId={item => item.id}
							renderActions={renderActions}
							simplePagination
						/>
					)}
				</Data2>

				{dialogOpen && <ProductDialogAdapter item={editingProduct} onSave={handleSave} onClose={handleClose} />}
			</div>
		</PageLayout>
	);
}
