import type { WorkerSourceEntry } from '../daemon/WorkerSourceRegistry.js';

/**
 * Explains "no live workers" using what the registry knows.
 *
 * `flow worker list` shows live connections only, because only a connection proves availability
 * (D#4). But answering with nothing more than "no workers are connected" left the reader unable to
 * tell the two situations apart that decide what to do next: nothing declared at all, or a source
 * declared and simply not contacted yet. The registry is readable without a daemon, so there is no
 * reason to make them run a second command to find out.
 *
 * Deliberately never says "available": a declared source is intent, not capacity.
 */
export function describeNoLiveWorkers(declared: WorkerSourceEntry[], daemonRunning: boolean): string {
	const lines: string[] = ['No worker is connected.'];

	if (declared.length === 0) {
		lines.push(
			'No worker source is declared either, so the daemon has nothing to create one from.',
			'Declare one with: flow worker source add <id> --provider built-in:command --command "flow worker"',
			'Or run "flow worker" in a project directory to attach one yourself.'
		);
		return lines.join('\n');
	}

	lines.push(`${String(declared.length)} worker source declared:`);
	for (const entry of declared) {
		const labels = entry.labels.length > 0 ? entry.labels.join(',') : '-';
		lines.push(`  ${entry.sourceId}\t${entry.provider}\tmax=${String(entry.maxWorkers)}\tlabels=${labels}`);
	}
	lines.push(
		daemonRunning
			? 'Each was already asked for a worker; none has connected. See the daemon log for what it reported.'
			: // Not "when a daemon starts": a daemon with nothing to do stops in about a second, so
				// asking then produced a worker it immediately disconnected. Capacity is requested
				// when a step needs it.
				'They are asked for a worker when a step needs one, so run a flow. "flow start" only brings the daemon up.'
	);
	return lines.join('\n');
}
