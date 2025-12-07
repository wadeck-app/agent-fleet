import { InventoryItem, InventoryFilters } from '../types/inventory';
import { InventoryRepository } from '../repositories/InventoryRepository';
import {
  InventoryItemSchema,
  InventoryItemCreateSchema,
  InventoryFiltersSchema,
} from '../validation/schemas';

export class InventoryService {
  constructor(private repository: InventoryRepository) {}

  async getAllItems(): Promise<InventoryItem[]> {
    const items = await this.repository.getAll();
    return items.map((item) => InventoryItemSchema.parse(item));
  }

  async createItem(item: Omit<InventoryItem, 'id'>): Promise<InventoryItem> {
    const validatedItem = InventoryItemCreateSchema.parse(item);
    const createdItem = await this.repository.create(validatedItem);
    return InventoryItemSchema.parse(createdItem);
  }

  async deleteItem(id: string): Promise<void> {
    if (typeof id !== 'string' || id.trim() === '') {
      throw new Error('Invalid item ID');
    }
    return this.repository.delete(id);
  }

  async deleteItems(ids: string[]): Promise<void> {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('Invalid item IDs');
    }
    return this.repository.deleteMultiple(ids);
  }

  filterItems(items: InventoryItem[], filters: InventoryFilters): InventoryItem[] {
    const validatedFilters = InventoryFiltersSchema.parse(filters);

    return items.filter((item) => {
      // Search filter
      const matchesSearch =
        !validatedFilters.searchQuery ||
        item.name.toLowerCase().includes(validatedFilters.searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(validatedFilters.searchQuery.toLowerCase());

      // Delivery type filter
      const matchesDeliveryType =
        validatedFilters.deliveryType === 'all' || item.deliveryType === validatedFilters.deliveryType;

      // Price range filter
      const matchesPriceRange =
        item.price >= validatedFilters.minPrice && item.price <= validatedFilters.maxPrice;

      return matchesSearch && matchesDeliveryType && matchesPriceRange;
    });
  }

  sortItems(
    items: InventoryItem[],
    sortKey: keyof InventoryItem,
    sortDirection: 'asc' | 'desc'
  ): InventoryItem[] {
    return [...items].sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }

      return 0;
    });
  }
}
