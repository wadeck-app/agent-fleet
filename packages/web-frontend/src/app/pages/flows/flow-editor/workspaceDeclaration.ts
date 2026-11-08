import type { WorkspaceDeclaration } from 'flow-engine/types';

/** Built-in workspace providers the settings dialog can edit. */
export const WORKSPACE_PROVIDERS = ['in-place', 'readonly', 'worktree', 'pool'] as const;

export type WorkspaceProviderName = (typeof WORKSPACE_PROVIDERS)[number];

/** Option keys the dialog edits for each built-in provider. */
const PROVIDER_OPTION_KEYS: Record<WorkspaceProviderName, readonly string[]> = {
	'in-place': ['dir'],
	readonly: ['dir'],
	worktree: ['baseDir', 'prefix'],
	pool: ['dir', 'prefix', 'count'],
};

export const POOL_COUNT_MIN = 1;
export const POOL_COUNT_MAX = 1000;

export function isWorkspaceProviderName(value: string): value is WorkspaceProviderName {
	return (WORKSPACE_PROVIDERS as readonly string[]).includes(value);
}

/** Option keys editable for a provider, or an empty list for a provider the dialog does not know. */
export function getProviderOptionKeys(provider: string): readonly string[] {
	return isWorkspaceProviderName(provider) ? PROVIDER_OPTION_KEYS[provider] : [];
}

export interface ReadWorkspaceDeclaration {
	/** Provider name, or null when the declaration holds none (legacy block, empty object) */
	provider: string | null;
	/** Options of the object form, without the `provider` key; empty for the string form */
	options: Record<string, unknown>;
	/**
	 * Label of what the dialog cannot edit: the unknown provider name, or 'legacy block' when there is no provider.
	 * Null when the provider is one of WORKSPACE_PROVIDERS.
	 */
	unsupported: string | null;
}

/** Reads the provider and the options out of a flow's `workspace:` value (string form, object form, legacy block). */
export function readWorkspaceDeclaration(declaration: WorkspaceDeclaration | undefined): ReadWorkspaceDeclaration {
	if (typeof declaration === 'string') {
		return {
			provider: declaration,
			options: {},
			unsupported: isWorkspaceProviderName(declaration) ? null : declaration,
		};
	}
	if (declaration && typeof declaration === 'object') {
		const { provider, ...options } = declaration;
		if (typeof provider === 'string' && provider !== '') {
			return { provider, options, unsupported: isWorkspaceProviderName(provider) ? null : provider };
		}
		// Object without a provider: the removed { mode, gitStrategy, ... } block (or an empty object)
		return { provider: null, options, unsupported: 'legacy block' };
	}
	return { provider: null, options: {}, unsupported: 'legacy block' };
}

function isEmptyOption(value: unknown): boolean {
	return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/**
 * Builds the `workspace:` value: the plain provider name when no option has a value, `{ provider, ...options }`
 * otherwise. Empty options (undefined, null, blank string) are dropped.
 */
export function buildWorkspaceDeclaration(provider: string, options: Record<string, unknown>): WorkspaceDeclaration {
	const kept = Object.fromEntries(
		Object.entries(options).filter(([key, value]) => key !== 'provider' && !isEmptyOption(value))
	);
	return Object.keys(kept).length === 0 ? provider : { provider, ...kept };
}

/** Parses the text of the pool `count` input: an integer, or undefined when empty or not an integer. */
export function parseCount(text: string): number | undefined {
	const trimmed = text.trim();
	if (!/^\d+$/.test(trimmed)) {
		return undefined;
	}
	return Number.parseInt(trimmed, 10);
}

export function isCountInRange(count: number): boolean {
	return Number.isInteger(count) && count >= POOL_COUNT_MIN && count <= POOL_COUNT_MAX;
}

/** Declaration after the user picks another provider: options that the new provider also has are kept. */
export function changeWorkspaceProvider(
	current: WorkspaceDeclaration | undefined,
	provider: string
): WorkspaceDeclaration {
	const keys = getProviderOptionKeys(provider);
	const kept = Object.fromEntries(
		Object.entries(readWorkspaceDeclaration(current).options).filter(([key]) => keys.includes(key))
	);
	return buildWorkspaceDeclaration(provider, kept);
}

/**
 * Declaration after the user edits one option. `value` is the raw input text; for `count` it is parsed to a number
 * (an unparsable text removes the option). Options the dialog does not edit are preserved.
 */
export function setWorkspaceOption(
	current: WorkspaceDeclaration | undefined,
	key: string,
	value: string
): WorkspaceDeclaration {
	const { provider, options } = readWorkspaceDeclaration(current);
	if (provider === null) {
		throw new Error(
			`Cannot set workspace option '${key}': the workspace declaration has no provider. Pick a provider first.`
		);
	}
	return buildWorkspaceDeclaration(provider, { ...options, [key]: key === 'count' ? parseCount(value) : value });
}
