import { createTypedFetch } from '@framework/api/api-base';
import { TICKETS_API_ROUTES } from '@shared/api/tickets.contract';
import type {
	AnalyzeTicket,
	CreateFromPlan,
	CreateFromPlanResponse,
	CreateTicket,
	LabelsQuery,
	LabelsResponse,
	ReorderTicket,
	Ticket,
	TicketAnalysisPlan,
	TicketsListResponse,
	TicketsQuery,
	UpdateTicket,
} from '@shared/api/tickets.contract';
import type { DeleteResponse } from '@shared/common/api-helpers';

/**
 * ===========================================================================================
 * TICKETS API CLIENT
 * ===========================================================================================
 *
 * Type-safe API client for tickets endpoints.
 * Generated from the TICKETS_API_ROUTES contract.
 *
 * ===========================================================================================
 */

const typedFetch = createTypedFetch(TICKETS_API_ROUTES);

export const ticketsApi = {
	/**
	 * Get tickets list with pagination and filtering
	 */
	getTicketsList: (query?: TicketsQuery): Promise<TicketsListResponse> => {
		return typedFetch('GET', '/api/tickets/', { query: query || {} });
	},

	/**
	 * Get a single ticket by ID
	 */
	getTicketById: (id: string): Promise<Ticket> => {
		return typedFetch('GET', '/api/tickets/:id', { params: { id } });
	},

	/**
	 * Create a new ticket
	 */
	createTicket: (body: CreateTicket): Promise<Ticket> => {
		return typedFetch('POST', '/api/tickets/', { body });
	},

	/**
	 * Update ticket
	 */
	updateTicket: (id: string, body: UpdateTicket): Promise<Ticket> => {
		return typedFetch('PATCH', '/api/tickets/:id', { params: { id }, body });
	},

	/**
	 * Delete ticket
	 */
	deleteTicket: (id: string): Promise<DeleteResponse> => {
		return typedFetch('DELETE', '/api/tickets/:id', { params: { id } });
	},

	/**
	 * Reorder ticket (update float order value)
	 */
	reorderTicket: (id: string, body: ReorderTicket): Promise<Ticket> => {
		return typedFetch('PATCH', '/api/tickets/:id/reorder', { params: { id }, body });
	},

	/**
	 * Get label autocomplete suggestions
	 */
	getLabels: (query: LabelsQuery): Promise<LabelsResponse> => {
		return typedFetch('GET', '/api/tickets/labels', { query });
	},

	/**
	 * Analyze ticket description with AI
	 */
	analyzeTicket: (body: AnalyzeTicket): Promise<TicketAnalysisPlan> => {
		return typedFetch('POST', '/api/tickets/analyze', { body });
	},

	/**
	 * Create ticket from AI-generated plan
	 */
	createFromPlan: (body: CreateFromPlan): Promise<CreateFromPlanResponse> => {
		return typedFetch('POST', '/api/tickets/create-from-plan', { body });
	},
} as const;
