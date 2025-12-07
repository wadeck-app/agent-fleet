import { InventoryFilters } from '../types/inventory';

export const DEFAULT_FILTERS: InventoryFilters = {
  searchQuery: '',
  deliveryType: 'all',
  minPrice: 0,
  maxPrice: 2000,
};

export const TOAST_MESSAGES = {
  SUCCESS: {
    ITEM_CREATED: 'Item successfully added to inventory',
    ITEM_DELETED: 'Item successfully deleted',
    ITEMS_DELETED: 'Selected items successfully deleted',
  },
  ERROR: {
    LOAD_FAILED: 'Failed to load inventory items',
    CREATE_FAILED: 'Failed to create item',
    DELETE_FAILED: 'Failed to delete item',
    DELETE_ITEMS_FAILED: 'Failed to delete selected items',
    VALIDATION_FAILED: 'Please check the form for errors',
  },
};

export const VALIDATION_CONSTRAINTS = {
  NAME: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 100,
  },
  DESCRIPTION: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 500,
  },
  QUANTITY: {
    MIN: 0,
    MAX: 999999,
  },
  PRICE: {
    MIN: 0.01,
    MAX: 999999.99,
  },
};
