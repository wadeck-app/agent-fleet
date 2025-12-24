/**
 * ===========================================================================================
 * QUERY BUILDER INTERFACE
 * ===========================================================================================
 *
 * Fluent API for building database queries.
 * Can be translated to:
 * - In-memory filtering (for tests)
 * - SQL queries (for MariaDB)
 *
 * ===========================================================================================
 */
import type { BaseEntity } from '@app/shared/common/base-entity';

export type QueryOperator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'contains';
export type SortOrder = 'ASC' | 'DESC';

export interface QueryBuilder<T extends BaseEntity> {
	/**
	 * Add a WHERE condition
	 * @param field Entity field name
	 * @param operator Comparison operator
	 * @param value Value to compare
	 */
	where<K extends keyof T>(field: K, operator: QueryOperator, value: T[K] | T[K][]): this;

	/**
	 * Add an AND WHERE condition
	 * @param field Entity field name
	 * @param operator Comparison operator
	 * @param value Value to compare
	 */
	andWhere<K extends keyof T>(field: K, operator: QueryOperator, value: T[K] | T[K][]): this;

	/**
	 * Add an OR WHERE condition
	 * @param field Entity field name
	 * @param operator Comparison operator
	 * @param value Value to compare
	 */
	orWhere<K extends keyof T>(field: K, operator: QueryOperator, value: T[K] | T[K][]): this;

	/**
	 * Add ORDER BY clause
	 * @param field Entity field name
	 * @param order Sort order (ASC or DESC)
	 */
	orderBy<K extends keyof T>(field: K, order: SortOrder): this;

	/**
	 * Add secondary sort (THEN BY)
	 * Used for multi-column sorting after orderBy
	 * @param field Entity field name
	 * @param order Sort order (ASC or DESC)
	 */
	thenBy<K extends keyof T>(field: K, order: SortOrder): this;

	/**
	 * Limit the number of results
	 * @param n Maximum number of results
	 */
	limit(n: number): this;

	/**
	 * Skip N results (for pagination)
	 * @param n Number of results to skip
	 */
	offset(n: number): this;

	/**
	 * Execute the query and return results
	 */
	execute(): Promise<T[]>;
}
