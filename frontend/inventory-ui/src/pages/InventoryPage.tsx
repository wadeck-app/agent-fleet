import { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { InventoryFilters } from '../components/features/InventoryFilters/InventoryFilters';
import { InventoryTable } from '../components/features/InventoryTable/InventoryTable';
import { InventoryForm, InventoryFormData } from '../components/features/InventoryForm/InventoryForm';
import { InventoryActionBar } from '../components/features/InventoryActionBar/InventoryActionBar';
import { useInventory } from '../hooks/useInventory';
import { useToast } from '../contexts/ToastContext';
import { TOAST_MESSAGES } from '../config/constants';
import styles from './InventoryPage.module.scss';

export const InventoryPage = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { showSuccess, showError } = useToast();
  const {
    items,
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
  } = useInventory();

  useEffect(() => {
    if (error) {
      showError('Error', error);
    }
  }, [error, showError]);

  const handleCreateItem = async (data: InventoryFormData) => {
    try {
      await createItem(data);
      setIsFormOpen(false);
      showSuccess('Success', TOAST_MESSAGES.SUCCESS.ITEM_CREATED);
    } catch (err) {
      showError('Error', TOAST_MESSAGES.ERROR.CREATE_FAILED);
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteItem(id);
      showSuccess('Success', TOAST_MESSAGES.SUCCESS.ITEM_DELETED);
    } catch (err) {
      showError('Error', TOAST_MESSAGES.ERROR.DELETE_FAILED);
    }
  };

  const handleDeleteSelectedItems = async () => {
    try {
      await deleteSelectedItems();
      showSuccess('Success', TOAST_MESSAGES.SUCCESS.ITEMS_DELETED);
    } catch (err) {
      showError('Error', TOAST_MESSAGES.ERROR.DELETE_ITEMS_FAILED);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading inventory...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  return (
    <>
      <div className={styles.header}>
        <Button variant="primary" onClick={() => setIsFormOpen(true)}>
          + Add Item
        </Button>
      </div>

      <InventoryFilters filters={filters} onFiltersChange={updateFilters} />

      <InventoryTable
        items={items}
        selectedIds={selectedIds}
        sortConfig={sortConfig}
        onToggleSelection={toggleItemSelection}
        onToggleAllSelection={toggleAllSelection}
        onSort={updateSort}
        onDelete={handleDeleteItem}
      />

      <InventoryActionBar
        selectedCount={selectedIds.size}
        onDeleteSelected={handleDeleteSelectedItems}
      />

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen} title="Add New Item">
        <InventoryForm onSubmit={handleCreateItem} onCancel={() => setIsFormOpen(false)} />
      </Dialog>
    </>
  );
};
