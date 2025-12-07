import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../ui/Table';
import { Checkbox } from '../../ui/Checkbox';
import { Button } from '../../ui/Button';
import { TrashIcon } from '../../ui/icons/TrashIcon';
import { InventoryItem } from '../../../types/inventory';
import styles from './InventoryTable.module.scss';

export interface InventoryTableProps {
  items: InventoryItem[];
  selectedIds: Set<string>;
  sortConfig: {
    key: keyof InventoryItem;
    direction: 'asc' | 'desc';
  };
  onToggleSelection: (id: string) => void;
  onToggleAllSelection: (allIds: string[]) => void;
  onSort: (key: keyof InventoryItem) => void;
  onDelete: (id: string) => void;
}

export const InventoryTable = ({
  items,
  selectedIds,
  sortConfig,
  onToggleSelection,
  onToggleAllSelection,
  onSort,
  onDelete,
}: InventoryTableProps) => {
  const allIds = items.map((item) => item.id);
  const allSelected = items.length > 0 && selectedIds.size === items.length;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this item?')) {
      onDelete(id);
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <Checkbox
              checked={allSelected}
              onCheckedChange={() => onToggleAllSelection(allIds)}
            />
          </TableHead>
          <TableHead
            sortable
            onSort={() => onSort('name')}
            sortDirection={sortConfig.key === 'name' ? sortConfig.direction : null}
          >
            Name
          </TableHead>
          <TableHead>Description</TableHead>
          <TableHead
            sortable
            onSort={() => onSort('quantity')}
            sortDirection={sortConfig.key === 'quantity' ? sortConfig.direction : null}
          >
            Quantity
          </TableHead>
          <TableHead
            sortable
            onSort={() => onSort('price')}
            sortDirection={sortConfig.key === 'price' ? sortConfig.direction : null}
          >
            Price
          </TableHead>
          <TableHead
            sortable
            onSort={() => onSort('deliveryType')}
            sortDirection={sortConfig.key === 'deliveryType' ? sortConfig.direction : null}
          >
            Delivery Type
          </TableHead>
          <TableHead align="center">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell align="center">
              <span className={styles.emptyMessage}>No items found</span>
            </TableCell>
          </TableRow>
        ) : (
          items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={() => onToggleSelection(item.id)}
                />
              </TableCell>
              <TableCell>
                <span className={styles.itemName}>{item.name}</span>
              </TableCell>
              <TableCell>
                <span className={styles.description}>{item.description}</span>
              </TableCell>
              <TableCell>
                <span className={item.quantity === 0 ? styles.outOfStock : ''}>
                  {item.quantity}
                </span>
              </TableCell>
              <TableCell>{formatPrice(item.price)}</TableCell>
              <TableCell>
                <span className={styles.deliveryBadge} data-type={item.deliveryType.toLowerCase()}>
                  {item.deliveryType}
                </span>
              </TableCell>
              <TableCell align="center">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={(e) => handleDeleteClick(e, item.id)}
                  title="Delete item"
                >
                  <TrashIcon />
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
};
