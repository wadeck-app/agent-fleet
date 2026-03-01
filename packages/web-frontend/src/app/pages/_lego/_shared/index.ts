/**
 * ===========================================================================================
 * LEGO SHARED - Barrel Export
 * ===========================================================================================
 *
 * Central export point for shared Lego page components and services.
 *
 * Exports:
 * - Products API client (productsApi)
 * - Products service (productsService)
 * - Product dialog and form components
 * - Related types from products contract
 *
 * ===========================================================================================
 */

// API client and service
export { productsApi } from './api/products.api';
export { productsService, type GetProductsParams } from './api/ProductsService';

// Dialog and form components
export { ProductDialog, type ProductDialogProps } from './ProductDialog';
export { ProductDialogAdapter } from './ProductDialogAdapter';
export { ProductForm, type ProductFormProps } from './ProductForm';

// Re-export types from products contract for convenience
export type {
	Product,
	CreateProduct,
	UpdateProduct,
	ProductCategory,
	ProductStatus,
	ProductListResponse,
	ProductsListQuery,
} from '@shared/api/products.contract';
export { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';
