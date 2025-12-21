import type { BaseEntity } from '@app/shared';

import type { DataStorage } from './DataStorage';
import { InMemoryQueryBuilder } from './InMemoryQueryBuilder';
import type { QueryBuilder } from './QueryBuilder';

/**
 * ===========================================================================================
 * IN-MEMORY STORAGE IMPLEMENTATION
 * ===========================================================================================
 *
 * Simple in-memory storage using JavaScript arrays/objects.
 * Perfect for:
 * - Unit tests (zero network cost)
 * - Integration tests (fast setup/teardown)
 * - Development (no database required)
 *
 * ===========================================================================================
 */

export class InMemoryStorage implements DataStorage {
	/**
	 * In-memory tables (Map<tableName, array of entities>)
	 */
	private tables = new Map<string, BaseEntity[]>();

	/**
	 * Get or create a table
	 */
	private getTable<T extends BaseEntity>(table: string): T[] {
		if (!this.tables.has(table)) {
			this.tables.set(table, []);
		}
		return this.tables.get(table) as T[];
	}

	query<T extends BaseEntity>(table: string): QueryBuilder<T> {
		const data = this.getTable<T>(table);
		return new InMemoryQueryBuilder<T>(data);
	}

	async getById<T extends BaseEntity>(table: string, id: string): Promise<T | null> {
		const data = this.getTable<T>(table);
		return data.find(item => item.id === id) ?? null;
	}

	async create<T extends BaseEntity>(table: string, data: Omit<T, keyof BaseEntity>): Promise<T> {
		const tableData = this.getTable<T>(table);

		const newEntity: T = {
			...data,
			id: this.generateId(),
			version: 1,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		} as T;

		tableData.push(newEntity);
		return newEntity;
	}

	async update<T extends BaseEntity>(table: string, id: string, data: Partial<Omit<T, 'id'>>): Promise<T> {
		const tableData = this.getTable<T>(table);
		const index = tableData.findIndex(item => item.id === id);

		if (index === -1) {
			throw new Error(`Entity with id ${id} not found in table ${table}`);
		}

		const updatedEntity: T = {
			...tableData[index],
			...data,
			id, // Preserve ID
			updatedAt: new Date().toISOString(),
		} as T;

		tableData[index] = updatedEntity;
		return updatedEntity;
	}

	async delete(table: string, id: string): Promise<void> {
		const tableData = this.getTable(table);
		const index = tableData.findIndex(item => item.id === id);

		if (index === -1) {
			throw new Error(`Entity with id ${id} not found in table ${table}`);
		}

		tableData.splice(index, 1);
	}

	/**
	 * Generate a random ID (for testing purposes)
	 */
	private generateId(): string {
		return Math.random().toString(36).substring(2, 11);
	}

	/**
	 * Seed data for a table (useful for tests)
	 */
	async seed<T extends BaseEntity>(table: string, data: T[]): Promise<void> {
		this.tables.set(table, [...data]);
	}

	/**
	 * Clear all data (useful for tests)
	 */
	async clear(): Promise<void> {
		this.tables.clear();
	}

	/**
	 * Clear a specific table (useful for tests)
	 */
	async clearTable(table: string): Promise<void> {
		this.tables.delete(table);
	}
}
