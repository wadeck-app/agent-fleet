/**
 * Task status values shared across packages.
 * Moved here from shared-orch-worker to decouple flow-engine from the orchestrator layer.
 */
export enum TaskStatus {
	BACKLOG = 'backlog',
	REFINING = 'refining',
	REFINED = 'refined',
	PRIORITIZING = 'prioritizing',
	TODO = 'todo',
	IN_PROGRESS = 'in_progress',
	TESTING = 'testing',
	REVIEW = 'review',
	REVIEWING = 'reviewing',
	CHANGES_REQUESTED = 'changes_requested',
	APPROVED = 'approved',
	MERGED = 'merged',
	BLOCKED = 'blocked',
	CANCELLED = 'cancelled',
	AWAITING_USER = 'awaiting_user',
}
