/**
 * One live worker connection, as the daemon reports it to `flow worker list`.
 *
 * Only connections appear here: a declared source with nothing attached is deliberately absent,
 * because showing it as idle capacity would suggest capacity that cannot receive a step.
 */
export interface WorkerSummary {
	workerId: string;
	pid: number;
	/** flow-cli version this worker process is running, as self-reported on registration. */
	version?: string;
	state: 'idle' | 'busy';
	sourceId?: string;
	labels: string[];
	/** Registry ids of the projects the worker serves. Absent from a daemon that predates routing by project id. */
	attachedProjectIds?: string[];
	/** Folders of those projects as the worker reported them. */
	attachedProjects: string[];
	hasUserInterface: boolean;
	/** True when this daemon created the worker, so it exits when the daemon idles down. */
	ephemeral: boolean;
	/** Shells this worker can actually run, probed at launch (see WorkerLaunch.probeShellCapabilities). */
	shellCapabilities?: ('bash' | 'cmd' | 'pwsh')[];
}
