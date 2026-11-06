import { SENSITIVE_FIELDS } from 'extension-points';

import { INBOUND_PLUGIN_REF, nudgeUrlConflict } from './InboundNudgeOption.js';
import type { WorkerSourcePluginReference } from './WorkerSourcePluginReference.js';
import type { WorkerSourceDeclaration } from './WorkerSourceRegistry.js';

const SENSITIVE_KEYS = new Set(SENSITIVE_FIELDS.map(field => field.toLowerCase()));
const ENV_REFERENCE = /\$\{[^}]+\}/g;
const WHOLE_ENV_REFERENCE = /^\$\{[^}]+\}$/;

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
		let parsed: URL;
		try {
			// A reference stands for any text, so it is replaced by a placeholder for the syntax check only.
			parsed = new URL(url.replace(ENV_REFERENCE, 'x'));
		} catch {
			throw invalidUrl(sourceId, url);
		}
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			throw invalidUrl(sourceId, url);
		}
		if (hasLiteralUserInfo(url)) {
			throw credential(sourceId, 'user info');
		}
		const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
		for (const [key, value] of new URLSearchParams(query)) {
			if (SENSITIVE_KEYS.has(key.toLowerCase()) && !WHOLE_ENV_REFERENCE.test(value)) {
				throw credential(sourceId, `query parameter "${key}"`);
			}
		}
	}
}

/** Whether the authority has user info that is not made only of `${NAME}` references. */
function hasLiteralUserInfo(url: string): boolean {
	const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#@]*)@/i.exec(url);
	return match !== null && match[1]!.replace(ENV_REFERENCE, '').replace(/:/g, '') !== '';
}

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
