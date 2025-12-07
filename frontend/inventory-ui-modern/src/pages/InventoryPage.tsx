/**
 * InventoryPage - Page component
 * Following FRONTEND_WOW.md: Purely compositional, minimal styling, manages shared state
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout/MainLayout';
import { InventoryTable } from '@/components/features/InventoryTable/InventoryTable';
import { InventoryFilters } from '@/components/features/InventoryFilters/InventoryFilters';
import { InventoryForm } from '@/components/features/InventoryForm/InventoryForm';
import { InventoryActionBar } from '@/components/features/InventoryActionBar/InventoryActionBar';
import { DeleteConfirmDialog } from '@/components/features/DeleteConfirmDialog/DeleteConfirmDialog';
import { ThemeToggle } from '@/components/features/ThemeToggle/ThemeToggle';
import { AnimationSettings, AnimationConfig } from '@/components/features/AnimationSettings/AnimationSettings';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog/Dialog';
import { Button } from '@/components/ui/Button/Button';
import { TableSkeleton } from '@/components/ui/TableSkeleton/TableSkeleton';
import { useInventory } from '@/hooks/useInventory';
import { useToast } from '@/hooks/useToast';
import { CreateInventoryItemDto, SortField } from '@/types/inventory';

export function InventoryPage() {
  const {
    items,
    loading,
    refreshing,
    error,
    filters,
    sort,
    createItem,
    deleteItem,
    deleteItems,
    updateFilters,
    updateSort,
    clearFilters,
  } = useInventory();

  const { toast } = useToast();

  // UI state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    itemId?: string;
    isBatch?: boolean;
  }>({ open: false });
  const [animationConfig, setAnimationConfig] = useState<AnimationConfig>({
    type: 'scale-center',
    showOverlay: true,
  });

  /**
   * Handle create item
   */
  const handleCreateItem = async (data: CreateInventoryItemDto) => {
    try {
      await createItem(data);
      setShowCreateDialog(false);
      toast({
        title: 'Success',
        description: 'Item added successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create item',
        variant: 'destructive',
      });
      throw error; // Re-throw to prevent dialog from closing
    }
  };

  /**
   * Handle delete single item
   */
  const handleDeleteClick = (itemId: string) => {
    setDeleteConfirm({ open: true, itemId });
  };

  /**
   * Handle delete batch
   */
  const handleBatchDeleteClick = () => {
    setDeleteConfirm({ open: true, isBatch: true });
  };

  /**
   * Confirm delete action
   */
  const handleDeleteConfirm = async () => {
    try {
      if (deleteConfirm.isBatch) {
        await deleteItems(selectedIds);
        setSelectedIds([]);
        toast({
          title: 'Success',
          description: `${selectedIds.length} item(s) deleted successfully`,
        });
      } else if (deleteConfirm.itemId) {
        await deleteItem(deleteConfirm.itemId);
        toast({
          title: 'Success',
          description: 'Item deleted successfully',
        });
      }
      setDeleteConfirm({ open: false });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete item(s)',
        variant: 'destructive',
      });
    }
  };

  /**
   * Handle sort change
   */
  const handleSortChange = (field: SortField) => {
    const newDirection = sort.field === field && sort.direction === 'asc' ? 'desc' : 'asc';
    updateSort({ field, direction: newDirection });
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Inventory Management</h1>
            <p className="text-muted-foreground mt-1">
              Manage your inventory items with ease
            </p>
          </div>
          <div className="flex gap-2">
            <ThemeToggle />
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </div>
        </div>

        {/* Animation Settings */}
        <AnimationSettings config={animationConfig} onChange={setAnimationConfig} />

        {/* Filters */}
        <InventoryFilters
          filters={filters}
          onFiltersChange={updateFilters}
          onClearFilters={clearFilters}
        />

        {/* Error Display */}
        {error && (
          <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {/* Loading State with Skeleton */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <TableSkeleton rows={8} columns={5} showCheckbox showActions />
            </motion.div>
          ) : (
            <motion.div
              key="table"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="relative"
            >
              <InventoryTable
                items={items}
                selectedIds={selectedIds}
                sortConfig={sort}
                onSelectionChange={setSelectedIds}
                onSortChange={handleSortChange}
                onDelete={handleDeleteClick}
                refreshing={refreshing}
                animationType={animationConfig.type}
                showOverlay={animationConfig.showOverlay}
              />

              {/* Results Count */}
              <div className="text-sm text-muted-foreground mt-4">
                Showing {items.length} item{items.length !== 1 ? 's' : ''}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Bar */}
        <InventoryActionBar
          selectedCount={selectedIds.length}
          onDelete={handleBatchDeleteClick}
          onClearSelection={() => setSelectedIds([])}
        />

        {/* Create Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Item</DialogTitle>
            </DialogHeader>
            <InventoryForm
              onSubmit={handleCreateItem}
              onCancel={() => setShowCreateDialog(false)}
            />
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          open={deleteConfirm.open}
          title={deleteConfirm.isBatch ? 'Delete Multiple Items' : 'Delete Item'}
          description={
            deleteConfirm.isBatch
              ? `Are you sure you want to delete ${selectedIds.length} item(s)? This action cannot be undone.`
              : 'Are you sure you want to delete this item? This action cannot be undone.'
          }
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirm({ open: false })}
        />
      </div>
    </MainLayout>
  );
}
