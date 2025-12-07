import { useState, FormEvent } from 'react';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { Button } from '../../ui/Button';
import { DeliveryType } from '../../../types/inventory';
import { InventoryItemCreateSchema } from '../../../validation/schemas';
import { ZodError } from 'zod';
import styles from './InventoryForm.module.scss';

export interface InventoryFormData {
  name: string;
  description: string;
  quantity: number;
  price: number;
  deliveryType: DeliveryType;
}

export interface InventoryFormProps {
  onSubmit: (data: InventoryFormData) => void;
  onCancel: () => void;
}

const deliveryTypeOptions = [
  { value: 'Air', label: 'Air' },
  { value: 'Land', label: 'Land' },
];

export const InventoryForm = ({ onSubmit, onCancel }: InventoryFormProps) => {
  const [formData, setFormData] = useState<InventoryFormData>({
    name: '',
    description: '',
    quantity: 0,
    price: 0,
    deliveryType: 'Air',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof InventoryFormData, string>>>({});

  const validate = (): boolean => {
    try {
      InventoryItemCreateSchema.parse(formData);
      setErrors({});
      return true;
    } catch (err) {
      if (err instanceof ZodError) {
        const newErrors: Partial<Record<keyof InventoryFormData, string>> = {};
        err.errors.forEach((error) => {
          const field = error.path[0] as keyof InventoryFormData;
          if (field) {
            newErrors[field] = error.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(formData);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Input
        label="Name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        error={errors.name}
        fullWidth
        required
      />

      <Input
        label="Description"
        value={formData.description}
        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        error={errors.description}
        fullWidth
        required
      />

      <Input
        label="Quantity"
        type="number"
        value={formData.quantity.toString()}
        onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
        error={errors.quantity}
        fullWidth
        required
      />

      <Input
        label="Price"
        type="number"
        step="0.01"
        value={formData.price.toString()}
        onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
        error={errors.price}
        fullWidth
        required
      />

      <Select
        label="Delivery Type"
        value={formData.deliveryType}
        onValueChange={(value) => setFormData({ ...formData, deliveryType: value as DeliveryType })}
        options={deliveryTypeOptions}
        fullWidth
      />

      <div className={styles.actions}>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Add Item
        </Button>
      </div>
    </form>
  );
};
