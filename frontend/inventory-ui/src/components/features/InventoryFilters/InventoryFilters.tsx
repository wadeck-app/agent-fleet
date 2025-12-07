import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { InventoryFilters as Filters } from '../../../types/inventory';
import styles from './InventoryFilters.module.scss';

export interface InventoryFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Partial<Filters>) => void;
}

const deliveryTypeOptions = [
  { value: 'all', label: 'All Types' },
  { value: 'Air', label: 'Air' },
  { value: 'Land', label: 'Land' },
];

export const InventoryFilters = ({ filters, onFiltersChange }: InventoryFiltersProps) => {
  return (
    <div className={styles.filters}>
      <Input
        type="text"
        placeholder="Search by name or description..."
        value={filters.searchQuery}
        onChange={(e) => onFiltersChange({ searchQuery: e.target.value })}
        fullWidth
      />

      <Select
        value={filters.deliveryType}
        onValueChange={(value) => onFiltersChange({ deliveryType: value as Filters['deliveryType'] })}
        options={deliveryTypeOptions}
        placeholder="Filter by delivery type"
        label="Delivery Type"
      />

      <div className={styles.priceRange}>
        <Input
          type="number"
          label="Min Price"
          value={filters.minPrice.toString()}
          onChange={(e) => onFiltersChange({ minPrice: Number(e.target.value) })}
          fullWidth
        />
        <Input
          type="number"
          label="Max Price"
          value={filters.maxPrice.toString()}
          onChange={(e) => onFiltersChange({ maxPrice: Number(e.target.value) })}
          fullWidth
        />
      </div>
    </div>
  );
};
