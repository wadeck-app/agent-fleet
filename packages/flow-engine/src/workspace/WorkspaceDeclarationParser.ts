/**
 * What a flow's `workspace:` declares, once read: the provider that allocates the folder and the options it validates.
 *
 * Pure (no I/O): the validator uses it to refuse a bad declaration before a run, the daemon to pick the provider.
 * Whether the provider exists is NOT decided here (named instances come from the user's config); the daemon checks
 * that when it resolves the provider.
 */

/** The providers every installation has. Listed in the messages that tell an author what to write. */
export const BUILTIN_WORKSPACE_PROVIDERS = ['in-place', 'pool', 'readonly', 'worktree'] as const;

/** Old provider names still accepted, with the name they stand for. */
const PROVIDER_ALIASES: Readonly<Record<string, string>> = { none: 'in-place' };

/** Keys of the removed `mode` / `gitStrategy` / `reusePolicy` block. */
const LEGACY_KEYS = ['mode', 'gitStrategy', 'reusePolicy', 'concurrencyKey'] as const;

const PROVIDER_LIST = BUILTIN_WORKSPACE_PROVIDERS.join(', ');

const EXAMPLES =
	'workspace: in-place   (run in the project folder), ' +
	'workspace: readonly   (shared, advisory read-only), ' +
	'workspace: { provider: pool, dir: D:/pool, prefix: repo-ws-, count: 4 }, ' +
	'workspace: { provider: worktree, baseDir: ../worktrees }';

export interface WorkspaceSpec {
	provider: string;
	options: Record<string, unknown>;
}

export interface WorkspaceDeclarationIssue {
	/** Path of the faulty field, in the flow's own words (`workspace`, `workspace.mode`...). */
	field: string;
	message: string;
	suggestion: string;
}

export type WorkspaceParseResult =
	{ ok: true; spec: WorkspaceSpec; warnings: string[] } | { ok: false; issues: WorkspaceDeclarationIssue[] };

export class WorkspaceDeclarationParser {
	static parse(declaration: unknown): WorkspaceParseResult {
		if (declaration === undefined || declaration === null) {
			return fail({
				field: 'workspace',
				message: 'The flow does not declare a workspace. Every flow must say where its steps run.',
				suggestion: `Add a "workspace:" to the flow. Providers: ${PROVIDER_LIST}. Examples: ${EXAMPLES}.`,
			});
		}
		if (typeof declaration === 'string') {
			return WorkspaceDeclarationParser.fromName(declaration, {});
		}
		if (typeof declaration !== 'object' || Array.isArray(declaration)) {
			return fail({
				field: 'workspace',
				message: `"workspace" must be a provider name or an object with a "provider" key, got ${Array.isArray(declaration) ? 'an array' : typeof declaration}.`,
				suggestion: `Use a provider name (${PROVIDER_LIST}) or an object. Examples: ${EXAMPLES}.`,
			});
		}
		return WorkspaceDeclarationParser.fromObject(declaration as Record<string, unknown>);
	}

	/** The provider a declaration stands for, or "(invalid workspace)" when it declares none: for summaries, never for decisions. */
	static providerNameOf(declaration: unknown): string {
		const result = WorkspaceDeclarationParser.parse(declaration);
		return result.ok ? result.spec.provider : '(invalid workspace)';
	}

	/** True for the providers that give a run a folder of its own (nobody else writes there meanwhile). */
	static isExclusive(providerName: string): boolean {
		return providerName === 'worktree' || providerName === 'pool';
	}

	private static fromObject(raw: Record<string, unknown>): WorkspaceParseResult {
		const hasProvider = raw['provider'] !== undefined;
		const hasMode = raw['mode'] !== undefined;
		if (hasProvider && hasMode) {
			return fail({
				field: 'workspace.mode',
				message: '"workspace.mode" is the removed legacy block and cannot be combined with "provider".',
				suggestion:
					'Remove mode, gitStrategy, reusePolicy and concurrencyKey; keep only "provider" and its options.',
			});
		}
		if (hasMode) {
			return WorkspaceDeclarationParser.fromLegacyBlock(raw);
		}
		const legacyKey = LEGACY_KEYS.find(key => raw[key] !== undefined);
		if (legacyKey !== undefined) {
			return fail({
				field: `workspace.${legacyKey}`,
				message: `"workspace.${legacyKey}" was removed together with the legacy workspace block.`,
				suggestion: `Declare a provider instead. Providers: ${PROVIDER_LIST}. Examples: ${EXAMPLES}.`,
			});
		}
		if (!hasProvider) {
			return fail({
				field: 'workspace.provider',
				message: 'The "workspace" object has no "provider".',
				suggestion: `Add "provider: <name>". Providers: ${PROVIDER_LIST}. Examples: ${EXAMPLES}.`,
			});
		}
		const { provider, ...options } = raw;
		if (typeof provider !== 'string' || provider.trim() === '') {
			return fail({
				field: 'workspace.provider',
				message: `"workspace.provider" must be a non-empty string, got ${JSON.stringify(provider)}.`,
				suggestion: `Use one of: ${PROVIDER_LIST}.`,
			});
		}
		return WorkspaceDeclarationParser.fromName(provider, options);
	}

