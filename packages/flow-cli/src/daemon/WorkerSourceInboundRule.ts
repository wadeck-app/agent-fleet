import { INBOUND_PLUGIN_REF, nudgeUrlConflict } from './InboundNudgeOption.js';
import { nudgeUrlProblem } from './NudgeUrlCheck.js';
import type { WorkerSourcePluginReference } from './WorkerSourcePluginReference.js';
import type { WorkerSourceDeclaration } from './WorkerSourceRegistry.js';

/**
 * Checks the `nudgeUrl` of a source declared with the inbound worker type, at declaration time.
 *
 * Checked for the inbound worker type (plugin form: `options.nudgeUrl` and the entry's) and for the `built-in:inbound`
 * provider (the entry's `nudgeUrl`). Never for a worker declaring itself (`selfDeclared`): that URL is its own endpoint,
 * not user input. Entries already stored are not re-checked here: this runs at declaration only.
 *
 * A `${NAME}` reference is allowed anywhere in the URL and is expanded by the daemon when it builds the instance.
 */
export class WorkerSourceInboundRule {
	constructor(private readonly pluginReference: WorkerSourcePluginReference) {}

	validate(declaration: WorkerSourceDeclaration): void {
		const { sourceId, plugin } = declaration;
		if (declaration.selfDeclared === true) {
			return;
		}
		const isPluginForm =
			plugin !== undefined && this.pluginReference.normalize(declaration).plugin === INBOUND_PLUGIN_REF;
		if (!isPluginForm && declaration.provider !== 'built-in:inbound') {
			return;
		}
		const entryUrl = declaration.nudgeUrl;
		const rawOptionsUrl: unknown = declaration.options?.['nudgeUrl'];
		if (isPluginForm && rawOptionsUrl !== undefined && typeof rawOptionsUrl !== 'string') {
			const type = Array.isArray(rawOptionsUrl)
				? 'array'
				: rawOptionsUrl === null
					? 'null'
					: typeof rawOptionsUrl;
			throw new Error(
				`Worker source "${sourceId}": options.nudgeUrl must be a string (an http(s) URL), got ${type}.`
			);
		}
		// The provider form reads only the entry's nudgeUrl; options.nudgeUrl means nothing to it.
		const optionsUrl = isPluginForm && typeof rawOptionsUrl === 'string' ? rawOptionsUrl : undefined;
		for (const url of [entryUrl, optionsUrl]) {
			if (url !== undefined) {
				this.checkUrl(sourceId, url);
			}
		}
		if (entryUrl !== undefined && optionsUrl !== undefined && entryUrl !== optionsUrl) {
			throw nudgeUrlConflict(sourceId, entryUrl, optionsUrl);
		}
	}

	private checkUrl(sourceId: string, url: string): void {
		const problem = nudgeUrlProblem(url, true);
		if (problem?.kind === 'credential') {
			throw credential(sourceId, problem.where);
		}
		if (problem?.kind === 'invalid') {
			throw invalidUrl(sourceId, url);
		}
	}
}

/** Only called for a URL with no credential in it (the check runs first), so echoing it cannot leak one. */
function invalidUrl(sourceId: string, url: string): Error {
	return new Error(
		`Worker source "${sourceId}": nudgeUrl "${url}" must be an http(s) URL, e.g. http://127.0.0.1:5555/nudge.`
	);
}

function credential(sourceId: string, where: string): Error {
	return new Error(
		`Worker source "${sourceId}": nudgeUrl carries a credential (${where}). ` +
			'Write ${NAME} instead of the literal value and set NAME in the daemon environment.'
	);
}
