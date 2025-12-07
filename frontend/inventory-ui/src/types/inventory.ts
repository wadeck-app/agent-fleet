export type DeliveryType = 'Air' | 'Land';

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
  price: number;
  deliveryType: DeliveryType;
}

export interface InventoryFilters {
  searchQuery: string;
  deliveryType: 'all' | DeliveryType;
  minPrice: number;
  maxPrice: number;
}
