import { createLogger } from 'shared-common/logger';

import type { FlowRetrospective } from '@app/shared/api/flow-feedback.contract';

import type { TicketsRepository } from '../repositories/TicketsRepository';
import type { FlowFeedbackService } from './FlowFeedbackService';
import type { FlowsService } from './FlowsService';

const log = createLogger('FlowKnowledgeService');

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

export interface FlowSummary {
	id: string;
	name: string;
	description: string;
	/** True when flow metadata marks it as reusable (metadata.reusable === true) */
	isReusable: boolean;
}

export interface AggregatedFeedback {
	flowId: string;
	averageRating: number;
	totalCount: number;
	topWentWell: string[];
	topWentWrong: string[];
	topSuggestions: string[];
}

export interface SimilarTicketSummary {
	ticketId: string;
	title: string;
	flowId: string;
	status: string;
}

export interface FlowKnowledgeContext {
	availableFlows: FlowSummary[];
	reusableSubFlows: FlowSummary[];
	feedbackByFlow: Record<string, AggregatedFeedback>;
	recentRetrospectives: FlowRetrospective[];
	similarTickets: SimilarTicketSummary[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * ===========================================================================================
 * FLOW KNOWLEDGE SERVICE
 * ===========================================================================================
 *
 * Builds the knowledge context injected into FlowDesignerAgent prompts.
 * Aggregates available flows, past feedback, retrospectives, and similar tickets.
 *
 * ===========================================================================================
 */
export class FlowKnowledgeService {
	constructor(
		private readonly flowsService: FlowsService,
		private readonly feedbackService: FlowFeedbackService,
		private readonly ticketsRepository: TicketsRepository
	) {}

	/**
	 * Build the full knowledge context for the given project and ticket description.
	 * Used by FlowDesignerAgent to enrich the prompt with relevant information.
	 */
	async buildKnowledgeContext(projectId: string, ticketDescription: string): Promise<FlowKnowledgeContext> {
		const [flowsList, projectTickets] = await Promise.all([
			this.flowsService.getFlowsList().catch(err => {
				log.warn('Failed to load flows list for knowledge context', { err });
				return [];
			}),
			this.ticketsRepository.findByProject(projectId).catch(err => {
				log.warn('Failed to load project tickets for knowledge context', { err });
				return [];
			}),
		]);

		// Build flow summaries from FlowListItem
		// FlowListItem has id, name, description, version — no metadata.reusable field available here.
		// Mark all as non-reusable for now; a future enhancement can check flow definitions.
		const availableFlows: FlowSummary[] = flowsList.map(f => ({
			id: f.id,
			name: f.name,
			description: f.description ?? '',
			isReusable: false,
		}));

		// Reusable sub-flows: currently none (requires access to full FlowDefinition metadata)
		const reusableSubFlows: FlowSummary[] = [];

		// Feedback aggregation: N+1 is too expensive for a cold path; return empty map.
		// A future optimization can batch-fetch from the repository.
		const feedbackByFlow: Record<string, AggregatedFeedback> = {};

		// Recent retrospectives: fetch for tickets in the project
		// We only fetch retros for tickets that have a flowRetrospectiveId to minimize I/O.
		const recentRetrospectives: FlowRetrospective[] = [];
		const ticketsWithRetro = projectTickets.filter(t => t.flowRetrospectiveId);
		for (const ticket of ticketsWithRetro.slice(0, 5)) {
			try {
				const retro = await this.feedbackService.getRetrospective(ticket.id);
				recentRetrospectives.push(retro);
			} catch {
				// Ignore — retrospective may not exist despite flowRetrospectiveId being set
			}
		}

		// Similar tickets: tickets in the same project that have a flowId (i.e. previously executed flows)
		const similarTickets: SimilarTicketSummary[] = projectTickets
			.filter(t => t.flowId)
			.slice(0, 10)
			.map(t => ({
				ticketId: t.id,
				title: t.title,
				// flowId is guaranteed non-null by the filter above
				flowId: t.flowId!,
				status: t.status,
			}));

		log.info('Built knowledge context', {
			projectId,
			flowCount: availableFlows.length,
			similarTicketCount: similarTickets.length,
			recentRetroCount: recentRetrospectives.length,
		});

		return {
			availableFlows,
			reusableSubFlows,
			feedbackByFlow,
			recentRetrospectives,
			similarTickets,
		};
	}
}
