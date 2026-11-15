import type { JsonObject } from '../harness/HarnessMessages';

/**
 * The `run-hold` protocol of the flow daemon (flow-cli `Protocol.ts`: `WORKER_FEATURE_RUN_HOLD`, messages
 * `worker_hold_enabled` and `worker_hold`). This branch's copy of flow-cli predates it, so the value is declared here;
 * replace it with the import once flow-cli on this branch has it.
 */
export const WORKER_FEATURE_RUN_HOLD = 'run-hold';

export interface RunHoldAnnouncerOptions {
	/** The run the wrapper currently keeps a sandbox for (`SandboxLifecycle.current()?.executionId`): the single source of truth. */
	heldRun: () => string | undefined;
	/** Sends one message to the daemon. */
	send: (message: JsonObject) => void;
}

/**
 * Tells the daemon which run this worker keeps its sandbox for (`worker_hold { executionId }`, `null` when none), so the
 * daemon offers no step of another run to it meanwhile.
 *
 * It never owns the hold: it compares what it last told the daemon with `heldRun()` each time `sync()` is called, so a
 * failed `endRun` (the sandbox is still held) announces nothing, and a stopped-and-kept sandbox (`daemon_stopping`) stays held.
 * `sync()` must be called at the points where the hold may have changed: before the `ready` that follows a step (the
 * daemon dispatches on `ready`, so the hold has to arrive first) and after a successful removal (before the `run_end_ack`).
 *
 * - Nothing is sent until `enable()` (the daemon's `worker_hold_enabled`; an older daemon never sends it and would reject
 *   the unknown type). `enable()` forgets what was announced: it is called once per connection, and a new connection knows nothing.
 * - The lifecycle holds one run at a time. When `sync()` sees run Y after having announced run X, X was ended in between,
 *   so the release (`null`) is sent before the hold for Y: the daemon is never told Y while it believes X is held.
 */
export class RunHoldAnnouncer {
	private enabled = false;
	/** What the daemon was last told on this connection: undefined = nothing yet, null = released. */
	private announced: string | null | undefined;

	constructor(private readonly options: RunHoldAnnouncerOptions) {}

	/** The daemon answered `worker_hold_enabled` (once per connection): announces the run held right now, if any. */
	enable(): void {
		this.enabled = true;
		this.announced = undefined;
		this.sync();
	}

	/** The connection is gone: nothing is sent until the next `enable()`. */
	disable(): void {
		this.enabled = false;
		this.announced = undefined;
	}

	/** Sends the hold, or its release, if what the daemon knows differs from what the wrapper holds. */
	sync(): void {
		if (!this.enabled) return;
		const held = this.options.heldRun() ?? null;
		// Nothing announced yet counts as "released": a daemon starts a connection with no hold, so "nothing held" needs no message.
		if (held === (this.announced ?? null)) return;
		if (held !== null && this.announced !== undefined && this.announced !== null) {
			this.send(null);
		}
		this.send(held);
	}

	private send(executionId: string | null): void {
		this.options.send({ type: 'worker_hold', executionId });
		this.announced = executionId;
	}
}
