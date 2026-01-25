import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { createLogger } from 'shared-common/logger';

import type { BaseEntity } from '@app/shared/common/base-entity';

import type { DataStorage } from './DataStorage';
import { InMemoryQueryBuilder } from './InMemoryQueryBuilder';
import type { QueryBuilder } from './QueryBuilder';

const log = createLogger('FileBasedStorage');

/**
 * ===========================================================================================
 * FILE-BASED STORAGE IMPLEMENTATION
 * ===========================================================================================
 *
 * Persists data to JSON files in the data/ directory.
 * Each table is stored in its own JSON file (e.g., data/projects.json)
 *
 * Perfect for:
 * - Development (persistent data without database)
 * - Small to medium datasets
 * - Simple deployment (no database setup required)
 *
 * File Format:
 * {
 *   "tableName": [
 *     { id, version, createdAt, updatedAt, ...fields }
 *   ]
 * }
 *
 * ===========================================================================================
 */

export class FileBasedStorage implements DataStorage {
	/**
	 * In-memory cache of tables (same as InMemoryStorage for performance)
	 * Files are read on first access and written on every mutation
	 */
	private tables = new Map<string, BaseEntity[]>();

	/**
	 * Track which tables have been loaded from disk
	 */
	private loadedTables = new Set<string>();

	/**
	 * Base directory for data files
	 */
	private dataDir: string;

	/**
	 * @param dataDir - Directory where JSON files are stored (default: ./data)
	 */
	constructor(dataDir: string = './data') {
		this.dataDir = dataDir;
	}

	/**
	 * Get the file path for a table
	 */
	private getFilePath(table: string): string {
		return join(this.dataDir, `${table}.json`);
	}

