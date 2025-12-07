/**
 * Inventory domain types
 * Following FRONTEND_WOW.md: Type-safe data structures
 */

export type DeliveryType = 'Air' | 'Land';

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
  price: number;
  deliveryType: DeliveryType;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInventoryItemDto {
  name: string;
  description: string;
  quantity: number;
  price: number;
  deliveryType: DeliveryType;
}

export interface UpdateInventoryItemDto extends Partial<CreateInventoryItemDto> {
  id: string;
}

export interface InventoryFilters {
  searchQuery: string;
  deliveryTypes: DeliveryType[];
  minPrice?: number;
  maxPrice?: number;
}

export type SortField = 'name' | 'quantity' | 'price' | 'deliveryType';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}
