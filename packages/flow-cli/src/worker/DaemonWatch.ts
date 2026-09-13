import { type FSWatcher, watch } from 'node:fs';

import { WORKER_PORT_FILE } from '../daemon/Daemon.js';

/** Collapses the burst of events a single write produces into one notification. */
const DEBOUNCE_MS = 50;

/**
 * Calls back as soon as a daemon says it is ready to accept workers.
 *
 * The daemon already announces itself: it publishes `worker.port` once its listener is bound. A
 * waiting worker used to ignore that and rely solely on its reconnect backoff, so it learned about a
 * new daemon up to 30 seconds late -- long enough for the daemon to dispatch a step, find nobody,
 * and give up on it.
 *
 * The worker still does the connecting; this only tells it when to bother. So no port is opened on
 * the worker side and trust still originates from the worker dialling in (D#4).
 *
 * The directory is watched rather than the file, because the file usually does not exist yet -- that
 * is the whole situation being waited for. Failure to watch is not fatal: the caller keeps its
 * backoff, so the worst case is the behaviour this replaces.
 */
export function watchForDaemon(daemonDir: string, onDaemonReady: () => void): () => void {
	let watcher: FSWatcher | undefined;
	let timer: NodeJS.Timeout | undefined;
	let disposed = false;

	try {
		watcher = watch(daemonDir, (_event, filename) => {
			if (disposed) return;
			// filename is null on some platforms for some events; nothing to match on then.
			if (filename === null || filename.toString() !== WORKER_PORT_FILE) return;
			if (timer !== undefined) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = undefined;
				if (!disposed) onDaemonReady();
			}, DEBOUNCE_MS);
		});
		// A watcher must not be what keeps the process alive: the reconnect timer already does that
		// deliberately, and a worker whose only remaining handle is this watch has nothing to wait
		// for anyway.
		watcher.unref();
	} catch {
		// Reported by nobody on purpose: the caller's backoff still covers it, and a warning on
		// every launch in an unwatchable directory would be noise. See the doc above.
	}

	return () => {
		disposed = true;
		if (timer !== undefined) clearTimeout(timer);
		watcher?.close();
	};
}