	private static fromName(rawName: string, options: Record<string, unknown>): WorkspaceParseResult {
		const name = rawName.trim();
		if (name === '') {
			return fail({
				field: 'workspace',
				message: '"workspace" is empty.',
				suggestion: `Use one of: ${PROVIDER_LIST}. Example: workspace: in-place.`,
			});
		}
		const alias = PROVIDER_ALIASES[name];
		if (alias !== undefined) {
			return {
				ok: true,
				spec: { provider: alias, options },
				warnings: [
					`workspace provider "${name}" is deprecated and will be removed: write "${alias}" instead (workspace: ${alias}).`,
				],
			};
		}
		return { ok: true, spec: { provider: name, options }, warnings: [] };
	}

	private static fromLegacyBlock(raw: Record<string, unknown>): WorkspaceParseResult {
		const mode = raw['mode'];
		const gitStrategy = raw['gitStrategy'];
		switch (mode) {
			case 'manual':
				return {
					ok: true,
					spec: { provider: 'in-place', options: {} },
					warnings: [
						'workspace "mode: manual" is deprecated and will be removed: write "workspace: in-place" instead. ' +
							'gitStrategy, reusePolicy and concurrencyKey have no effect and can be deleted.',
					],
				};
			case 'isolated':
				return fail(WorkspaceDeclarationParser.isolatedIssue(gitStrategy));
			case 'shared':
				return fail({
					field: 'workspace.mode',
					message:
						'workspace.mode "shared" was removed: its reuse never worked (every run got a new folder that was never cleaned).',
					suggestion:
						'For folders that are reused by several runs, build a pool and write ' +
						'"workspace: { provider: pool, dir: <folder>, prefix: <name>, count: <n> }". ' +
						'For a folder every run shares, write "workspace: in-place" (or "readonly").',
				});
			default:
				return fail({
					field: 'workspace.mode',
					message: `Unknown workspace.mode ${JSON.stringify(mode)}: the legacy block was removed.`,
					suggestion: `Declare a provider instead. Providers: ${PROVIDER_LIST}. Examples: ${EXAMPLES}.`,
				});
		}
	}

	private static isolatedIssue(gitStrategy: unknown): WorkspaceDeclarationIssue {
		if (gitStrategy === 'worktree') {
			return {
				field: 'workspace.mode',
				message: 'workspace.mode "isolated" with gitStrategy "worktree" was removed.',
				suggestion:
					'Write "workspace: { provider: worktree, baseDir: <folder outside the project>, prefix: <name>- }". ' +
					'baseDir is relative to the project folder and must not be inside a git worktree (use "../worktrees", not ".flow/").',
			};
		}
		if (gitStrategy === 'none') {
			return {
				field: 'workspace.mode',
				message:
					'workspace.mode "isolated" with gitStrategy "none" was removed: it gave an empty directory with no project files.',
				suggestion: `If the steps need no project files, write "workspace: in-place" (or "readonly") and keep the work in the step scripts. Providers: ${PROVIDER_LIST}.`,
			};
		}
		const strategyText =
			typeof gitStrategy === 'string' ? `gitStrategy "${gitStrategy}"` : 'the default gitStrategy';
		return {
			field: 'workspace.mode',
			message: `workspace.mode "isolated" with ${strategyText} (a clone of the project) was removed: clone strategies are no longer supported.`,
			suggestion:
				'Use "workspace: { provider: worktree, baseDir: ../worktrees, prefix: <name>- }" for a new branch per run, ' +
				'or "workspace: { provider: pool, dir: <folder>, prefix: <name>-, count: <n> }" for prepared clones.',
		};
	}
}

function fail(issue: WorkspaceDeclarationIssue): WorkspaceParseResult {
	return { ok: false, issues: [issue] };
}
