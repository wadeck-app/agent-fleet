/**
 * Service Container - Dependency injection for services
 * Following FRONTEND_WOW.md: Clean and simple DI pattern, maintains singletons but testable
 */

import { InventoryRepository } from '@/repositories/InventoryRepository';
import { InventoryService } from '@/services/InventoryService';

/**
 * Service container interface for all application services
 */
export interface ServiceContainer {
  inventoryService: InventoryService;
}

/**
 * Create service container with all dependencies
 */
function createServiceContainer(): ServiceContainer {
  // Create repository
  const inventoryRepository = new InventoryRepository();

  // Create service with injected dependencies
  const inventoryService = new InventoryService(inventoryRepository);

  return {
    inventoryService,
  };
}

// Singleton instance
let containerInstance: ServiceContainer | null = null;

/**
 * Get the service container singleton
 */
export function getServiceContainer(): ServiceContainer {
  if (!containerInstance) {
    containerInstance = createServiceContainer();
  }
  return containerInstance;
}

/**
 * Reset the service container (useful for testing)
 */
export function resetServiceContainer(): void {
  containerInstance = null;
}
