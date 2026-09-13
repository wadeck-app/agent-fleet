import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import { WorkerSourceRegistry } from '../daemon/WorkerSourceRegistry.js';

/** Lets the caller take its own entry back out again. */
export interface SelfDeclarationHandle {
	sourceId: string;
	release: () => void;
}

/**
 * Records a worker that is alive and waiting, so something other than itself knows it exists.
 *
 * This is D#5's first kind of registry entry -- "a worker already alive and waiting to be
 * contacted" -- which nothing wrote until now: a `flow worker` started in a terminal left no trace,
 * so a daemon starting later had no idea it existed, and `flow worker list` could not mention it
 * while the socket was down.
 *
 * It records intent and configuration, never availability: the entry declares capacity of one and
 * carries the pid, so a reader can tell a waiting worker from a leftover, and dispatch still only
 * ever targets a live connection (D#4).
 *
 * Failing to write is reported and survived. Registration is what makes a worker usable; this only
 * makes it visible, so losing visibility must not cost the user their worker.
 */
export function declareSelf(
	daemonDir: string,
	worker: { projects: string[]; labels: string[]; pid: number }
): SelfDeclarationHandle | undefined {
	const registry = new WorkerSourceRegistry(daemonDir);
	const sourceId = `terminal-${String(worker.pid)}`;

	try {
		registry.declare({
			sourceId,
			// Nothing can reach out to it: it dials in on its own schedule, which is what inbound
			// means (D#18). The watch on the daemon's port file is how it learns when to.
			provider: 'built-in:inbound',
			labels: [...worker.labels],
			maxWorkers: 1,
			options: { projects: [...worker.projects] },
			pid: worker.pid,
		});
	} catch (err) {
		console.error(
			`[warn] this worker could not record itself in the registry, so it will not be listed while disconnected: ${getErrorMessage(err)}`
		);
		return undefined;
	}

	let released = false;
	return {
		sourceId,
		release: () => {
			if (released) return;
			released = true;
			try {
				registry.remove(sourceId);
			} catch (err) {
				// The pid is in the entry, so a later reader prunes it; saying so is enough.
				console.error(`[warn] could not remove this worker's registry entry: ${getErrorMessage(err)}`);
			}
		},
	};
}
