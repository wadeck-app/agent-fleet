import type { BaseEntity } from '@app/shared/common/base-entity';

import type { DataStorage } from '../storage/DataStorage';
import type { QueryBuilder } from '../storage/QueryBuilder';

/**
 * ===========================================================================================
 * BASE REPOSITORY
 * ===========================================================================================
 *
 * Generic repository providing common data access operations.
 * Entity-specific repositories receive an instance of this class
 * and expose domain-specific methods using the query builder.
 *
 * Flow:
 * - BaseRepository wraps a DataStorage and table name
 * - Entity repositories (IngredientsRepository) receive a BaseRepository
 * - Entity repositories expose domain methods using query()
 *
 * ===========================================================================================
 */

export class BaseRepository<T extends BaseEntity> {
	constructor(
		private readonly tableName: string,
		private readonly storage: DataStorage
	) {}

	/**
	 * Get the table name (useful for debugging)
	 */
	getTableName(): string {
		return this.tableName;
	}

	/**
	 * Create a query builder for complex queries
	 * This is the main entry point for entity repositories
	 */
	query(): QueryBuilder<T> {
		return this.storage.query<T>(this.tableName);
	}

	/**
	 * Get all entities (no filtering)
	 */
	async findAll(): Promise<T[]> {
		return this.query().execute();
	}

	/**
	 * Get an entity by ID
	 * @param id Entity ID
	 */
	async findById(id: string): Promise<T | null> {
		return this.storage.getById<T>(this.tableName, id);
	}

	/**
	 * Find entities by a single field value (convenience method)
	 * @param field Field name
	 * @param value Field value
	 */
	async findBy<K extends keyof T>(field: K, value: T[K]): Promise<T[]> {
		return this.query().where(field, '=', value).execute();
	}

	/**
	 * Create a new entity
	 * @param data Entity data (without id, version, timestamps)
	 */
	async create(data: Omit<T, keyof BaseEntity>): Promise<T> {
		return this.storage.create<T>(this.tableName, data);
	}

	/**
	 * Update an existing entity
	 * @param id Entity ID
	 * @param data Partial entity data
	 */
	async update(id: string, data: Partial<Omit<T, 'id'>>): Promise<T> {
		return this.storage.update<T>(this.tableName, id, data);
	}

	/**
	 * Delete an entity
	 * @param id Entity ID
	 */
	async delete(id: string): Promise<void> {
		return this.storage.delete(this.tableName, id);
	}
}
