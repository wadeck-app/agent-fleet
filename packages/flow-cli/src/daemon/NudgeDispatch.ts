import { request } from 'node:http';

const NUDGE_TIMEOUT_MS = 2_000;

/**
 * Sends a single nudge to a waiting worker.
 *
 * Used by `InboundWorkerSource.obtainWorker()` to deliver the daemon's WS address
 * directly to a worker that registered an HTTP endpoint, so it connects immediately
 * instead of waiting for its backoff timer.
 *
 * A failed nudge is not fatal: the worker still reconnects via backoff. The caller
 * decides whether to log or propagate.
 */
export function sendNudge(nudgeUrl: string, wsUrl: string): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const settle = (fn: () => void): void => {
			if (settled) return;
			settled = true;
			fn();
		};

		const body = JSON.stringify({ wsUrl });
		let parsed: URL;
		try {
			parsed = new URL(nudgeUrl);
		} catch (err) {
			reject(new Error(`invalid nudge URL "${nudgeUrl}": ${String(err)}`));
			return;
		}

		const req = request(
			{
				hostname: parsed.hostname,
				port: parsed.port,
				path: parsed.pathname,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					// violations-suppress-next-line: ts/no-unsafe-call Buffer.byteLength is correct here
					'Content-Length': Buffer.byteLength(body),
				},
			},
			res => {
				// Drain the body so the socket is released cleanly.
				res.resume();
				res.on('end', () => {
					if (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300) {
						settle(resolve);
					} else {
						settle(() => reject(new Error(`HTTP ${String(res.statusCode)}`)));
					}
				});
			}
		);

		req.setTimeout(NUDGE_TIMEOUT_MS, () => {
			req.destroy(new Error(`timed out after ${NUDGE_TIMEOUT_MS}ms`));
		});

		req.on('error', err => {
			settle(() => reject(err));
		});

		req.end(body);
	});
}
