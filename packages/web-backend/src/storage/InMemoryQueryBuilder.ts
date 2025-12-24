import type { BaseEntity } from '@app/shared/common/base-entity';

import type { QueryBuilder, QueryOperator, SortOrder } from './QueryBuilder';

/**
 * ===========================================================================================
 * IN-MEMORY QUERY BUILDER
 * ===========================================================================================
 *
 * Query builder implementation for in-memory data (arrays).
 * Used for tests (zero network cost, fast execution).
 *
 * ===========================================================================================
 */

type FilterFunction<T> = (item: T) => boolean;

interface WhereClause<T> {
	type: 'and' | 'or';
	filter: FilterFunction<T>;
}

interface SortClause<T> {
	field: keyof T;
	order: SortOrder;
}

export class InMemoryQueryBuilder<T extends BaseEntity> implements QueryBuilder<T> {
	private whereClauses: WhereClause<T>[] = [];
	private sortClauses: SortClause<T>[] = [];
	private limitValue?: number;
	private offsetValue: number = 0;

	constructor(private data: T[]) {}

	where<K extends keyof T>(field: K, operator: QueryOperator, value: T[K] | T[K][]): this {
		this.whereClauses.push({
			type: 'and',
			filter: this.createFilter(field, operator, value),
		});
		return this;
	}

	andWhere<K extends keyof T>(field: K, operator: QueryOperator, value: T[K] | T[K][]): this {
		this.whereClauses.push({
			type: 'and',
			filter: this.createFilter(field, operator, value),
		});
		return this;
	}

	orWhere<K extends keyof T>(field: K, operator: QueryOperator, value: T[K] | T[K][]): this {
		this.whereClauses.push({
			type: 'or',
			filter: this.createFilter(field, operator, value),
		});
		return this;
	}

	orderBy<K extends keyof T>(field: K, order: SortOrder): this {
		this.sortClauses.push({ field, order });
		return this;
	}

	thenBy<K extends keyof T>(field: K, order: SortOrder): this {
		this.sortClauses.push({ field, order });
		return this;
	}

	limit(n: number): this {
		this.limitValue = n;
		return this;
	}

	offset(n: number): this {
		this.offsetValue = n;
		return this;
	}

	async execute(): Promise<T[]> {
		let results = [...this.data];

		// Apply filters
		if (this.whereClauses.length > 0) {
			results = results.filter(item => this.evaluateWhereClauses(item));
		}

		// Apply multi-column sorting
		if (this.sortClauses.length > 0) {
			results.sort((a, b) => {
				// Compare by each sort clause in order until we find a difference
				for (const sortClause of this.sortClauses) {
					const aVal = a[sortClause.field];
					const bVal = b[sortClause.field];

					let comparison = 0;
					if (aVal < bVal) comparison = -1;
					if (aVal > bVal) comparison = 1;

					// If values are different, return the comparison
					if (comparison !== 0) {
						return sortClause.order === 'ASC' ? comparison : -comparison;
					}
					// If values are equal, continue to next sort clause
				}
				// All sort clauses resulted in equality
				return 0;
			});
		}

		// Apply offset and limit
		const start = this.offsetValue;
		const end = this.limitValue ? start + this.limitValue : undefined;
		results = results.slice(start, end);

		return results;
	}

	/**
	 * Create a filter function based on operator
	 */
	private createFilter<K extends keyof T>(
		field: K,
		operator: QueryOperator,
		value: T[K] | T[K][]
	): FilterFunction<T> {
		return (item: T) => {
			const fieldValue = item[field];

			switch (operator) {
				case '=':
					return fieldValue === value;
				case '!=':
					return fieldValue !== value;
				case '>':
					return fieldValue > value;
				case '>=':
					return fieldValue >= value;
				case '<':
					return fieldValue < value;
				case '<=':
					return fieldValue <= value;
				case 'in':
					return Array.isArray(value) && value.includes(fieldValue as any);
				case 'contains':
					return (
						typeof fieldValue === 'string' &&
						typeof value === 'string' &&
						fieldValue.toLowerCase().includes(value.toLowerCase())
					);
				default:
					return false;
			}
		};
	}

	/**
	 * Evaluate all WHERE clauses with AND/OR logic
	 * Currently simplified: all clauses are AND'd together
	 * (OR logic would require more complex grouping)
	 */
	private evaluateWhereClauses(item: T): boolean {
		if (this.whereClauses.length === 0) return true;

		// Simplified: treat all as AND for now
		// To support OR properly, we'd need to group clauses
		return this.whereClauses.every(clause => clause.filter(item));
	}
}
