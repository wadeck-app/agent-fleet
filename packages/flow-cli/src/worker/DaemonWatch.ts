import { type FSWatcher, watch } from 'node:fs';

import { WORKER_PORT_FILE } from '../daemon/Daemon.js';
import type { ReconnectNotifier } from './ReconnectNotifier.js';

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

/**
 * `ReconnectNotifier` implementation backed by `watchForDaemon`.
 *
 * Starts a new watcher each time `onNotify` is called with a callback, and stops it
 * when cleared. The callback receives `undefined` for `wsUrl` because the file-watch
 * only signals readiness -- the address is not carried by the event; the caller reads
 * `worker.port` itself.
 */
export class DaemonWatchNotifier implements ReconnectNotifier {
	private stopFn: (() => void) | undefined;

	constructor(private readonly daemonDir: string) {}

	onNotify(callback: ((wsUrl: string | undefined) => void) | undefined): void {
		this.stopFn?.();
		this.stopFn = undefined;
		if (callback !== undefined) {
			// File-watch does not carry the WS URL; the worker reads worker.port itself.
			this.stopFn = watchForDaemon(this.daemonDir, () => callback(undefined));
		}
	}

	stop(): void {
		this.stopFn?.();
		this.stopFn = undefined;
	}
}
