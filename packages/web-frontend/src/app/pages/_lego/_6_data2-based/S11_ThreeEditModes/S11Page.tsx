import { useCallback, useState } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { Table2, type Table2Column } from '@framework/components2/table/Table2';
import { PageContainer } from '@framework/components/layout/PageContainer';
import { Button } from '@framework/components/primitives/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { SearchInput } from '@framework/components/search/SearchInput';
import { useCacheControl2 } from '@framework/hooks2/data/useCacheControl2';
import type { FetchDataResult } from '@framework/hooks2/data/useDataFetch';
import { usePagination2 } from '@framework/hooks2/data/usePagination2';
import { useSimpleSearch } from '@framework/hooks2/data/useSimpleSearch';
import { useSorting2 } from '@framework/hooks2/data/useSorting2';
import { col } from '@framework/lego/helpers/col';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import type { CreateProduct, Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { ProductForm } from '@app/pages/_lego/_shared/ProductForm';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { adaptCol } from '../_framework/adaptCol';

/**
 * ===========================================================================================
 * S11: THREE EDIT MODES
 * ===========================================================================================
 *
 * Architecture: A6 Data2-Based
 *
 * Three edit mode buttons at top: "Dialog", "Inline", "Below Form"
 * - Dialog: Modal dialog (ProductDialogAdapter)
 * - Inline: Not implemented (fallback to Dialog)
 * - Below: Form rendered below table (ProductForm)
 *
 * Features:
 * - Search (debounced)
 * - Pagination
 * - Sorting (multi-column)
 * - Dynamic edit mode switching
 * - Cache control (refresh after mutations)
 *
 * ===========================================================================================
 */

type EditMode = 'dialog' | 'inline' | 'below';

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

export function S11Page() {
	const pagination = usePagination2({ pageSize: 10 });
	const sorting = useSorting2({});
	const search = useSimpleSearch({
		onSearchChange: () => {
			pagination.actions.resetPage();
		},
	});
	const cache = useCacheControl2({ enabled: true });

	const [editMode, setEditMode] = useState<EditMode>('dialog');
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
		if (editMode === 'below') {
			setEditingProduct(item);
		} else {
			setEditingProduct(item);
			setDialogOpen(true);
		}
	};

	const handleDelete = async (item: Product) => {
		if (confirm(`Delete product "${item.name}"?`)) {
			await productsService.deleteProduct(item.id);
			await cache.actions.refresh();
		}
	};

	const handleSaveDialog = async (data: unknown) => {
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

	const handleSaveBelow = async (data: CreateProduct) => {
		if (editingProduct) {
			await productsService.updateProduct(editingProduct.id, {
				...data,
				version: editingProduct.version,
			});
			setEditingProduct(null);
			await cache.actions.refresh();
		}
	};

	const handleClose = () => {
		setDialogOpen(false);
		setEditingProduct(null);
	};

	const handleRowClick = (item: Product) => {
		if (editMode === 'below') {
			setEditingProduct(item);
		}
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
		<PageContainer maxWidth="full" spacing="md">
			<Card>
				<CardHeader>
					<CardTitle>Edit Mode Selector</CardTitle>
				</CardHeader>
				<CardContent>
					<div style={{ display: 'flex', gap: '0.5rem' }}>
						<Button
							variant={editMode === 'dialog' ? 'default' : 'outline'}
							onClick={() => setEditMode('dialog')}
						>
							Dialog
						</Button>
						<Button
							variant={editMode === 'inline' ? 'default' : 'outline'}
							onClick={() => setEditMode('inline')}
						>
							Inline
						</Button>
						<Button
							variant={editMode === 'below' ? 'default' : 'outline'}
							onClick={() => setEditMode('below')}
						>
							Below Form
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardContent>
					<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
						<SearchInput
							value={search.fstate.query}
							onChange={search.actions.setQuery}
							onClear={search.actions.clearQuery}
							placeholder="Search products..."
						/>

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
									renderActions={editMode !== 'below' ? renderActions : undefined}
									onRowClick={editMode === 'below' ? handleRowClick : undefined}
									simplePagination
								/>
							)}
						</Data2>
					</div>
				</CardContent>
			</Card>

			{editMode === 'below' && editingProduct && (
				<Card>
					<CardHeader>
						<CardTitle>Edit Product: {editingProduct.name}</CardTitle>
					</CardHeader>
					<CardContent>
						<ProductForm
							initialData={editingProduct}
							onSubmit={handleSaveBelow}
							onCancel={() => setEditingProduct(null)}
							submitLabel="Update Product"
						/>
					</CardContent>
				</Card>
			)}

			{dialogOpen && (
				<ProductDialogAdapter item={editingProduct} onSave={handleSaveDialog} onClose={handleClose} />
			)}
		</PageContainer>
	);
}
