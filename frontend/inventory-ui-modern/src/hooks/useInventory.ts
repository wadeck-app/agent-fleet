/**
 * useInventory hook - Custom hook exposing inventory functionality
 * Following FRONTEND_WOW.md: Manages loading/error states, interfaces with service
 */

import { useState, useEffect, useCallback } from 'react';
import { getServiceContainer } from '@/lib/serviceContainer';
import { createErrorHandler } from '@/lib/errorHandling';
import { InventoryItem, CreateInventoryItemDto, InventoryFilters, SortConfig } from '@/types/inventory';

// Get service from container (dependency injection)
const { inventoryService } = getServiceContainer();

export function useInventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Filters and sorting state
  const [filters, setFilters] = useState<InventoryFilters>({
    searchQuery: '',
    deliveryTypes: [],
    minPrice: undefined,
    maxPrice: undefined,
  });
  const [sort, setSort] = useState<SortConfig>({
    field: 'name',
    direction: 'asc',
  });

  /**
   * Fetch inventory items
   */
  const fetchItems = useCallback(async (showLoadingState = true) => {
    const handleError = createErrorHandler(setError, 'Failed to fetch inventory', false);

    try {
      if (showLoadingState) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);
      const data = await inventoryService.getInventory(filters, sort);
      setItems(data);
    } catch (err) {
      handleError(err);
    } finally {
      if (showLoadingState) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
      setIsInitialLoad(false);
    }
  }, [filters, sort]);

  /**
   * Create a new item
   */
  const createItem = useCallback(async (dto: CreateInventoryItemDto) => {
    const handleError = createErrorHandler(setError, 'Failed to create item', true);

    try {
      setError(null);
      const newItem = await inventoryService.createItem(dto);
      await fetchItems(); // Refresh the list
      return newItem;
    } catch (err) {
      handleError(err);
    }
  }, [fetchItems]);

  /**
   * Delete a single item
   */
  const deleteItem = useCallback(async (id: string) => {
    const handleError = createErrorHandler(setError, 'Failed to delete item', true);

    try {
      setError(null);
      await inventoryService.deleteItem(id);
      await fetchItems(); // Refresh the list
    } catch (err) {
      handleError(err);
    }
  }, [fetchItems]);

  /**
   * Delete multiple items
   */
  const deleteItems = useCallback(async (ids: string[]) => {
    const handleError = createErrorHandler(setError, 'Failed to delete items', true);

    try {
      setError(null);
      await inventoryService.deleteItems(ids);
      await fetchItems(); // Refresh the list
    } catch (err) {
      handleError(err);
    }
  }, [fetchItems]);

  /**
   * Update filters
   */
  const updateFilters = useCallback((newFilters: Partial<InventoryFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  /**
   * Update sorting
   */
  const updateSort = useCallback((newSort: SortConfig) => {
    setSort(newSort);
  }, []);

  /**
   * Clear all filters
   */
  const clearFilters = useCallback(() => {
    setFilters({
      searchQuery: '',
      deliveryTypes: [],
      minPrice: undefined,
      maxPrice: undefined,
    });
  }, []);

  // Fetch items on mount and when filters/sort change
  useEffect(() => {
    // Show loading state only on initial load
    fetchItems(isInitialLoad);
  }, [fetchItems, isInitialLoad]);

  return {
    // Data
    items,
    loading,
    refreshing,
    error,
    filters,
    sort,

    // Actions
    createItem,
    deleteItem,
    deleteItems,
    updateFilters,
    updateSort,
    clearFilters,
    refresh: fetchItems,
  };
}
