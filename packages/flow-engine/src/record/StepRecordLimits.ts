/**
 * Caps, in characters, on what an execution record keeps of what steps received and produced. Shared by the
 * daemon (flow-cli, which enforces them) and the generated flow documentation (which tells authors about them).
 */
export interface StepRecordLimits {
	/** One input, output, stdout or stderr. */
	perValue: number;
	/** The texts of one step attempt. */
	perStep: number;
	/** The texts of every step of an execution. */
	perExecution: number;
}

export const DEFAULT_STEP_RECORD_LIMITS: StepRecordLimits = {
	perValue: 4096,
	perStep: 32_768,
	perExecution: 1_048_576,
};
