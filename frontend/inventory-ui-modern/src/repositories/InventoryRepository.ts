/**
 * InventoryRepository - Data access layer
 * Following FRONTEND_WOW.md: Encapsulates all API calls, returns raw data
 *
 * NOTE: This is a mock implementation for demonstration purposes
 * In production, this would make actual API calls
 */

import { InventoryItem, CreateInventoryItemDto, DeliveryType } from '@/types/inventory';

// Mock data generation
function generateMockData(): InventoryItem[] {
  const items: InventoryItem[] = [
    {
      id: '1',
      name: 'Laptop Computer',
      description: 'High-performance business laptop with 16GB RAM',
      quantity: 45,
      price: 1299.99,
      deliveryType: 'Air',
      createdAt: new Date('2024-01-15'),
      updatedAt: new Date('2024-01-15'),
    },
    {
      id: '2',
      name: 'Office Chair',
      description: 'Ergonomic office chair with lumbar support',
      quantity: 120,
      price: 349.50,
      deliveryType: 'Land',
      createdAt: new Date('2024-01-16'),
      updatedAt: new Date('2024-01-16'),
    },
    {
      id: '3',
      name: 'Wireless Mouse',
      description: 'Bluetooth wireless mouse with precision tracking',
      quantity: 200,
      price: 29.99,
      deliveryType: 'Air',
      createdAt: new Date('2024-01-17'),
      updatedAt: new Date('2024-01-17'),
    },
    {
      id: '4',
      name: 'Standing Desk',
      description: 'Electric height-adjustable standing desk',
      quantity: 35,
      price: 799.00,
      deliveryType: 'Land',
      createdAt: new Date('2024-01-18'),
      updatedAt: new Date('2024-01-18'),
    },
    {
      id: '5',
      name: 'USB-C Cable',
      description: '6ft USB-C to USB-C charging cable',
      quantity: 500,
      price: 12.99,
      deliveryType: 'Air',
      createdAt: new Date('2024-01-19'),
      updatedAt: new Date('2024-01-19'),
    },
    {
      id: '6',
      name: 'Monitor 27"',
      description: '4K UHD monitor with HDR support',
      quantity: 78,
      price: 449.99,
      deliveryType: 'Land',
      createdAt: new Date('2024-01-20'),
      updatedAt: new Date('2024-01-20'),
    },
    {
      id: '7',
      name: 'Mechanical Keyboard',
      description: 'RGB mechanical keyboard with Cherry MX switches',
      quantity: 150,
      price: 129.99,
      deliveryType: 'Air',
      createdAt: new Date('2024-01-21'),
      updatedAt: new Date('2024-01-21'),
    },
    {
      id: '8',
      name: 'Desk Lamp',
      description: 'LED desk lamp with adjustable brightness',
      quantity: 95,
      price: 39.99,
      deliveryType: 'Land',
      createdAt: new Date('2024-01-22'),
      updatedAt: new Date('2024-01-22'),
    },
    {
      id: '9',
      name: 'Laptop Stand',
      description: 'Aluminum laptop stand with cooling ventilation',
      quantity: 180,
      price: 49.99,
      deliveryType: 'Air',
      createdAt: new Date('2024-01-23'),
      updatedAt: new Date('2024-01-23'),
    },
    {
      id: '10',
      name: 'Webcam HD',
      description: '1080p webcam with auto-focus and noise cancellation',
      quantity: 65,
      price: 89.99,
      deliveryType: 'Air',
      createdAt: new Date('2024-01-24'),
      updatedAt: new Date('2024-01-24'),
    },
    {
      id: '11',
      name: 'Printer',
      description: 'Color laser printer with wireless connectivity',
      quantity: 42,
      price: 299.99,
      deliveryType: 'Land',
      createdAt: new Date('2024-01-25'),
      updatedAt: new Date('2024-01-25'),
    },
    {
      id: '12',
      name: 'External SSD 1TB',
      description: 'Portable external SSD with USB 3.2 Gen 2',
      quantity: 130,
      price: 119.99,
      deliveryType: 'Air',
      createdAt: new Date('2024-01-26'),
      updatedAt: new Date('2024-01-26'),
    },
    {
      id: '13',
      name: 'Desk Organizer',
      description: 'Wooden desk organizer with multiple compartments',
      quantity: 220,
      price: 24.99,
      deliveryType: 'Land',
      createdAt: new Date('2024-01-27'),
      updatedAt: new Date('2024-01-27'),
    },
    {
      id: '14',
      name: 'Headphones',
      description: 'Noise-canceling wireless headphones with microphone',
      quantity: 88,
      price: 199.99,
      deliveryType: 'Air',
      createdAt: new Date('2024-01-28'),
      updatedAt: new Date('2024-01-28'),
    },
    {
      id: '15',
      name: 'Cable Management Kit',
      description: 'Complete cable management solution for desk setup',
      quantity: 310,
      price: 19.99,
      deliveryType: 'Air',
      createdAt: new Date('2024-01-29'),
      updatedAt: new Date('2024-01-29'),
    },
    {
      id: '16',
      name: 'Whiteboard',
      description: 'Magnetic dry-erase whiteboard 4x3 feet',
      quantity: 55,
      price: 79.99,
      deliveryType: 'Land',
      createdAt: new Date('2024-01-30'),
      updatedAt: new Date('2024-01-30'),
    },
    {
      id: '17',
      name: 'Phone Charger',
      description: 'Fast charging USB-C phone charger 20W',
      quantity: 400,
      price: 15.99,
      deliveryType: 'Air',
      createdAt: new Date('2024-01-31'),
      updatedAt: new Date('2024-01-31'),
    },
    {
      id: '18',
      name: 'Filing Cabinet',
      description: '3-drawer metal filing cabinet with lock',
      quantity: 28,
      price: 159.99,
      deliveryType: 'Land',
      createdAt: new Date('2024-02-01'),
      updatedAt: new Date('2024-02-01'),
    },
  ];

  return items;
}

// In-memory storage for mock data
let mockInventory: InventoryItem[] = generateMockData();

export class InventoryRepository {
  /**
   * Fetch all inventory items
   */
  async getAll(): Promise<InventoryItem[]> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 300));
    return [...mockInventory];
  }

  /**
   * Create a new inventory item
   */
  async create(dto: CreateInventoryItemDto): Promise<InventoryItem> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    const newItem: InventoryItem = {
      id: Date.now().toString(),
      ...dto,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockInventory.push(newItem);
    return newItem;
  }

  /**
   * Delete an inventory item
   */
  async delete(id: string): Promise<void> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 300));
    mockInventory = mockInventory.filter((item) => item.id !== id);
  }

  /**
   * Delete multiple inventory items
   */
  async deleteBatch(ids: string[]): Promise<void> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 300));
    mockInventory = mockInventory.filter((item) => !ids.includes(item.id));
  }
}
