/**
 * Intervention Handler Interface
 *
 * Defines the contract for handling user interventions during flow execution.
 * This interface allows the flow engine to request user interventions without
 * depending on the orchestrator implementation.
 */
import type { UserInterventionStep } from '../types';

/**
 * Intervention request parameters
 */
export interface InterventionRequest {
	/** Task ID requesting the intervention */
	taskId: string;

	/** Worker ID (if applicable) */
	workerId?: string;

	/** Flow ID */
	flowId?: string;

	/** Step ID */
	stepId: string;

	/** Type of intervention */
	type: 'approval' | 'question' | 'choice';

	/** Whether this intervention blocks flow execution */
	blocking: boolean;

	/** Intervention configuration from the step */
	config: UserInterventionStep['approval'] | UserInterventionStep['question'] | UserInterventionStep['choice'];

	/** Timeout configuration (if any) */
	timeout?: {
		minutes: number;
		onTimeout: 'fail' | 'continue' | 'default';
		defaultValue?: unknown;
	};
}

/**
 * Intervention response
 */
export interface InterventionResponse {
	/** User's response value */
	value: unknown;

	/** Optional comment from user */
	comment?: string;

	/** Timestamp when answered */
	answeredAt: string;

	/** User who answered */
	answeredBy: string;
}

/**
 * Intervention Handler interface
 *
 * Implemented by the orchestrator to handle user interventions.
 */
export interface InterventionHandler {
	/**
	 * Request a user intervention
	 *
	 * @param request - Intervention request parameters
	 * @returns Promise that resolves when user responds (for blocking) or immediately (for non-blocking)
	 */
	requestIntervention(request: InterventionRequest): Promise<InterventionResponse | null>;
}
