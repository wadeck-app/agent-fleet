/**
 * ===========================================================================================
 * LEGO PRODUCTS ISO-CRUD TEST SUITE
 * ===========================================================================================
 *
 * Tests CRUD FLOWS not IMPLEMENTATION.
 * Focus on OBSERVABLE RESULTS: API calls, data mutations, form interactions.
 * Avoid implementation details: Dialog internals, form structure, specific UI elements.
 *
 * Every test MUST pass for all 4 approaches.
 * If a test fails for one approach, the TEST is wrong.
 *
 * Tests only S3 (Full-Featured) scenarios which include CRUD functionality.
 *
 * ===========================================================================================
 */
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ToastProvider } from '@framework/features/toast/ToastContext';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Approach 1: Widget-Isolated
import { S3Page as A1S3Page } from '@app/pages/_lego/_1_widget-isolated/S3_FullFeatured/S3Page';
// Approach 2: Context-Provider
import { S3Page as A2S3Page } from '@app/pages/_lego/_2_context-provider/S3_FullFeatured/S3Page';
// Approach 3: Feature-Hooks
import { S3Page as A3S3Page } from '@app/pages/_lego/_3_feature-hooks/S3_FullFeatured/S3Page';
// Approach 4: Context-Children
import { S3Page as A4S3Page } from '@app/pages/_lego/_4_context-children/S3_FullFeatured/S3Page';

import { mockProducts as _mockProducts, mockProductList } from './productMocks';

// Hoisted mock functions - created once and shared between mock and assertions
const {
	mockGetProducts,
	mockGetProduct,
	mockCreateProduct,
	mockUpdateProduct,
	mockDeleteProduct,
	mockBulkDeleteProducts,
	mockValidateProductData,
} = vi.hoisted(() => {
	const mockGetProducts = vi.fn();
	const mockGetProduct = vi.fn();
	const mockCreateProduct = vi.fn();
	const mockUpdateProduct = vi.fn();
	const mockDeleteProduct = vi.fn();
	const mockBulkDeleteProducts = vi.fn();
	const mockValidateProductData = vi.fn();

	return {
		mockGetProducts,
		mockGetProduct,
		mockCreateProduct,
		mockUpdateProduct,
		mockDeleteProduct,
		mockBulkDeleteProducts,
		mockValidateProductData,
	};
});

// Mock setup - must be at top level of test file for Vitest hoisting
vi.mock('@app/pages/_lego/_shared/api/ProductsService', async () => {
	return {
		productsService: {
			getProducts: mockGetProducts,
			getProduct: mockGetProduct,
			createProduct: mockCreateProduct,
			updateProduct: mockUpdateProduct,
			deleteProduct: mockDeleteProduct,
			bulkDeleteProducts: mockBulkDeleteProducts,
			validateProductData: mockValidateProductData,
		},
		ProductsService: vi.fn(() => ({
			getProducts: mockGetProducts,
			getProduct: mockGetProduct,
			createProduct: mockCreateProduct,
			updateProduct: mockUpdateProduct,
			deleteProduct: mockDeleteProduct,
			bulkDeleteProducts: mockBulkDeleteProducts,
			validateProductData: mockValidateProductData,
		})),
	};
});

// Use the hoisted mocks directly
const mocks = {
	getProducts: mockGetProducts,
	getProduct: mockGetProduct,
	createProduct: mockCreateProduct,
	updateProduct: mockUpdateProduct,
	deleteProduct: mockDeleteProduct,
	bulkDeleteProducts: mockBulkDeleteProducts,
	validateProductData: mockValidateProductData,
};

const scenarios = [
	{ name: 'Approach1 S3', PageComponent: A1S3Page, path: '/lego/1/s3' },
	{ name: 'Approach2 S3', PageComponent: A2S3Page, path: '/lego/2/s3' },
	{ name: 'Approach3 S3', PageComponent: A3S3Page, path: '/lego/3/s3' },
	{ name: 'Approach4 S3', PageComponent: A4S3Page, path: '/lego/4/s3' },
];

