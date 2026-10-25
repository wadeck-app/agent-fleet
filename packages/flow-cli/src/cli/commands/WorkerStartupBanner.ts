// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import type { WorkerReady } from '../../ipc/Protocol';
import { VERSION } from '../version.js';

// violations-suppress-end: ts/no-deep-relative

/**
 * Says *why* a worker is not interactive, since the reason decides what to do about it.
 *
 * "interactive: false" on its own leaves the user guessing between a missing terminal and a
 * missing plugin, and only one of those is fixed by editing config.
 */
function explainInteractivity(interactive: boolean, hasApproval: boolean): string {
	if (interactive) {
		return '';
	}
	if (!hasApproval) {
		return ' (no approval plugin configured, so no user_intervention step can run here)';
	}
	// Naming the plugin matters: the fix is either "run this in a terminal" or "configure an
	// approval plugin that does not need one", and only the second is an edit to config.
	return (
		' (the configured approval plugin needs a terminal and this is not one, so no' +
		' user_intervention step can run here -- plugins.file-approval answers from a file instead)'
	);
}

export interface WorkerStartupBannerParams {
	/** The registered projects this worker serves, the first being its own. */
	projects: { id: string; name: string; path?: string }[];
	registration: Omit<WorkerReady, 'type'>;
	hasApprovalProvider: boolean;
	interactive: boolean;
	verbose: boolean;
}

/** Prints the operator-facing startup summary of this worker (everything before the registry line). */
export function printWorkerStartupBanner(params: WorkerStartupBannerParams): void {
	const { projects, registration, hasApprovalProvider } = params;
	console.log(`[ok] flow worker for ${projects.map(project => project.name).join(', ')}`);
	// So "which build served this step" is answerable from the worker's own terminal, not just
	// by cross-referencing a daemon-side version field after the fact.
	console.log(`     version    : ${VERSION}`);
	if (registration.labels && registration.labels.length > 0) {
		console.log(`     labels     : ${registration.labels.join(', ')}`);
	}
	console.log(`     projects   : ${projects.map(project => `${project.name} (${project.id})`).join(', ')}`);
	console.log(
		`     shells     : ${registration.shellCapabilities && registration.shellCapabilities.length > 0 ? registration.shellCapabilities.join(', ') : '(none detected)'}`
	);
	console.log(
		`     can-answer-checkpoints: ${String(registration.hasUserInterface)}${explainInteractivity(registration.hasUserInterface === true, hasApprovalProvider)}`
	);
	// Separate from the line above on purpose (see buildStepRunnerConfig): being able to answer
	// a user_intervention checkpoint never implies this.
	console.log(
		`     model-step-interactive: ${String(params.interactive)}${
			params.interactive
				? " (every type:model step on this worker launches via the model CLI's own interactive terminal session)"
				: ' (pass --interactive to opt in)'
		}`
	);
	console.log('     Waiting for steps. This worker stays alive across daemon restarts; Ctrl-C to stop.');
	if (!params.verbose) {
		console.log('     Run with --verbose to also see the raw output each step produces.');
	}
}

/**
 * Prints whether this worker's self declaration was recorded. `declaration` is `undefined`
 * for a worker launched from a declared source, which prints nothing.
 */
export function printWorkerRegistryStatus(declaration: { sourceId: string | undefined } | undefined): void {
	if (declaration?.sourceId !== undefined) {
		console.log(`     registry   : declared as "${declaration.sourceId}" while this process lives`);
	} else if (declaration !== undefined) {
		// Not a fatal condition (see SelfDeclarationManager): this worker still runs and can
		// still be dispatched to by a daemon that already holds its connection, it just will
		// not show up in "flow worker list" or survive a disconnect while unregistered. Said
		// here too, not only in the retried warning, since this is the one line most likely
		// to actually be read (right after launch).
		console.log('     registry   : could not record itself yet -- retrying in the background (see warnings above)');
	}
}
