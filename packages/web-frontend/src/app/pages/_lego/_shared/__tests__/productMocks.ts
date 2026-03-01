import { withMetadata } from '@framework/tests/withMetadata';
import type { Product, ProductListResponse } from '@shared/api/products.contract';
import type { ProductBulkDeleteResponse } from '@shared/api/products.contract';
import { vi } from 'vitest';

export const mockProducts = {
	laptop: withMetadata<Product>({
		id: '1',
		name: 'Gaming Laptop',
		description: 'High-performance gaming laptop with RTX 4080',
		category: 'electronics',
		price: 1899.99,
		stock: 15,
		status: 'active',
		rating: 4.5,
		imageUrl: 'https://example.com/laptop.jpg',
		featured: true,
		version: 1,
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
	}),
	tshirt: withMetadata<Product>({
		id: '2',
		name: 'Cotton T-Shirt',
		description: 'Comfortable 100% cotton t-shirt',
		category: 'clothing',
		price: 24.99,
		stock: 150,
		status: 'active',
		rating: 4.2,
		imageUrl: 'https://example.com/tshirt.jpg',
		featured: false,
		version: 1,
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
	}),
	coffeeBeans: withMetadata<Product>({
		id: '3',
		name: 'Organic Coffee Beans',
		description: 'Premium organic coffee beans from Colombia',
		category: 'food',
		price: 15.99,
		stock: 85,
		status: 'active',
		rating: 4.8,
		imageUrl: 'https://example.com/coffee.jpg',
		featured: true,
		version: 1,
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
	}),
	novel: withMetadata<Product>({
		id: '4',
		name: 'Mystery Novel',
		description: 'Best-selling mystery thriller',
		category: 'books',
		price: 14.99,
		stock: 42,
		status: 'draft',
		rating: 4.3,
		imageUrl: 'https://example.com/novel.jpg',
		featured: false,
		version: 1,
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
	}),
	yogaMat: withMetadata<Product>({
		id: '5',
		name: 'Premium Yoga Mat',
		description: 'Non-slip eco-friendly yoga mat',
		category: 'sports',
		price: 34.99,
		stock: 60,
		status: 'active',
		rating: 4.6,
		imageUrl: 'https://example.com/yoga-mat.jpg',
		featured: false,
		version: 1,
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
	}),
} as const;

export const mockProductList: Product[] = Object.values(mockProducts);

export function createMockListResponse(items: Product[], page = 1, pageSize = 10): ProductListResponse {
	const start = (page - 1) * pageSize;
	const end = start + pageSize;
	const paginatedItems = items.slice(start, end);

	return {
		items: paginatedItems,
		pagination: {
			page,
			pageSize,
			total: items.length,
			totalPages: Math.ceil(items.length / pageSize),
		},
	};
}

export function createMockBulkDeleteResponse(
	deleted: string[],
	failed: Array<{ id: string; reason: string; code: string }> = []
): ProductBulkDeleteResponse {
	return {
		success: true,
		deleted,
		failed,
		totalRequested: deleted.length + failed.length,
		totalDeleted: deleted.length,
		totalFailed: failed.length,
	};
}

// Mocks at module level for hoisting
const mockGetProducts = vi.fn().mockResolvedValue(createMockListResponse(mockProductList));
const mockGetProduct = vi.fn((id: string) => {
	const product = mockProductList.find(p => p.id === id);
	return product ? Promise.resolve(product) : Promise.reject(new Error(`Product ${id} not found`));
});
const mockCreateProduct = vi.fn(data => Promise.resolve(withMetadata({ id: `new-${Date.now()}`, ...data })));
const mockUpdateProduct = vi.fn((id: string, data) => {
	const existing = mockProductList.find(p => p.id === id);
	if (!existing) return Promise.reject(new Error(`Product ${id} not found`));
	return Promise.resolve(withMetadata({ ...existing, ...data, id }));
});
const mockDeleteProduct = vi.fn().mockResolvedValue(undefined);
const mockBulkDeleteProducts = vi.fn((ids: string[]) => Promise.resolve(createMockBulkDeleteResponse(ids)));
const mockValidateProductData = vi.fn(() => ({ valid: true, errors: [] }));
const mockCalculateAverageRating = vi.fn((products: Product[]) => {
	if (products.length === 0) return 0;
	return products.reduce((sum: number, p: Product) => sum + (p.rating || 0), 0) / products.length;
});
const mockCalculateInventoryValue = vi.fn((products: Product[]) =>
	products.reduce((sum: number, p: Product) => sum + (p.price || 0) * (p.stock || 0), 0)
);

vi.mock('@app/pages/_lego/_shared/api/ProductsService', () => ({
	productsService: {
		getProducts: mockGetProducts,
		getProduct: mockGetProduct,
		createProduct: mockCreateProduct,
		updateProduct: mockUpdateProduct,
		deleteProduct: mockDeleteProduct,
		bulkDeleteProducts: mockBulkDeleteProducts,
		validateProductData: mockValidateProductData,
		calculateAverageRating: mockCalculateAverageRating,
		calculateInventoryValue: mockCalculateInventoryValue,
	},
	ProductsService: vi.fn(() => ({
		getProducts: mockGetProducts,
		getProduct: mockGetProduct,
		createProduct: mockCreateProduct,
		updateProduct: mockUpdateProduct,
		deleteProduct: mockDeleteProduct,
		bulkDeleteProducts: mockBulkDeleteProducts,
		validateProductData: mockValidateProductData,
		calculateAverageRating: mockCalculateAverageRating,
		calculateInventoryValue: mockCalculateInventoryValue,
	})),
}));

export function setupProductServiceMocks() {
	return {
		mocks: {
			getProducts: mockGetProducts,
			getProduct: mockGetProduct,
			createProduct: mockCreateProduct,
			updateProduct: mockUpdateProduct,
			deleteProduct: mockDeleteProduct,
			bulkDeleteProducts: mockBulkDeleteProducts,
			validateProductData: mockValidateProductData,
			calculateAverageRating: mockCalculateAverageRating,
			calculateInventoryValue: mockCalculateInventoryValue,
		},
		cleanup: () => vi.clearAllMocks(),
	};
}
