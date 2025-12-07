/**
 * InventoryService - Business logic and data transformation layer
 * Following FRONTEND_WOW.md: Transforms data, implements business rules
 */

import { InventoryRepository } from '@/repositories/InventoryRepository';
import { InventoryItem, CreateInventoryItemDto, InventoryFilters, SortConfig } from '@/types/inventory';

export class InventoryService {
  constructor(private repository: InventoryRepository) {}

  /**
   * Get all inventory items with optional filtering and sorting
   */
  async getInventory(filters?: InventoryFilters, sort?: SortConfig): Promise<InventoryItem[]> {
    let items = await this.repository.getAll();

    // Apply filters
    if (filters) {
      items = this.applyFilters(items, filters);
    }

    // Apply sorting
    if (sort) {
      items = this.applySorting(items, sort);
    }

    return items;
  }

  /**
   * Create a new inventory item
   */
  async createItem(dto: CreateInventoryItemDto): Promise<InventoryItem> {
    // Validate data
    this.validateCreateDto(dto);

    return await this.repository.create(dto);
  }

  /**
   * Delete a single inventory item
   */
  async deleteItem(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  /**
   * Delete multiple inventory items
   */
  async deleteItems(ids: string[]): Promise<void> {
    await this.repository.deleteBatch(ids);
  }

  /**
   * Apply filters to inventory items
   */
  private applyFilters(items: InventoryItem[], filters: InventoryFilters): InventoryItem[] {
    let filtered = [...items];

    // Search filter (name and description)
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query)
      );
    }

    // Delivery type filter
    if (filters.deliveryTypes.length > 0) {
      filtered = filtered.filter((item) => filters.deliveryTypes.includes(item.deliveryType));
    }

    // Price range filter
    if (filters.minPrice !== undefined) {
      filtered = filtered.filter((item) => item.price >= filters.minPrice!);
    }
    if (filters.maxPrice !== undefined) {
      filtered = filtered.filter((item) => item.price <= filters.maxPrice!);
    }

    return filtered;
  }

  /**
   * Apply sorting to inventory items
   */
  private applySorting(items: InventoryItem[], sort: SortConfig): InventoryItem[] {
    const sorted = [...items];

    sorted.sort((a, b) => {
      let compareValue = 0;

      switch (sort.field) {
        case 'name':
          compareValue = a.name.localeCompare(b.name);
          break;
        case 'quantity':
          compareValue = a.quantity - b.quantity;
          break;
        case 'price':
          compareValue = a.price - b.price;
          break;
        case 'deliveryType':
          compareValue = a.deliveryType.localeCompare(b.deliveryType);
          break;
      }

      return sort.direction === 'asc' ? compareValue : -compareValue;
    });

    return sorted;
  }

  /**
   * Validate create DTO
   */
  private validateCreateDto(dto: CreateInventoryItemDto): void {
    if (!dto.name || dto.name.trim().length === 0) {
      throw new Error('Name is required');
    }
    if (!dto.description || dto.description.trim().length === 0) {
      throw new Error('Description is required');
    }
    if (dto.quantity < 0) {
      throw new Error('Quantity must be non-negative');
    }
    if (dto.price <= 0) {
      throw new Error('Price must be greater than 0');
    }
  }
}
