// A flow-engine FlowTrace travels as an opaque payload; this only reads the number of steps it reports.
export function countTraceSteps(trace: unknown): number {
	if (typeof trace === 'object' && trace !== null && 'steps' in trace && Array.isArray(trace.steps)) {
		return trace.steps.length;
	}
	return 0;
}