	/**
	 * Load table from disk if not already loaded
	 */
	private async ensureTableLoaded<T extends BaseEntity>(table: string): Promise<T[]> {
		if (this.loadedTables.has(table)) {
			return this.tables.get(table) as T[];
		}

		const filePath = this.getFilePath(table);

		try {
			const content = await readFile(filePath, 'utf-8');
			const data = JSON.parse(content);

			// File format: { "tableName": [...items] }
			const items = data[table] || [];
			this.tables.set(table, items);
			this.loadedTables.add(table);

			log.info(`Loaded ${items.length} items from ${filePath}`);
			return items as T[];
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				// File doesn't exist - create empty table
				log.info(`File not found, creating empty table: ${table}`);
				this.tables.set(table, []);
				this.loadedTables.add(table);
				return [];
			}

			// Other errors (parse errors, permission errors, etc.)
			log.error(`Error loading ${filePath}:`, error);
			throw new Error(`Failed to load table ${table}: ${(error as Error).message}`);
		}
	}

	/**
	 * Save table to disk
	 */
	private async saveTable(table: string): Promise<void> {
		const filePath = this.getFilePath(table);
		const items = this.tables.get(table) || [];

		console.log('====== saveTable START ======');
		console.log('table:', table);
		console.log('filePath:', filePath);
		console.log('items count:', items.length);
		log.info(`[DEBUG] saveTable: Writing ${items.length} items to ${filePath}`);

		try {
			// Ensure directory exists
			await mkdir(dirname(filePath), { recursive: true });

			// Write data in format: { "tableName": [...items] }
			const data = { [table]: items };
			const jsonContent = JSON.stringify(data, null, '\t');

			console.log('JSON content length:', jsonContent.length, 'bytes');
			log.info(`[DEBUG] saveTable: JSON content length: ${jsonContent.length} bytes`);

			await writeFile(filePath, jsonContent, 'utf-8');

			console.log('====== saveTable SUCCESS ======');
			console.log(`Saved ${items.length} items to ${filePath}`);
			log.info(`[DEBUG] saveTable: Successfully saved ${items.length} items to ${filePath}`);
		} catch (error) {
			console.log('====== saveTable ERROR ======');
			console.log('Error:', error);
			log.error(`[DEBUG] saveTable: ERROR saving ${filePath}:`, error);
			throw new Error(`Failed to save table ${table}: ${(error as Error).message}`);
		}
	}

	/**
	 * Get or create a table (loads from disk if needed)
	 */
	private async getTable<T extends BaseEntity>(table: string): Promise<T[]> {
		await this.ensureTableLoaded<T>(table);
		return this.tables.get(table) as T[];
	}

	query<T extends BaseEntity>(table: string): QueryBuilder<T> {
		// Query builder needs sync access to data
		// We load the table first if needed
		if (!this.loadedTables.has(table)) {
			// Schedule async load but return empty data for now
			this.ensureTableLoaded<T>(table).catch(err => {
				log.error(`Failed to load table ${table} for query:`, err);
			});
			this.tables.set(table, []);
			this.loadedTables.add(table);
		}

		const data = this.tables.get(table) as T[];
		return new InMemoryQueryBuilder<T>(data);
	}

	async getById<T extends BaseEntity>(table: string, id: string): Promise<T | null> {
		const data = await this.getTable<T>(table);
		return data.find(item => item.id === id) ?? null;
	}

	async create<T extends BaseEntity>(table: string, data: Omit<T, keyof BaseEntity>): Promise<T> {
		const tableData = await this.getTable<T>(table);

		const newEntity: T = {
			...data,
			id: this.generateId(),
			version: 1,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		} as T;

		tableData.push(newEntity);
		await this.saveTable(table);

		return newEntity;
	}

	async update<T extends BaseEntity>(table: string, id: string, data: Partial<Omit<T, 'id'>>): Promise<T> {
		console.log('====== FileBasedStorage.update START ======');
		console.log('table:', table);
		console.log('id:', id);
		console.log('data:', JSON.stringify(data, null, 2));
		log.info(`[DEBUG] FileBasedStorage.update called for table=${table}, id=${id}`);
		log.info(`[DEBUG] Update data:`, JSON.stringify(data, null, 2));

		const tableData = await this.getTable<T>(table);
		console.log(`Table ${table} has ${tableData.length} items`);
		log.info(`[DEBUG] Table ${table} has ${tableData.length} items`);

		const index = tableData.findIndex(item => item.id === id);

		if (index === -1) {
			console.log(`ERROR: Entity with id ${id} NOT FOUND in table ${table}`);
			log.error(`[DEBUG] Entity with id ${id} NOT FOUND in table ${table}`);
			throw new Error(`Entity with id ${id} not found in table ${table}`);
		}

		console.log(`Found entity at index ${index}`);
		console.log('Current entity:', JSON.stringify(tableData[index], null, 2));
		log.info(`[DEBUG] Found entity at index ${index}`);
		log.info(`[DEBUG] Current entity:`, JSON.stringify(tableData[index], null, 2));

		const updatedEntity: T = {
			...tableData[index],
			...data,
			id, // Preserve ID
			updatedAt: new Date().toISOString(),
		} as T;

		console.log('Updated entity:', JSON.stringify(updatedEntity, null, 2));
		log.info(`[DEBUG] Updated entity:`, JSON.stringify(updatedEntity, null, 2));

		tableData[index] = updatedEntity;
		console.log(`Calling saveTable for ${table}...`);
		log.info(`[DEBUG] Calling saveTable for ${table}...`);
		await this.saveTable(table);
		console.log(`====== FileBasedStorage.update COMPLETED for ${table} ======`);
		log.info(`[DEBUG] saveTable COMPLETED for ${table}`);

		return updatedEntity;
	}

	async delete(table: string, id: string): Promise<void> {
		const tableData = await this.getTable(table);
		const index = tableData.findIndex(item => item.id === id);

		if (index === -1) {
			throw new Error(`Entity with id ${id} not found in table ${table}`);
		}

		tableData.splice(index, 1);
		await this.saveTable(table);
	}

	/**
	 * Generate a random ID
	 */
	private generateId(): string {
		return Math.random().toString(36).substring(2, 11);
	}

	/**
	 * Seed data for a table (useful for tests/initialization)
	 */
	async seed<T extends BaseEntity>(table: string, data: T[]): Promise<void> {
		this.tables.set(table, [...data]);
		this.loadedTables.add(table);
		await this.saveTable(table);
	}

	/**
	 * Clear all data (useful for tests)
	 */
	async clear(): Promise<void> {
		this.tables.clear();
		this.loadedTables.clear();
	}

	/**
	 * Clear a specific table (useful for tests)
	 */
	async clearTable(table: string): Promise<void> {
		this.tables.delete(table);
		this.loadedTables.delete(table);
	}

	/**
	 * Reload a table from disk (useful for debugging)
	 */
	async reloadTable(table: string): Promise<void> {
		this.tables.delete(table);
		this.loadedTables.delete(table);
		await this.ensureTableLoaded(table);
	}
}
