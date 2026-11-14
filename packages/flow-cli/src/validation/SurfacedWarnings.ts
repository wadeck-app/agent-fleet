import type { ValidationIssue } from 'flow-engine';
import { ValidationCode } from 'flow-engine';

/** The engine warnings the CLI shows (`flow validate`, and `flow run` for an accepted run); the other ones stay out of its output. */
const SURFACED_WARNING_CODES: ReadonlySet<ValidationCode> = new Set([
	ValidationCode.SUB_STEP_SIBLING_DEPENDENCY,
	ValidationCode.SUB_STEP_WAVES_SINGLE_WAVE,
	ValidationCode.WAVE_REDUNDANT_DEPENDS,
	ValidationCode.SCRIPT_BODY_INTERPOLATION,
	ValidationCode.WORKSPACE_DEPRECATED,
	ValidationCode.WORKSPACE_WORKINGDIR_ABSOLUTE,
	ValidationCode.HOST_SCRIPT_WITH_MODEL_STEPS,
	ValidationCode.HOST_TOOL_UNDER_CONFINED_PROFILE,
	ValidationCode.HOST_TOOL_UNUSED_ARG,
	ValidationCode.HOST_TOOL_LOG_SENSITIVE,
	ValidationCode.HOST_TOOL_CWD_WORKSPACE_CONFIG_DRIVEN,
]);

/** One printable line per surfaced warning: the message, then the fix when there is one. */
export function surfacedWarningsOf(issues: readonly ValidationIssue[]): string[] {
	return issues
		.filter(issue => issue.severity === 'warning' && SURFACED_WARNING_CODES.has(issue.code))
		.map(issue => (issue.suggestion ? `${issue.message}. Fix: ${issue.suggestion}` : issue.message));
}
