import { z } from 'zod';
import { VALIDATION_CONSTRAINTS } from '../config/constants';

export const DeliveryTypeSchema = z.enum(['Air', 'Land']);

export const InventoryItemSchema = z.object({
  id: z.string().min(1),
  name: z
    .string()
    .min(VALIDATION_CONSTRAINTS.NAME.MIN_LENGTH, 'Name is required')
    .max(VALIDATION_CONSTRAINTS.NAME.MAX_LENGTH, `Name must be less than ${VALIDATION_CONSTRAINTS.NAME.MAX_LENGTH} characters`),
  description: z
    .string()
    .min(VALIDATION_CONSTRAINTS.DESCRIPTION.MIN_LENGTH, 'Description is required')
    .max(VALIDATION_CONSTRAINTS.DESCRIPTION.MAX_LENGTH, `Description must be less than ${VALIDATION_CONSTRAINTS.DESCRIPTION.MAX_LENGTH} characters`),
  quantity: z
    .number()
    .int('Quantity must be a whole number')
    .min(VALIDATION_CONSTRAINTS.QUANTITY.MIN, `Quantity must be at least ${VALIDATION_CONSTRAINTS.QUANTITY.MIN}`)
    .max(VALIDATION_CONSTRAINTS.QUANTITY.MAX, `Quantity must be less than ${VALIDATION_CONSTRAINTS.QUANTITY.MAX}`),
  price: z
    .number()
    .min(VALIDATION_CONSTRAINTS.PRICE.MIN, `Price must be at least ${VALIDATION_CONSTRAINTS.PRICE.MIN}`)
    .max(VALIDATION_CONSTRAINTS.PRICE.MAX, `Price must be less than ${VALIDATION_CONSTRAINTS.PRICE.MAX}`),
  deliveryType: DeliveryTypeSchema,
});

export const InventoryItemCreateSchema = InventoryItemSchema.omit({ id: true });

export const InventoryFiltersSchema = z.object({
  searchQuery: z.string(),
  deliveryType: z.union([z.literal('all'), DeliveryTypeSchema]),
  minPrice: z.number().min(0),
  maxPrice: z.number().min(0),
});

export type InventoryItemValidated = z.infer<typeof InventoryItemSchema>;
export type InventoryItemCreateValidated = z.infer<typeof InventoryItemCreateSchema>;
export type InventoryFiltersValidated = z.infer<typeof InventoryFiltersSchema>;
