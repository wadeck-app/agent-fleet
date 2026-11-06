import type { RunMounts } from './RunMounts';
import { RunSandboxName } from './RunSandboxName';
import type { SandboxCapacity } from './SandboxCapacity';
import { SandboxError } from './SandboxError';
import type { SandboxLog } from './SandboxLog';
import { MAX_IDLE_STOP_MINUTES } from './SandboxOptionsParser';
import type { SandboxRuntime } from './SandboxRuntime';
import type { CancelScheduled, Scheduler } from './Scheduler';
import type { PresencePublisher } from './WrapperPresence';

export interface SandboxLifecycleOptions {
	/** Identifies this worker in sandbox names (see RunSandboxName). */
	wrapperId: string;
	/** sbx agent kind of the sandboxes (required, no hidden default). */
	agent: string;
	cpus: number;
	memory: string;
	image?: string;
	pull?: 'always' | 'missing' | 'never';
	/** Minutes without a step before the sandbox is STOPPED (never removed). */
	idleStopMinutes: number;
}

export interface SandboxLifecycleDependencies {
	runtime: SandboxRuntime;
	scheduler: Scheduler;
	log: SandboxLog;
	capacity: SandboxCapacity;
	presence: PresencePublisher;
}

/** Why a run ended. All reasons but `daemon_stopping` remove the sandbox; `daemon_stopping` stops and keeps it. */
export type RunEndReason = 'completed' | 'failed' | 'cancelled' | 'daemon_stopping';

export interface StepRequest {
	executionId: string;
	mounts: RunMounts;
	/** Step time limit; omitted = none (the caller owns cancellation through the run events). */
	timeoutMs?: number;
}

export interface StepContext {
	/** Sandbox to `exec` in. */
	sandbox: string;
	/** Aborted when the step times out; aborting does NOT stop the process inside the VM (the sandbox is stopped). */
	signal: AbortSignal;
}

export type HeldSandboxStatus = 'running' | 'stopped';

export interface HeldSandbox {
	executionId: string;
	name: string;
	status: HeldSandboxStatus;
	stepActive: boolean;
}

export interface Held extends HeldSandbox {
	generation: number;
	cancelIdle: CancelScheduled | undefined;
}

/** Refuses options a lifecycle cannot work with (wrapper id, idle delay), naming the limit. */
export function validateLifecycleOptions(options: SandboxLifecycleOptions): void {
	if (!RunSandboxName.isWrapperId(options.wrapperId)) {
		throw new SandboxError(
			'invalid-argument',
			`Wrapper id ${JSON.stringify(options.wrapperId)} is not valid: use 1 to 12 lowercase letters or digits.`
		);
	}
	if (
		!Number.isFinite(options.idleStopMinutes) ||
		options.idleStopMinutes <= 0 ||
		options.idleStopMinutes > MAX_IDLE_STOP_MINUTES
	) {
		throw new SandboxError(
			'invalid-options',
			`idleStopMinutes must be greater than 0 and at most ${MAX_IDLE_STOP_MINUTES}, got ${options.idleStopMinutes}`
		);
	}
}
