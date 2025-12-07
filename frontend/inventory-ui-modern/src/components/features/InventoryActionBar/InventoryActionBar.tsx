/**
 * InventoryActionBar - Feature component
 * Following FRONTEND_WOW.md: Composes generic components, receives data via props
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button/Button';

export interface InventoryActionBarProps {
  selectedCount: number;
  onDelete: () => void;
  onClearSelection: () => void;
}

export function InventoryActionBar({ selectedCount, onDelete, onClearSelection }: InventoryActionBarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="bg-card border border-border rounded-lg shadow-lg px-6 py-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {selectedCount} {selectedCount === 1 ? 'item' : 'items'} selected
              </span>
            </div>

            <div className="h-6 w-px bg-border" />

            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={onDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>

              <Button variant="ghost" size="sm" onClick={onClearSelection}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