describe.each(scenarios)('Lego Products $name - CRUD Flows', ({ name: _name, PageComponent, path }) => {
	const renderPage = () => {
		return render(
			<ToastProvider>
				<MemoryRouter initialEntries={[path]}>
					<Routes>
						<Route path={path} element={<PageComponent />} />
						<Route path={`${path}/:mode`} element={<PageComponent />} />
						<Route path={`${path}/:id/:mode`} element={<PageComponent />} />
					</Routes>
				</MemoryRouter>
			</ToastProvider>
		);
	};

	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		// Both approaches use window.confirm() for delete confirmation — mock it
		vi.spyOn(window, 'confirm').mockReturnValue(true);

		// Configure mock implementations
		mocks.getProducts.mockResolvedValue({
			items: mockProductList,
			pagination: { page: 1, pageSize: 10, total: 5, totalPages: 1 },
		});

		mocks.getProduct.mockImplementation((id: string) => {
			const product = mockProductList.find(p => p.id === id);
			return product ? Promise.resolve(product) : Promise.reject(new Error(`Product ${id} not found`));
		});

		mocks.createProduct.mockImplementation(data =>
			Promise.resolve({
				id: `new-${Date.now()}`,
				...data,
				createdAt: new Date(),
				updatedAt: new Date(),
				version: 1,
			})
		);

		mocks.updateProduct.mockImplementation((id: string, data) => {
			const existing = mockProductList.find(p => p.id === id);
			if (!existing) return Promise.reject(new Error(`Product ${id} not found`));
			return Promise.resolve({ ...existing, ...data, id, updatedAt: new Date(), version: existing.version + 1 });
		});

		mocks.deleteProduct.mockResolvedValue(undefined);

		mocks.bulkDeleteProducts.mockImplementation((ids: string[]) =>
			Promise.resolve({
				success: true,
				deleted: ids,
				failed: [],
				totalRequested: ids.length,
				totalDeleted: ids.length,
				totalFailed: 0,
			})
		);

		// Validator passes by default — override per-test for validation failure scenarios
		mocks.validateProductData.mockReturnValue({ valid: true, errors: [] });
	});

	// ========================================================================
	// BEHAVIOR: Create Flow
	// ========================================================================
	describe('Create Flow', () => {
		it('should open create dialog when clicking Add button', async () => {
			const user = userEvent.setup();
			renderPage();

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Find and click Add/Create button
			const buttons = screen.getAllByRole('button');
			const addButton = buttons.find(btn => btn.textContent?.match(/add|create|new/i));
			expect(addButton).toBeDefined();

			await user.click(addButton!);

			// BEHAVIOR: Dialog should open with form fields
			// Use exact label string to avoid matching sort button aria-labels like "Sort by Name"
			await waitFor(() => {
				expect(screen.getByLabelText(/^Name/i)).toBeInTheDocument();
			});
		});

		it('should create product and refresh list on successful save', { timeout: 15000 }, async () => {
			const user = userEvent.setup();
			renderPage();

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Open create dialog
			const buttons = screen.getAllByRole('button');
			const addButton = buttons.find(btn => btn.textContent?.match(/add|create|new/i));
			await user.click(addButton!);

			// Wait for dialog to open (exact label to avoid sort button aria-label conflicts)
			await waitFor(() => {
				expect(screen.getByLabelText(/^Name/i)).toBeInTheDocument();
			});

			// Fill form fields using exact label strings
			const nameInput = screen.getByLabelText(/^Name/i);
			await user.clear(nameInput);
			await user.type(nameInput, 'New Gaming Mouse');

			const descriptionInput = screen.getByLabelText(/^Description/i);
			await user.clear(descriptionInput);
			await user.type(descriptionInput, 'High DPI gaming mouse');

			// Find and select category
			const categorySelect = screen.getByLabelText(/^Category/i);
			await user.click(categorySelect);
			// Select "electronics" option
			const electronicsOption = await screen.findByRole('option', { name: /electronics/i });
			await user.click(electronicsOption);

			// Find and select status
			const statusSelect = screen.getByLabelText(/^Status/i);
			await user.click(statusSelect);
			const activeOption = await screen.findByRole('option', { name: /active/i });
			await user.click(activeOption);

			// Fill numeric fields
			const priceInput = screen.getByLabelText(/^Price/i);
			await user.clear(priceInput);
			await user.type(priceInput, '79.99');

			const stockInput = screen.getByLabelText(/^Stock/i);
			await user.clear(stockInput);
			await user.type(stockInput, '100');

			const ratingInput = screen.getByLabelText(/^Rating/i);
			await user.clear(ratingInput);
			await user.type(ratingInput, '4.5');

			// Clear initial getProducts calls
			mocks.getProducts.mockClear();

			// Find and click Save button (label depends on mode: "Create Product" or "Update Product")
			const saveButton = screen.getByRole('button', { name: /create product|update product/i });
			await user.click(saveButton);

			// BEHAVIOR: Create API should be called
			await waitFor(() => {
				expect(mocks.createProduct).toHaveBeenCalledWith(
					expect.objectContaining({
						name: 'New Gaming Mouse',
						description: 'High DPI gaming mouse',
						category: 'electronics',
						status: 'active',
						price: 79.99,
						stock: 100,
						rating: 4.5,
					})
				);
			});

			// BEHAVIOR: List should refresh after create
			await waitFor(() => {
				expect(mocks.getProducts).toHaveBeenCalled();
			});

			// BEHAVIOR: Dialog should close
			await waitFor(() => {
				// Exact string avoids matching "Sort by Name" aria-label when dialog is gone
				expect(screen.queryByLabelText(/^Name/i)).not.toBeInTheDocument();
			});
		});
	});

	// ========================================================================
	// BEHAVIOR: Edit Flow
	// ========================================================================
	describe('Edit Flow', () => {
		it('should open edit dialog with pre-populated data when clicking Edit button', async () => {
			const user = userEvent.setup();
			renderPage();

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Find edit button/action for first product
			// Approach 1: Direct edit button
			// Approach 2: Dropdown menu with Edit option
			let editButton: HTMLElement | null = null;

			// Try to find inline edit buttons first
			const inlineEditButtons = screen.queryAllByRole('button').filter(btn => {
				const text = btn.textContent?.toLowerCase();
				return text?.includes('edit');
			});

			if (inlineEditButtons.length > 0) {
				editButton = inlineEditButtons[0];
			} else {
				// If no inline edit buttons, try to find actions menu (dropdown)
				const actionMenus = screen
					.queryAllByRole('button')
					.filter(btn => btn.querySelector('svg') && btn.textContent?.trim() === '');
				if (actionMenus.length > 0) {
					editButton = actionMenus[0];
				}
			}

			expect(editButton).toBeTruthy();

			// Click edit button or actions menu
			if (editButton) {
				await user.click(editButton);

				// Wait for Edit menu item to appear (if dropdown)
				let editMenuItem: HTMLElement | null = null;
				try {
					editMenuItem = screen.getByText(/edit/i);
				} catch {
					// Not a dropdown - edit button directly opened dialog
				}

				if (editMenuItem) {
					await user.click(editMenuItem);
				}
			}

			// BEHAVIOR: Dialog should open with pre-filled form (exact label to avoid conflicts)
			await waitFor(() => {
				const nameInput = screen.getByLabelText(/^Name/i) as HTMLInputElement;
				expect(nameInput).toBeInTheDocument();
				// Should have the existing product name
				expect(nameInput.value).toBe('Gaming Laptop');
			});
		});

		it('should update product and refresh list on successful save', { timeout: 15000 }, async () => {
			const user = userEvent.setup();
			renderPage();

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Find and click first edit action
			const inlineEditButtons = screen.queryAllByRole('button').filter(btn => {
				const text = btn.textContent?.toLowerCase();
				return text?.includes('edit');
			});

			let editButton: HTMLElement | null = null;
			if (inlineEditButtons.length > 0) {
				editButton = inlineEditButtons[0];
			} else {
				// Try dropdown menu
				const actionMenus = screen
					.queryAllByRole('button')
					.filter(btn => btn.querySelector('svg') && btn.textContent?.trim() === '');
				if (actionMenus.length > 0) {
					editButton = actionMenus[0];
				}
			}

			expect(editButton).toBeTruthy();

			if (editButton) {
				await user.click(editButton);

				// If it's a dropdown, find and click Edit menu item
				let editMenuItem: HTMLElement | null = null;
				try {
					editMenuItem = screen.getByText(/^edit$/i);
				} catch {
					// Not a dropdown
				}

				if (editMenuItem) {
					await user.click(editMenuItem);
				}
			}

			// Wait for dialog to open (exact label to avoid conflicts)
			await waitFor(() => {
				expect(screen.getByLabelText(/^Name/i)).toBeInTheDocument();
			});

			// Modify the name
			const nameInput = screen.getByLabelText(/^Name/i);
			await user.clear(nameInput);
			await user.type(nameInput, 'Updated Gaming Laptop Pro');

			// Modify price
			const priceInput = screen.getByLabelText(/^Price/i);
			await user.clear(priceInput);
			await user.type(priceInput, '2199.99');

			// Clear initial getProducts calls
			mocks.getProducts.mockClear();

			// Find and click Save button (label depends on mode: "Create Product" or "Update Product")
			const saveButton = screen.getByRole('button', { name: /create product|update product/i });
			await user.click(saveButton);

			// BEHAVIOR: Update API should be called with product ID
			await waitFor(() => {
				expect(mocks.updateProduct).toHaveBeenCalledWith(
					'1', // Gaming Laptop ID
					expect.objectContaining({
						name: 'Updated Gaming Laptop Pro',
						price: 2199.99,
					})
				);
			});

			// BEHAVIOR: List should refresh after update
			await waitFor(() => {
				expect(mocks.getProducts).toHaveBeenCalled();
			});

			// BEHAVIOR: Dialog should close
			await waitFor(() => {
				expect(screen.queryByLabelText(/^Name/i)).not.toBeInTheDocument();
			});
		});
	});

	// ========================================================================
	// BEHAVIOR: Delete Flow
	// ========================================================================
	describe('Delete Flow', () => {
		it('should prompt for confirmation when clicking Delete button', async () => {
			const user = userEvent.setup();
			renderPage();

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Find row containing first product and its action buttons
			const firstProductCell = screen.getByText('Gaming Laptop');
			const firstDataRow = firstProductCell.closest('tr')!;
			const rowActionButtons = within(firstDataRow).getAllByRole('button');

			// Click last action button (Approach 1: Delete icon; Approach 2: MoreHorizontal trigger)
			await user.click(rowActionButtons[rowActionButtons.length - 1]);

			// If dropdown opened (Approach 2), find and click Delete menu item
			const deleteMenuItem = screen.queryByRole('menuitem', { name: /delete/i });
			if (deleteMenuItem) {
				await user.click(deleteMenuItem);
			}

			// BEHAVIOR: window.confirm should have been called (native confirmation)
			await waitFor(() => {
				expect(window.confirm).toHaveBeenCalled();
			});
		});

		it('should delete product and refresh list on confirmation', async () => {
			const user = userEvent.setup();
			renderPage();

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Clear initial getProducts calls before triggering delete
			mocks.getProducts.mockClear();

			// Find row containing first product and its action buttons
			const firstProductCell = screen.getByText('Gaming Laptop');
			const firstDataRow = firstProductCell.closest('tr')!;
			const rowActionButtons = within(firstDataRow).getAllByRole('button');

			// Click last action button (Approach 1: Delete icon; Approach 2: MoreHorizontal trigger)
			await user.click(rowActionButtons[rowActionButtons.length - 1]);

			// If dropdown opened (Approach 2), find and click Delete menu item
			const deleteMenuItem = screen.queryByRole('menuitem', { name: /delete/i });
			if (deleteMenuItem) {
				await user.click(deleteMenuItem);
			}

			// BEHAVIOR: Delete API should be called with product ID
			await waitFor(() => {
				expect(mocks.deleteProduct).toHaveBeenCalledWith('1'); // Gaming Laptop ID
			});

			// BEHAVIOR: List should refresh after delete
			await waitFor(() => {
				expect(mocks.getProducts).toHaveBeenCalled();
			});
		});

		it('should NOT delete product when canceling confirmation', async () => {
			// Override confirm to return false for this test (user cancels)
			vi.spyOn(window, 'confirm').mockReturnValue(false);

			const user = userEvent.setup();
			renderPage();

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Find row containing first product and its action buttons
			const firstProductCell = screen.getByText('Gaming Laptop');
			const firstDataRow = firstProductCell.closest('tr')!;
			const rowActionButtons = within(firstDataRow).getAllByRole('button');

			// Click last action button (Approach 1: Delete icon; Approach 2: MoreHorizontal trigger)
			await user.click(rowActionButtons[rowActionButtons.length - 1]);

			// If dropdown opened (Approach 2), find and click Delete menu item
			const deleteMenuItem = screen.queryByRole('menuitem', { name: /delete/i });
			if (deleteMenuItem) {
				await user.click(deleteMenuItem);
			}

			// BEHAVIOR: Delete API should NOT be called when confirmation is canceled
			await waitFor(() => {
				expect(mocks.deleteProduct).not.toHaveBeenCalled();
			});
		});
	});

	// ========================================================================
	// BEHAVIOR: Bulk Delete Flow
	// ========================================================================
	describe('Bulk Delete Flow', () => {
		it('should select multiple rows and enable bulk delete', async () => {
			const user = userEvent.setup();
			renderPage();

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Find checkboxes (Radix Checkbox renders as role="checkbox" buttons)
			const checkboxes = screen.getAllByRole('checkbox');
			expect(checkboxes.length).toBeGreaterThan(2); // Header + rows

			// Select first two rows (skip header checkbox at index 0)
			await user.click(checkboxes[1]);
			await user.click(checkboxes[2]);

			// BEHAVIOR: Bulk action bar should appear
			// queryAllByText handles multiple matches (e.g. "2 items selected" + "Delete Selected" button)
			await waitFor(() => {
				const selectedTexts = screen.queryAllByText(/selected/i);
				expect(selectedTexts.length).toBeGreaterThan(0);
			});

			// BEHAVIOR: Should show number of selected items
			expect(screen.getByText(/2.*selected/i)).toBeInTheDocument();
		});

		it('should bulk delete selected products on confirmation', async () => {
			const user = userEvent.setup();
			renderPage();

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Select first two rows
			const checkboxes = screen.getAllByRole('checkbox');
			await user.click(checkboxes[1]); // Gaming Laptop (id: 1)
			await user.click(checkboxes[2]); // Cotton T-Shirt (id: 2)

			// Wait for bulk action bar
			await waitFor(() => {
				expect(screen.getByText(/2.*selected/i)).toBeInTheDocument();
			});

			// Clear initial getProducts calls before triggering bulk delete
			mocks.getProducts.mockClear();

			// Find bulk delete button — text varies by approach ("Delete" or "Delete Selected")
			const bulkDeleteButton = screen.getByRole('button', { name: /delete/i });
			await user.click(bulkDeleteButton);

			// BEHAVIOR: Bulk delete API should be called with both IDs
			await waitFor(() => {
				expect(mocks.bulkDeleteProducts).toHaveBeenCalledWith(expect.arrayContaining(['1', '2']));
			});

			// BEHAVIOR: List should refresh after bulk delete
			await waitFor(() => {
				expect(mocks.getProducts).toHaveBeenCalled();
			});
		});

		it('should select all rows when clicking header checkbox', async () => {
			const user = userEvent.setup();
			renderPage();

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Find header checkbox (first checkbox — Radix Checkbox renders as role="checkbox")
			const checkboxes = screen.getAllByRole('checkbox');
			const headerCheckbox = checkboxes[0];

			// Click header checkbox to select all
			await user.click(headerCheckbox);

			// BEHAVIOR: All row checkboxes should be checked
			// Radix Checkbox uses aria-checked="true", not HTMLInputElement.checked
			await waitFor(() => {
				const allCheckboxes = screen.getAllByRole('checkbox');
				const checkedCount = allCheckboxes.filter(cb => cb.getAttribute('aria-checked') === 'true').length;
				expect(checkedCount).toBeGreaterThan(3); // At least header + 3 rows
			});

			// BEHAVIOR: Bulk action bar should show all items selected
			expect(screen.getByText(/5.*selected/i)).toBeInTheDocument();
		});

		it('should deselect all rows when clicking header checkbox again', async () => {
			const user = userEvent.setup();
			renderPage();

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Select all first
			const checkboxes = screen.getAllByRole('checkbox');
			const headerCheckbox = checkboxes[0];
			await user.click(headerCheckbox);

			// Wait for selection
			await waitFor(() => {
				expect(screen.getByText(/5.*selected/i)).toBeInTheDocument();
			});

			// Click header checkbox again to deselect all
			await user.click(headerCheckbox);

			// BEHAVIOR: All checkboxes should be unchecked
			// Radix Checkbox uses aria-checked attribute, not .checked property
			await waitFor(() => {
				const allCheckboxes = screen.getAllByRole('checkbox');
				const checkedCount = allCheckboxes.filter(cb => cb.getAttribute('aria-checked') === 'true').length;
				expect(checkedCount).toBe(0);
			});

			// BEHAVIOR: Bulk action bar should disappear
			await waitFor(() => {
				expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();
			});
		});
	});

	// ========================================================================
	// BEHAVIOR: Form Validation
	// ========================================================================
	describe('Form Validation', () => {
		it('should not submit form when validation fails', async () => {
			// Override validator to return validation failure for this test
			mocks.validateProductData.mockReturnValue({ valid: false, errors: [] });

			const user = userEvent.setup();
			renderPage();

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Open create dialog
			const buttons = screen.getAllByRole('button');
			const addButton = buttons.find(btn => btn.textContent?.match(/add|create|new/i));
			await user.click(addButton!);

			// Wait for dialog (exact label to avoid sort button aria-label conflicts)
			await waitFor(() => {
				expect(screen.getByLabelText(/^Name/i)).toBeInTheDocument();
			});

			// Clear the name field (required)
			const nameInput = screen.getByLabelText(/^Name/i);
			await user.clear(nameInput);

			// Try to save with validation set to fail
			const saveButton = screen.getByRole('button', { name: /create product|update product/i });
			await user.click(saveButton);

			// BEHAVIOR: Create API should NOT be called when validation fails
			await waitFor(() => {
				expect(mocks.createProduct).not.toHaveBeenCalled();
			});
		});
	});
});
