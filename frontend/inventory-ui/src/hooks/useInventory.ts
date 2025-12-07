import { useState, useEffect, useMemo } from 'react';
import { InventoryItem, InventoryFilters } from '../types/inventory';
import { InventoryService } from '../services/InventoryService';
import { InventoryRepository } from '../repositories/InventoryRepository';
import { DEFAULT_FILTERS } from '../config/constants';

const repository = new InventoryRepository();
const service = new InventoryService(repository);

export const useInventory = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_FILTERS);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof InventoryItem;
    direction: 'asc' | 'desc';
  }>({
    key: 'name',
    direction: 'asc',
  });

  // Load items on mount
  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await service.getAllItems();
      setItems(data);
    } catch (err) {
      const errorMessage = 'Failed to load inventory items';
      setError(errorMessage);
      console.error(err);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const createItem = async (item: Omit<InventoryItem, 'id'>) => {
    try {
      const newItem = await service.createItem(item);
      setItems((prev) => [...prev, newItem]);
      return newItem;
    } catch (err) {
      const errorMessage = 'Failed to create item';
      setError(errorMessage);
      console.error(err);
      throw new Error(errorMessage);
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await service.deleteItem(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setSelectedIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (err) {
      const errorMessage = 'Failed to delete item';
      setError(errorMessage);
      console.error(err);
      throw new Error(errorMessage);
    }
  };

  const deleteSelectedItems = async () => {
    try {
      const ids = Array.from(selectedIds);
      await service.deleteItems(ids);
      setItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));
      setSelectedIds(new Set());
    } catch (err) {
      const errorMessage = 'Failed to delete selected items';
      setError(errorMessage);
      console.error(err);
      throw new Error(errorMessage);
    }
  };

  const toggleItemSelection = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleAllSelection = (allIds: string[]) => {
    if (selectedIds.size === allIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const updateFilters = (newFilters: Partial<InventoryFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const updateSort = (key: keyof InventoryItem) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Filter and sort items
  const filteredAndSortedItems = useMemo(() => {
    const filtered = service.filterItems(items, filters);
    return service.sortItems(filtered, sortConfig.key, sortConfig.direction);
  }, [items, filters, sortConfig]);

  return {
    items: filteredAndSortedItems,
    loading,
    error,
    selectedIds,
    filters,
    sortConfig,
    createItem,
    deleteItem,
    deleteSelectedItems,
    toggleItemSelection,
    toggleAllSelection,
    updateFilters,
    updateSort,
  };
};
