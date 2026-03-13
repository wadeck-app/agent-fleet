import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowProposal } from '@app/shared/api/flow-proposals.contract';

import type { BaseRepository } from './BaseRepository';
import { FlowProposalsRepository } from './FlowProposalsRepository';

/**
 * ===========================================================================================
 * FLOW PROPOSALS REPOSITORY TESTS
 * ===========================================================================================
 *
 * Test Strategy:
 * - Mock BaseRepository (unit test - no real storage)
 * - Test domain-specific query methods
 * - Test version collision fix (InMemoryStorage always sets version=1)
 *
 * ===========================================================================================
 */

function makeProposal(overrides?: Partial<FlowProposal>): FlowProposal {
	return {
		id: 'prop-1',
		ticketId: 'ticket-1',
		version: 1,
		status: 'pending_review',
		proposedFlow: { id: 'my-flow', version: '1.0.0', name: 'My Flow', steps: [] },
		reasoning: 'Design reasoning',
		reviewThreads: [],
		proposedAt: '2026-01-01T00:00:00Z',
		...overrides,
	};
}

describe('FlowProposalsRepository', () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mockBase: BaseRepository<any>;
	let repository: FlowProposalsRepository;

	beforeEach(() => {
		mockBase = {
			create: vi.fn(),
			findById: vi.fn(),
			findBy: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
			query: vi.fn(),
			findAll: vi.fn(),
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as unknown as BaseRepository<any>;

		repository = new FlowProposalsRepository(mockBase);
	});

	// -------------------------------------------------------------------------
	// create
	// -------------------------------------------------------------------------

	describe('create', () => {
		it('persists a proposal with version=1 and returns it unchanged', async () => {
			const proposal = makeProposal({ version: 1 });
			// InMemoryStorage returns the entity with version=1 — matches proposal.version, no fix needed
			vi.mocked(mockBase.create).mockResolvedValue(proposal);

			const result = await repository.create(proposal);

			expect(result).toEqual(proposal);
			expect(result.version).toBe(1);
			// update must NOT be called for version=1
			expect(mockBase.update).not.toHaveBeenCalled();
		});

		it('restores version=2 after creation — regression test for InMemoryStorage version collision', async () => {
			const proposal = makeProposal({ id: 'prop-2', version: 2 });
			// Simulate InMemoryStorage always setting version=1 for new entities
			const storedWithWrongVersion = { ...proposal, version: 1 };
			const fixedEntity = { ...proposal, version: 2 };

			vi.mocked(mockBase.create).mockResolvedValue(storedWithWrongVersion);
			vi.mocked(mockBase.update).mockResolvedValue(fixedEntity);

			const result = await repository.create(proposal);

			expect(result.version).toBe(2);
			expect(mockBase.update).toHaveBeenCalledWith('prop-2', { version: 2 });
		});
	});

	// -------------------------------------------------------------------------
	// findById
	// -------------------------------------------------------------------------

	describe('findById', () => {
		it('returns the proposal when found', async () => {
			const proposal = makeProposal();
			vi.mocked(mockBase.findById).mockResolvedValue(proposal);

			const result = await repository.findById('prop-1');

			expect(result).toEqual(proposal);
			expect(mockBase.findById).toHaveBeenCalledWith('prop-1');
		});

		it('returns null when proposal is not found', async () => {
			vi.mocked(mockBase.findById).mockResolvedValue(null);

			const result = await repository.findById('nonexistent');

			expect(result).toBeNull();
		});
	});

	// -------------------------------------------------------------------------
	// findByTicketId
	// -------------------------------------------------------------------------

	describe('findByTicketId', () => {
		it('returns all proposals for the given ticketId', async () => {
			const p1 = makeProposal({ id: 'prop-1', ticketId: 'ticket-1' });
			const p2 = makeProposal({ id: 'prop-2', ticketId: 'ticket-1', version: 2 });
			vi.mocked(mockBase.findBy).mockResolvedValue([p1, p2]);

			const result = await repository.findByTicketId('ticket-1');

			expect(result).toEqual([p1, p2]);
			expect(mockBase.findBy).toHaveBeenCalledWith('ticketId', 'ticket-1');
		});

		it('returns an empty array when no proposals exist for the ticket', async () => {
			vi.mocked(mockBase.findBy).mockResolvedValue([]);

			const result = await repository.findByTicketId('unknown-ticket');

			expect(result).toEqual([]);
		});
	});

	// -------------------------------------------------------------------------
	// update
	// -------------------------------------------------------------------------

	describe('update', () => {
		it('delegates to base.update and returns the updated proposal', async () => {
			const updated = makeProposal({ status: 'approved', approvedAt: '2026-02-01T00:00:00Z' });
			vi.mocked(mockBase.update).mockResolvedValue(updated);

			const result = await repository.update('prop-1', { status: 'approved' });

			expect(result).toEqual(updated);
			expect(mockBase.update).toHaveBeenCalledWith('prop-1', { status: 'approved' });
		});
	});

	// -------------------------------------------------------------------------
	// findCurrentForTicket
	// -------------------------------------------------------------------------

	describe('findCurrentForTicket', () => {
		it('returns the single non-superseded proposal for a ticket', async () => {
			const proposal = makeProposal({ status: 'pending_review' });
			vi.mocked(mockBase.findBy).mockResolvedValue([proposal]);

			const result = await repository.findCurrentForTicket('ticket-1');

			expect(result).toEqual(proposal);
		});

		it('returns the highest-version non-superseded proposal when multiple exist', async () => {
			const v1 = makeProposal({ id: 'prop-1', version: 1, status: 'rejected' });
			const v2 = makeProposal({ id: 'prop-2', version: 2, status: 'pending_review' });
			const v3 = makeProposal({ id: 'prop-3', version: 3, status: 'pending_review' });
			// Intentionally provide out-of-insertion order to verify sort logic
			vi.mocked(mockBase.findBy).mockResolvedValue([v3, v1, v2]);

			const result = await repository.findCurrentForTicket('ticket-1');

			expect(result).toEqual(v3);
			expect(result?.version).toBe(3);
		});

		it('ignores proposals with status=superseded', async () => {
			const superseded = makeProposal({ id: 'prop-1', version: 1, status: 'superseded' });
			const active = makeProposal({ id: 'prop-2', version: 2, status: 'pending_review' });
			vi.mocked(mockBase.findBy).mockResolvedValue([superseded, active]);

			const result = await repository.findCurrentForTicket('ticket-1');

			expect(result).toEqual(active);
			expect(result?.id).toBe('prop-2');
		});

		it('returns null when all proposals are superseded', async () => {
			const s1 = makeProposal({ id: 'prop-1', version: 1, status: 'superseded' });
			const s2 = makeProposal({ id: 'prop-2', version: 2, status: 'superseded' });
			vi.mocked(mockBase.findBy).mockResolvedValue([s1, s2]);

			const result = await repository.findCurrentForTicket('ticket-1');

			expect(result).toBeNull();
		});

		it('returns null when no proposals exist for the ticket', async () => {
			vi.mocked(mockBase.findBy).mockResolvedValue([]);

			const result = await repository.findCurrentForTicket('ticket-1');

			expect(result).toBeNull();
		});
	});
});
