import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import { writeDaemonLog } from './DaemonLog.js';
import type { LaunchTokenIssuer } from './LaunchTokenIssuer.js';
import type { RelayRegistry } from './RelayRegistry.js';
import { contactDeclaredSources } from './WorkerSourceContact.js';
import type { WorkerSourceRegistry } from './WorkerSourceRegistry.js';
import type { WorkerTypeInstances } from './WorkerTypeInstances.js';

/** Asks the declared worker sources for capacity, and forgets the ones whose process is gone. */
export class DaemonSourceContact {
	constructor(
		private readonly logsDir: string,
		private readonly sourceRegistry: WorkerSourceRegistry,
		private readonly relayRegistry: RelayRegistry,
		private readonly launchTokens: LaunchTokenIssuer,
		private readonly workerTypes: WorkerTypeInstances
	) {}

	/**
	 * Drops entries whose declaring worker is gone.
	 *
	 * Runs at startup and before each contact: a worker that declared itself and was then
	 * killed cannot clean up, and declared capacity that can never appear reads as
	 * "something exists" to whoever is looking.
	 */
	pruneDeadSources(): void {
		const pruned = this.sourceRegistry.pruneDead();
		if (pruned.length > 0) {
			writeDaemonLog(this.logsDir, 'info', `Pruned worker sources whose process is gone: ${pruned.join(', ')}`);
		}
	}

	// Asks each declared source to produce a worker. The daemon pushes; a worker
	// never polls. Fire-and-forget on purpose -- nothing waits for a worker to
	// appear (D#51, D#66), and dispatch only ever targets a live connection (D#4),
	// so a source that produces nothing simply has no capacity here.
	//
	// Called only when dispatch finds demand nothing can serve (D#66). A source told to
	// dial a port nothing is listening on would produce a worker that cannot join, which
	// is why the caller checks the bind first.
	contactSources(boundPort: number): void {
		this.pruneDeadSources();
		const declared = this.sourceRegistry.list();
		// `flow worker source remove` runs in another process and cannot reach the instances held here: the daemon
		// notices a source is gone from the registry file, here, and lets go of what it held for it.
		void this.workerTypes.retainOnly(declared.map(entry => entry.sourceId));
		void contactDeclaredSources(
			declared,
			`ws://127.0.0.1:${String(boundPort)}`,
			message => {
				process.stderr.write(`[daemon] ${message}\n`);
				writeDaemonLog(this.logsDir, 'error', message);
			},
			// A relay source is reached through its live connection, so the provider
			// needs to look one up. At startup none has dialled in yet, which reports
			// as "no relay connected" rather than pretending capacity exists.
			{
				findRelay: (sourceId: string) => this.relayRegistry.find(sourceId),
				// A worker this daemon launches cannot present the source's registration
				// token -- only its hash is stored (T-09) -- so it is given a credential
				// minted for that launch alone.
				issueLaunchToken: (sourceId: string) => this.launchTokens.issue(sourceId),
				workerTypes: this.workerTypes,
			}
		).catch((err: unknown) => {
			process.stderr.write(`[daemon] contacting worker sources failed: ${getErrorMessage(err)}\n`);
		});
	}
}
