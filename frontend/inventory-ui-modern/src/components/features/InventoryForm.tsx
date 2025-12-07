/**
 * InventoryForm - Feature component
 * Following FRONTEND_WOW.md: Composes generic components, receives data via props
 */

import { useState, FormEvent } from 'react';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { CreateInventoryItemDto, DeliveryType } from '@/types/inventory';

export interface InventoryFormProps {
  onSubmit: (data: CreateInventoryItemDto) => Promise<void>;
  onCancel: () => void;
}

export function InventoryForm({ onSubmit, onCancel }: InventoryFormProps) {
  const [formData, setFormData] = useState<CreateInventoryItemDto>({
    name: '',
    description: '',
    quantity: 0,
    price: 0,
    deliveryType: 'Air',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }
    if (formData.quantity < 0) {
      newErrors.quantity = 'Quantity must be non-negative';
    }
    if (formData.price <= 0) {
      newErrors.price = 'Price must be greater than 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit(formData);
      // Reset form on success
      setFormData({
        name: '',
        description: '',
        quantity: 0,
        price: 0,
        deliveryType: 'Air',
      });
      setErrors({});
    } catch (error) {
      // Error is handled by parent component
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name Field */}
      <div className="space-y-2">
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Enter item name"
          disabled={submitting}
        />
        {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
      </div>

      {/* Description Field */}
      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <Input
          id="description"
          type="text"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Enter item description"
          disabled={submitting}
        />
        {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
      </div>

      {/* Quantity and Price Fields */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="quantity">Quantity *</Label>
          <Input
            id="quantity"
            type="number"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
            placeholder="0"
            min="0"
            disabled={submitting}
          />
          {errors.quantity && <p className="text-sm text-destructive">{errors.quantity}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="price">Price ($) *</Label>
          <Input
            id="price"
            type="number"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
            min="0"
            step="0.01"
            disabled={submitting}
          />
          {errors.price && <p className="text-sm text-destructive">{errors.price}</p>}
        </div>
      </div>

      {/* Delivery Type Field */}
      <div className="space-y-2">
        <Label htmlFor="deliveryType">Delivery Type *</Label>
        <Select
          value={formData.deliveryType}
          onValueChange={(value) => setFormData({ ...formData, deliveryType: value as DeliveryType })}
          disabled={submitting}
        >
          <SelectTrigger id="deliveryType">
            <SelectValue placeholder="Select delivery type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Air">Air</SelectItem>
            <SelectItem value="Land">Land</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Adding...' : 'Add Item'}
        </Button>
      </div>
    </form>
  );
}
