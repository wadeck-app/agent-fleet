import { useState } from 'react';

import { PageContainer } from '@framework/components/layout/PageContainer';
import { Button } from '@framework/components/primitives/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageLayout';
import { PipelineDataTable } from '../_framework/PipelineDataTable';
import { withPagination, withSearch } from '../_framework/PipelineTypes';
import { S11Content } from './S11Content';

type EditMode = 'dialog' | 'inline' | 'below';

const columns = [
	col.text<Product>('name', 'Name', { sortable: true, sticky: 'left' }),
	col.number<Product>('price', 'Price', { prefix: '$', sortable: true }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.boolean<Product>('featured', 'Featured'),
	col.number<Product>('stock', 'Stock', { sortable: true }),
	col.number<Product>('rating', 'Rating', { sortable: true }),
	col.date<Product>('createdAt', 'Created'),
];

export function S11Page() {
	const [editMode, setEditMode] = useState<EditMode>('dialog');

	return (
		<PageContainer maxWidth="full" spacing="md">
			<Card>
				<CardHeader>
					<CardTitle>Edit Mode Selector</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex gap-2">
						<Button variant={editMode === 'dialog' ? 'default' : 'outline'} onClick={() => setEditMode('dialog')}>Dialog</Button>
						<Button variant={editMode === 'inline' ? 'default' : 'outline'} onClick={() => setEditMode('inline')}>Inline</Button>
						<Button variant={editMode === 'below' ? 'default' : 'outline'} onClick={() => setEditMode('below')}>Below Form</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardContent>
					<PageLayout>
						<PipelineDataTable
							service={productsService}
							columns={columns}
							modifiers={[withSearch(''), withPagination(1, 10)]}
						>
							<S11Content editMode={editMode} />
						</PipelineDataTable>
					</PageLayout>
				</CardContent>
			</Card>
		</PageContainer>
	);
}
