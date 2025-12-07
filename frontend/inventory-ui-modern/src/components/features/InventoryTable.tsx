/**
 * InventoryTable - Feature component
 * Following FRONTEND_WOW.md: Composes generic components, receives data via props
 */

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ArrowUpDown, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { InventoryItem, SortConfig, SortField } from '@/types/inventory';
import { AnimationType } from '@/components/features/AnimationSettings';

export interface InventoryTableProps {
  items: InventoryItem[];
  selectedIds: string[];
  sortConfig: SortConfig;
  onSelectionChange: (ids: string[]) => void;
  onSortChange: (field: SortField) => void;
  onDelete: (id: string) => void;
  refreshing?: boolean;
  animationType?: AnimationType;
  showOverlay?: boolean;
}

export function InventoryTable({
  items,
  selectedIds,
  sortConfig,
  onSelectionChange,
  onSortChange,
  onDelete,
  refreshing = false,
  animationType = 'scale-center',
  showOverlay = true,
}: InventoryTableProps) {
  const allSelected = items.length > 0 && selectedIds.length === items.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < items.length;

  // Increment key version when items change to trigger animations
  const [keyVersion, setKeyVersion] = useState(0);

  useEffect(() => {
    setKeyVersion((v) => v + 1);
  }, [items]);

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(items.map((item) => item.id));
    }
  };

  const handleSelectItem = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((selectedId) => selectedId !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const handleSort = (field: SortField) => {
    onSortChange(field);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  // Animation variants based on type
  const getAnimationVariants = (index: number) => {
    const baseDelay = index * 0.03;

    switch (animationType) {
      case 'fade':
        return {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          transition: { duration: 0.3, delay: baseDelay },
        };
      case 'slide-up':
        return {
          initial: { opacity: 0, scale: 0.97 },
          animate: { opacity: 1, scale: 1 },
          transition: { duration: 0.3, delay: baseDelay },
        };
      case 'slide-down':
        return {
          initial: { opacity: 0, transform: 'translateY(-5px)' },
          animate: { opacity: 1, transform: 'translateY(0px)' },
          transition: { duration: 0.3, delay: baseDelay },
        };
      case 'scale-center':
        return {
          initial: { opacity: 0, scale: 0.95 },
          animate: { opacity: 1, scale: 1 },
          transition: { duration: 0.3, delay: baseDelay },
        };
      case 'scale-left':
        return {
          initial: { opacity: 0, scale: 0.95, x: -20 },
          animate: { opacity: 1, scale: 1, x: 0 },
          transition: { duration: 0.3, delay: baseDelay },
        };
      case 'scale-right':
        return {
          initial: { opacity: 0, scale: 0.95, x: 20 },
          animate: { opacity: 1, scale: 1, x: 0 },
          transition: { duration: 0.3, delay: baseDelay },
        };
      case 'flip':
        return {
          initial: { opacity: 0, rotateX: -90 },
          animate: { opacity: 1, rotateX: 0 },
          transition: { duration: 0.4, delay: baseDelay },
        };
      default:
        return {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.3, delay: baseDelay },
        };
    }
  };

  return (
    <div className="rounded-md border relative">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">
              <Checkbox
                checked={allSelected || (someSelected ? 'indeterminate' : false)}
                onCheckedChange={handleSelectAll}
                aria-label="Select all"
              />
            </TableHead>
            <TableHead>
              <button
                className="flex items-center gap-1 hover:text-foreground"
                onClick={() => handleSort('name')}
              >
                Name
                <ArrowUpDown className="h-3 w-3" />
              </button>
            </TableHead>
            <TableHead className="hidden md:table-cell">Description</TableHead>
            <TableHead>
              <button
                className="flex items-center gap-1 hover:text-foreground"
                onClick={() => handleSort('quantity')}
              >
                Quantity
                <ArrowUpDown className="h-3 w-3" />
              </button>
            </TableHead>
            <TableHead>
              <button
                className="flex items-center gap-1 hover:text-foreground"
                onClick={() => handleSort('price')}
              >
                Price
                <ArrowUpDown className="h-3 w-3" />
              </button>
            </TableHead>
            <TableHead>
              <button
                className="flex items-center gap-1 hover:text-foreground"
                onClick={() => handleSort('deliveryType')}
              >
                Delivery
                <ArrowUpDown className="h-3 w-3" />
              </button>
            </TableHead>
            <TableHead className="w-[80px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className={refreshing && showOverlay ? 'relative overflow-hidden' : 'overflow-hidden'}>
          {refreshing && showOverlay && (
            <tr className="absolute inset-0 pointer-events-none z-10">
              <td colSpan={7} className="p-0">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 bg-background/80 backdrop-blur-[2px] border-t"
                />
              </td>
            </tr>
          )}
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground h-32">
                No inventory items found
              </TableCell>
            </TableRow>
          ) : (
            items.map((item, index) => {
              const variants = getAnimationVariants(index);
              return (
                <motion.tr
                  key={`${item.id}-${keyVersion}`}
                  initial={variants.initial}
                  animate={variants.animate}
                  transition={variants.transition}
                  className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                  data-state={selectedIds.includes(item.id) ? 'selected' : undefined}
                  style={{ perspective: 1000 }}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(item.id)}
                      onCheckedChange={() => handleSelectItem(item.id)}
                      aria-label={`Select ${item.name}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {item.description}
                  </TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{formatPrice(item.price)}</TableCell>
                  <TableCell>
                    <Badge variant={item.deliveryType === 'Air' ? 'default' : 'secondary'}>
                      {item.deliveryType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(item.id)}
                      aria-label={`Delete ${item.name}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </motion.tr>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
