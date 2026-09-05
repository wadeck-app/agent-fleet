import { useCallback, useState } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { type Table2Column } from '@framework/components2/table/Table2';
import { Button } from '@framework/components/primitives/Button';
import { SearchInput } from '@framework/components/search/SearchInput';
import { useCacheControl2 } from '@framework/hooks2/data/useCacheControl2';
import type { FetchDataResult } from '@framework/hooks2/data/useDataFetch';
import { usePagination2 } from '@framework/hooks2/data/usePagination2';
import { useSimpleSearch } from '@framework/hooks2/data/useSimpleSearch';
import { col } from '@framework/lego/helpers/col';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import type { CreateProduct, Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { Data2ItemGrid } from '../_framework/Data2ItemGrid';
import { PageLayout } from '../_framework/PageLayout';
import { adaptCol } from '../_framework/adaptCol';

/**
 * ===========================================================================================
 * S4: GRID WITH POPUP DIALOG
 * ===========================================================================================
 *
 * Architecture: A6 Data2-Based
 *
 * Grid display with CRUD dialog.
 * - Data2ItemGrid: Grid layout implementing QueryResultDisplayerProps
 * - ProductDialogAdapter: Dialog for create/edit
 * - Page-level state for dialog open/editing
 *
 * Features:
 * - Pagination (12 items per page)
 * - Search (debounced)
 * - Cache control (refresh after mutations)
 * - Grid layout (responsive)
 * - CRUD dialog
 *
 * ===========================================================================================
 */

const columns: Table2Column<Product>[] = [
	adaptCol(col.text<Product>('name', 'Name')),
	adaptCol(col.number<Product>('price', 'Price', { prefix: '$' })),
	adaptCol(col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true })),
	adaptCol(col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true })),
];

export function S4Page() {
	const pagination = usePagination2({ pageSize: 12 });
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

				<Data2 fetchData={fetchProducts} pagination={pagination} search={search} cache={cache}>
					{injectedProps => (
						<Data2ItemGrid
							{...injectedProps}
							columns={columns}
							getItemId={item => item.id}
							onEdit={handleEdit}
							onDelete={handleDelete}
						/>
					)}
				</Data2>

				{dialogOpen && <ProductDialogAdapter item={editingProduct} onSave={handleSave} onClose={handleClose} />}
			</div>
		</PageLayout>
	);
}
