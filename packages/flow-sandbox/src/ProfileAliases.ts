import { MODEL_TOOLS, type ModelTool, requireModelTool } from './ModelTool';
import { requireProfileAlias } from './ProfileAlias';
import { SandboxError } from './SandboxError';

const PER_TOOL_HINT = 'profiles=claude=<host profile>,codex=<host profile>[,opencode=<host profile>]';

function isModelTool(name: string): name is ModelTool {
	return (MODEL_TOOLS as readonly string[]).includes(name);
}

/**
 * The `alias=host profile` entries of a source, and which alias each model tool uses.
 * - Several entries: every alias is a TOOL NAME (claude, codex, opencode) and that tool uses it, nothing else does.
 * - One entry whose alias is a tool name: that tool only (a codex step then fails, see {@link aliasFor}).
 * - One entry whose alias is not a tool name: the alias applies to every tool (the meaning before aliases were per tool).
 * A tool without an alias is an error naming the fix, never another tool's alias.
 */
export class ProfileAliases {
	private constructor(
		private readonly profiles: ReadonlyMap<string, string>,
		private readonly shared: string | undefined
	) {}

	/** Entries are `alias=host profile`, split at the FIRST "=" (a host profile may contain "="). */
	static parse(entries: readonly string[]): ProfileAliases {
		if (entries.length === 0) {
			throw new SandboxError(
				'invalid-options',
				`At least one profile entry is required, for example ${PER_TOOL_HINT}.`
			);
		}
		const profiles = new Map<string, string>();
		for (const entry of entries) {
			const separator = entry.indexOf('=');
			if (separator < 1 || separator === entry.length - 1) {
				throw new SandboxError(
					'invalid-options',
					`Profile entry "${entry}" is not alias=profile, for example claude=my-sso-profile.`
				);
			}
			const alias = requireProfileAlias(entry.slice(0, separator));
			const hostProfile = entry.slice(separator + 1);
			// eslint-disable-next-line no-control-regex
			if (/[\u0000-\u001f\u007f]/.test(hostProfile)) {
				throw new SandboxError(
					'invalid-options',
					`The host profile of alias "${alias}" contains a control character.`
				);
			}
			if (profiles.has(alias)) {
				throw new SandboxError(
					'invalid-options',
					`Profile alias "${alias}" is named twice. Give each tool one alias, for example ${PER_TOOL_HINT}.`
				);
			}
			profiles.set(alias, hostProfile);
		}
		const [first] = [...profiles.keys()];
		if (profiles.size === 1) {
			return new ProfileAliases(profiles, isModelTool(first as string) ? undefined : first);
		}
		const notTools = [...profiles.keys()].filter(alias => !isModelTool(alias));
		if (notTools.length > 0) {
			throw new SandboxError(
				'invalid-options',
				`With several profile entries the aliases must all be tool names (${MODEL_TOOLS.join(', ')}), because each tool uses the alias of its own name; found ${notTools.map(alias => `"${alias}"`).join(', ')}. Use ${PER_TOOL_HINT}, or keep one single entry to give every tool the same profile.`
			);
		}
		return new ProfileAliases(profiles, undefined);
	}

	/** alias -> host profile, for the credential endpoint. */
	hostProfiles(): Record<string, string> {
		return Object.fromEntries(this.profiles);
	}

	/** The aliases the credential endpoint exposes and the VM config declares (no host profile name). */
	aliasNames(): string[] {
		return [...this.profiles.keys()];
	}

	/** The alias every tool shares, or undefined when each tool has its own. */
	sharedAlias(): string | undefined {
		return this.shared;
	}

	/** The alias of a tool; throws with the fix when the source declares none for it. */
	aliasFor(tool: ModelTool): string {
		const known = requireModelTool(tool);
		if (this.shared !== undefined) return this.shared;
		const alias = this.profiles.has(known) ? known : undefined;
		if (alias === undefined) {
			throw new SandboxError(
				'invalid-options',
				`${known} step but no ${known} alias: add ${known}=<profile> to the profiles option of this source (declared aliases: ${this.aliasNames().join(', ')}; the alias is the tool name, for example ${PER_TOOL_HINT}).`
			);
		}
		return alias;
	}

	/** The tool a sandbox is prepared for when its first step is a script: claude when it can, else the first tool with an alias. */
	firstTool(): ModelTool {
		if (this.shared !== undefined) return 'claude';
		return MODEL_TOOLS.find(tool => this.profiles.has(tool)) as ModelTool;
	}

	/** One line for the log: aliases only, never a host profile name. */
	describe(): string {
		return this.shared === undefined
			? `per-tool aliases: ${this.aliasNames().join(', ')}`
			: `one alias "${this.shared}" for every tool (${MODEL_TOOLS.join(', ')})`;
	}
}
