/**
 * Single source of the built-in sub-step strategy names, shared by the scheduler (registration)
 * and the validators (static check of `subStepStrategy`).
 */
export const DEFAULT_SUB_STEP_STRATEGY = 'restart-on-first-failure';
export const WAIT_ALL_SUB_STEP_STRATEGY = 'wait-all';
export const WAVES_SUB_STEP_STRATEGY = 'waves';

export const SUB_STEP_STRATEGY_NAMES = [
	DEFAULT_SUB_STEP_STRATEGY,
	WAIT_ALL_SUB_STEP_STRATEGY,
	WAVES_SUB_STEP_STRATEGY,
] as const;
