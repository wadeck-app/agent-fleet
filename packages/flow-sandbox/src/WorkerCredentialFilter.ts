/**
 * The launch credential (`FLOW_WORKER_TOKEN`) and the other `FLOW_WORKER_*` variables a daemon gives a wrapper are for the
 * wrapper's own registration. Every program the wrapper starts (sbx, the aws CLI) gets its environment through this filter,
 * so the credential does not appear in their environment or in anything they print or record.
 */
export class WorkerCredentialFilter {
	static apply(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
		return Object.fromEntries(Object.entries(env).filter(([name]) => !/^FLOW_WORKER_/i.test(name)));
	}
}
