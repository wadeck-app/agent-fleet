/**
 * InventoryFilters - Feature component
 * Following FRONTEND_WOW.md: Composes generic components, receives data via props
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, X } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { DeliveryType, InventoryFilters as Filters } from '@/types/inventory';

export interface InventoryFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Partial<Filters>) => void;
  onClearFilters: () => void;
}

export function InventoryFilters({ filters, onFiltersChange, onClearFilters }: InventoryFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.searchQuery);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      onFiltersChange({ searchQuery: searchInput });
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput, onFiltersChange]);

  const handleDeliveryTypeChange = (value: string) => {
    const deliveryTypes: DeliveryType[] = value === 'all' ? [] : [value as DeliveryType];
    onFiltersChange({ deliveryTypes });
  };

  const handleMinPriceChange = (value: string) => {
    const minPrice = value ? parseFloat(value) : undefined;
    onFiltersChange({ minPrice });
  };

  const handleMaxPriceChange = (value: string) => {
    const maxPrice = value ? parseFloat(value) : undefined;
    onFiltersChange({ maxPrice });
  };

  const hasActiveFilters =
    filters.searchQuery ||
    filters.deliveryTypes.length > 0 ||
    filters.minPrice !== undefined ||
    filters.maxPrice !== undefined;

  const currentDeliveryType = filters.deliveryTypes.length === 0 ? 'all' : filters.deliveryTypes[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by name or description..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Delivery Type Filter */}
        <Select value={currentDeliveryType} onValueChange={handleDeliveryTypeChange}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Delivery Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="Air">Air</SelectItem>
            <SelectItem value="Land">Land</SelectItem>
          </SelectContent>
        </Select>

        {/* Advanced Filters Toggle */}
        <Button
          variant="outline"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full sm:w-auto"
        >
          <Filter className="h-4 w-4 mr-2" />
          Filters
        </Button>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Button variant="ghost" onClick={onClearFilters} className="w-full sm:w-auto">
              <X className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </motion.div>
        )}
      </div>

      {/* Advanced Filters Panel */}
      {showAdvanced && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="border rounded-md p-4 space-y-4">
            <h3 className="text-sm font-semibold">Price Range</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="minPrice" className="text-sm text-muted-foreground block mb-1">
                  Min Price
                </label>
                <Input
                  id="minPrice"
                  type="number"
                  placeholder="0"
                  value={filters.minPrice ?? ''}
                  onChange={(e) => handleMinPriceChange(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label htmlFor="maxPrice" className="text-sm text-muted-foreground block mb-1">
                  Max Price
                </label>
                <Input
                  id="maxPrice"
                  type="number"
                  placeholder="1000"
                  value={filters.maxPrice ?? ''}
                  onChange={(e) => handleMaxPriceChange(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-wrap gap-2"
        >
          {filters.searchQuery && (
            <Badge variant="secondary">
              Search: {filters.searchQuery}
            </Badge>
          )}
          {filters.deliveryTypes.length > 0 && (
            <Badge variant="secondary">
              Delivery: {filters.deliveryTypes.join(', ')}
            </Badge>
          )}
          {filters.minPrice !== undefined && (
            <Badge variant="secondary">
              Min: ${filters.minPrice.toFixed(2)}
            </Badge>
          )}
          {filters.maxPrice !== undefined && (
            <Badge variant="secondary">
              Max: ${filters.maxPrice.toFixed(2)}
            </Badge>
          )}
        </motion.div>
      )}
    </div>
  );
}
