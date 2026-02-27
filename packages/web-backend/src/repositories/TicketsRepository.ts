import type { Ticket, TicketsQuery } from '@app/shared/api/tickets.contract';

import type { BaseRepository } from './BaseRepository';

/**
 * ===========================================================================================
 * TICKETS REPOSITORY
 * ===========================================================================================
 *
 * Domain-specific data access for tickets.
 * Uses BaseRepository's query builder to compose domain queries.
 *
 * Storage:
 * - File-based JSON storage in /data/tickets.json
 * - Uses BaseRepository with 'tickets' table name
 *
 * Custom Methods:
 * - findAll(): Get all tickets with optional filters
 * - findByProject(): Get tickets for a project
 * - searchLabels(): Search labels within a project
 *
 * ===========================================================================================
 */

export class TicketsRepository {
	constructor(private readonly base: BaseRepository<Ticket>) {}

	/**
	 * Find all tickets with optional filters
	 */
	async findAll(query?: TicketsQuery): Promise<Ticket[]> {
		const qb = this.base.query();

		// Apply projectId filter
		if (query?.projectId) {
			qb.where('projectId', '=', query.projectId);
		}

		// Apply status filter
		if (query?.status) {
			qb.where('status', '=', query.status);
		}

		// Apply parentId filter
		if (query?.parentId) {
			qb.where('parentId', '=', query.parentId);
		}

		// Apply label filter (labels array contains value)
		if (query?.label) {
			const allTickets = await qb.execute();
			const filtered = allTickets.filter(ticket => ticket.labels.includes(query.label!));
			// Sort by order ASC
			return filtered.sort((a, b) => a.order - b.order);
		}

		// Default ordering by order ascending
		qb.orderBy('order', 'ASC');

		return qb.execute();
	}

	/**
	 * Find ticket by ID
	 */
	async findById(id: string): Promise<Ticket | null> {
		return this.base.findById(id);
	}

	/**
	 * Find tickets for a specific project
	 */
	async findByProject(projectId: string): Promise<Ticket[]> {
		return this.base.query().where('projectId', '=', projectId).orderBy('order', 'ASC').execute();
	}

	/**
	 * Create a new ticket
	 */
	async create(data: Omit<Ticket, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<Ticket> {
		return this.base.create(data);
	}

	/**
	 * Update an existing ticket
	 */
	async update(id: string, data: Partial<Omit<Ticket, 'id' | 'createdAt'>>): Promise<Ticket> {
		return this.base.update(id, data);
	}

	/**
	 * Delete a ticket
	 */
	async delete(id: string): Promise<void> {
		return this.base.delete(id);
	}

	/**
	 * Search labels within a project
	 * Collects all unique labels from tickets in the project
	 * Filters by query prefix if provided (case-insensitive)
	 */
	async searchLabels(projectId: string, query?: string): Promise<string[]> {
		// Get all tickets for project
		const tickets = await this.findByProject(projectId);

		// Collect all labels into a Set (for uniqueness)
		const labelsSet = new Set<string>();
		for (const ticket of tickets) {
			for (const label of ticket.labels) {
				labelsSet.add(label);
			}
		}

		// Convert to array
		let labels = Array.from(labelsSet);

		// Filter by query prefix if provided (case-insensitive)
		if (query) {
			const lowerQuery = query.toLowerCase();
			labels = labels.filter(label => label.toLowerCase().startsWith(lowerQuery));
		}

		// Return sorted
		return labels.sort();
	}
}
