import { InventoryItem } from '../types/inventory';

// Mock data - In a real app, this would be API calls
const mockInventoryItems: InventoryItem[] = [
  {
    id: '1',
    name: 'Laptop Computer',
    description: 'High-performance laptop for business use',
    quantity: 15,
    price: 1299.99,
    deliveryType: 'Air',
  },
  {
    id: '2',
    name: 'Office Chair',
    description: 'Ergonomic office chair with lumbar support',
    quantity: 42,
    price: 249.99,
    deliveryType: 'Land',
  },
  {
    id: '3',
    name: 'Wireless Mouse',
    description: 'Bluetooth wireless mouse with precision tracking',
    quantity: 87,
    price: 29.99,
    deliveryType: 'Air',
  },
  {
    id: '4',
    name: 'Standing Desk',
    description: 'Adjustable height standing desk',
    quantity: 23,
    price: 449.99,
    deliveryType: 'Land',
  },
  {
    id: '5',
    name: 'USB-C Hub',
    description: '7-in-1 USB-C multiport adapter',
    quantity: 64,
    price: 59.99,
    deliveryType: 'Air',
  },
  {
    id: '6',
    name: 'Monitor Stand',
    description: 'Adjustable monitor riser with storage',
    quantity: 31,
    price: 39.99,
    deliveryType: 'Land',
  },
  {
    id: '7',
    name: 'Mechanical Keyboard',
    description: 'RGB backlit mechanical gaming keyboard',
    quantity: 19,
    price: 149.99,
    deliveryType: 'Air',
  },
  {
    id: '8',
    name: 'Desk Lamp',
    description: 'LED desk lamp with adjustable brightness',
    quantity: 56,
    price: 34.99,
    deliveryType: 'Land',
  },
  {
    id: '9',
    name: 'Webcam HD',
    description: '1080p HD webcam with built-in microphone',
    quantity: 0,
    price: 79.99,
    deliveryType: 'Air',
  },
  {
    id: '10',
    name: 'Filing Cabinet',
    description: '3-drawer metal filing cabinet',
    quantity: 12,
    price: 189.99,
    deliveryType: 'Land',
  },
  {
    id: '11',
    name: 'Wireless Headphones',
    description: 'Noise-cancelling over-ear headphones',
    quantity: 28,
    price: 199.99,
    deliveryType: 'Air',
  },
  {
    id: '12',
    name: 'Desk Organizer',
    description: 'Bamboo desk organizer with multiple compartments',
    quantity: 73,
    price: 24.99,
    deliveryType: 'Land',
  },
  {
    id: '13',
    name: 'External SSD',
    description: '1TB portable external SSD drive',
    quantity: 45,
    price: 129.99,
    deliveryType: 'Air',
  },
  {
    id: '14',
    name: 'Bookshelf',
    description: '5-tier wooden bookshelf',
    quantity: 18,
    price: 159.99,
    deliveryType: 'Land',
  },
  {
    id: '15',
    name: 'Cable Management Kit',
    description: 'Complete cable organization solution',
    quantity: 91,
    price: 19.99,
    deliveryType: 'Air',
  },
  {
    id: '16',
    name: 'Desk Pad',
    description: 'Large extended mouse pad desk mat',
    quantity: 67,
    price: 14.99,
    deliveryType: 'Land',
  },
  {
    id: '17',
    name: 'USB Flash Drive',
    description: '128GB USB 3.0 flash drive',
    quantity: 100,
    price: 22.99,
    deliveryType: 'Air',
  },
  {
    id: '18',
    name: 'Whiteboard',
    description: 'Magnetic dry-erase whiteboard',
    quantity: 9,
    price: 89.99,
    deliveryType: 'Land',
  },
];

export class InventoryRepository {
  private items: InventoryItem[] = [...mockInventoryItems];

  async getAll(): Promise<InventoryItem[]> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 100));
    return [...this.items];
  }

  async create(item: Omit<InventoryItem, 'id'>): Promise<InventoryItem> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const newItem: InventoryItem = {
      ...item,
      id: Date.now().toString(),
    };
    this.items.push(newItem);
    return newItem;
  }

  async delete(id: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    this.items = this.items.filter((item) => item.id !== id);
  }

  async deleteMultiple(ids: string[]): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    this.items = this.items.filter((item) => !ids.includes(item.id));
  }
}
