import type { RunMounts } from '../RunMounts';
import type { SandboxStepType } from './HarnessMessages';

/** What the wrapper needs from a sandbox that was set up for a run. */
export interface PreparedSandbox {
	/** Environment merged into the `env` of each step of this type (the wrapper's values win). */
	envFor(stepType: SandboxStepType): Readonly<Record<string, string>>;
	/** Environment of the inner worker exec: `FLOW_BRIDGE_URL` and `FLOW_BRIDGE_TOKEN` (placeholder). */
	innerEnv: Readonly<Record<string, string>>;
	/** Undoes what `prepare` did on a sandbox that still exists; not needed when the sandbox is removed. */
	detach(): Promise<void>;
}

/** Sets a freshly created sandbox up for relay steps: credentials, network rules, tool stores, bridge token. */
export interface SandboxPreparer {
	prepare(sandbox: string, mounts: RunMounts, bridgePort: number): Promise<PreparedSandbox>;
}
