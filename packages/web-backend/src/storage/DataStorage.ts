import type { BaseEntity } from '@app/shared';

import type { QueryBuilder } from './QueryBuilder';

/**
 * ===========================================================================================
 * DATA STORAGE INTERFACE
 * ===========================================================================================
 *
 * Abstraction layer for data persistence.
 * Implementations:
 * - InMemoryStorage (for tests)
 * - MariaDBStorage (for dev/prod - to be implemented)
 *
 * ===========================================================================================
 */

export interface DataStorage {
	/**
	 * Create a query builder for complex queries
	 * @param table Table/collection name
	 */
	query<T extends BaseEntity>(table: string): QueryBuilder<T>;

	/**
	 * Get entity by ID
	 * @param table Table/collection name
	 * @param id Entity ID
	 */
	getById<T extends BaseEntity>(table: string, id: string): Promise<T | null>;

	/**
	 * Create a new entity
	 * @param table Table/collection name
	 * @param data Entity data (without id, version, timestamps)
	 */
	create<T extends BaseEntity>(table: string, data: Omit<T, keyof BaseEntity>): Promise<T>;

	/**
	 * Update an existing entity
	 * @param table Table/collection name
	 * @param id Entity ID
	 * @param data Partial entity data
	 */
	update<T extends BaseEntity>(table: string, id: string, data: Partial<Omit<T, 'id'>>): Promise<T>;

	/**
	 * Delete an entity
	 * @param table Table/collection name
	 * @param id Entity ID
	 */
	delete(table: string, id: string): Promise<void>;
}
