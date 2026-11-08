import type { WorkspaceProvider } from 'extension-points';
import { BUILTIN_WORKSPACE_PROVIDERS, WorkspaceDeclarationParser } from 'flow-engine';
import type { FlowDefinition, FlowPluginOverrides } from 'flow-engine';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import { PluginLoader } from '../config/PluginLoader';

type PluginSection = NonNullable<FlowPluginOverrides['workspace']>;

/** The provider that serves a flow, and what to tell the author about how the flow declared it. */
export interface ResolvedWorkspaceProvider {
	provider: WorkspaceProvider;
	/** Deprecations to write in the execution log. */
	warnings: string[];
}

/** What {@link ExecutionWorkspaces} needs to get the provider of a flow; replaced by a stub in tests. */
export interface WorkspaceProviderSource {
	providerFor(flow: FlowDefinition): Promise<ResolvedWorkspaceProvider>;
}

/** Providers that keep state between runs (claims, queues) and so must be one instance for the daemon. */
const STATEFUL_PROVIDERS: ReadonlySet<string> = new Set(['pool']);

/**
 * Turns the `workspace:` of a flow into the provider that allocates its folder.
 *
 * Built-in names (`in-place`, `readonly`, `pool`, `worktree`) are loaded from the built-in plugin manifests; any other
 * name is an instance of the user's config (`plugins.instances.<name>`). The deprecated `plugins.workspace` of a flow
 * without `workspace:` is still served, with a warning. Every failure names what was declared and what to write.
 */
export class WorkspaceProviders implements WorkspaceProviderSource {
	private readonly loader = new PluginLoader();
	private readonly stateful = new Map<string, WorkspaceProvider>();

	/** @param resolveInstance Builds the provider of a config instance (`use: <name>`) or of the deprecated `plugins.workspace`. */
	constructor(private readonly resolveInstance?: (section: PluginSection) => Promise<WorkspaceProvider>) {}

	async providerFor(flow: FlowDefinition): Promise<ResolvedWorkspaceProvider> {
		if ((flow.workspace === undefined || flow.workspace === null) && flow.plugins?.workspace !== undefined) {
			return this.fromDeprecatedPluginSection(flow.plugins.workspace);
		}
		const parsed = WorkspaceDeclarationParser.parse(flow.workspace);
		if (!parsed.ok) {
			throw new Error(parsed.issues.map(issue => `${issue.message} ${issue.suggestion}`).join(' '));
		}
		const { provider: name, options } = parsed.spec;
		if ((BUILTIN_WORKSPACE_PROVIDERS as readonly string[]).includes(name)) {
			return { provider: await this.builtin(name, options), warnings: parsed.warnings };
		}
		return { provider: await this.instance(name, options), warnings: parsed.warnings };
	}

	private async builtin(name: string, options: Record<string, unknown>): Promise<WorkspaceProvider> {
		const build = async (): Promise<WorkspaceProvider> =>
			(await this.loader.loadProvider(`plugins.${name}.default`, 'workspace', options)) as WorkspaceProvider;
		if (!STATEFUL_PROVIDERS.has(name)) {
			return build();
		}
		const key = `${name}:${JSON.stringify(options)}`;
		let provider = this.stateful.get(key);
		if (provider === undefined) {
			provider = await build();
			this.stateful.set(key, provider);
		}
		return provider;
	}

	private async instance(name: string, options: Record<string, unknown>): Promise<WorkspaceProvider> {
		const known = BUILTIN_WORKSPACE_PROVIDERS.join(', ');
		if (this.resolveInstance === undefined) {
			throw new Error(
				`Unknown workspace provider "${name}". Built-in providers: ${known}. No config instance can be resolved here.`
			);
		}
		try {
			return await this.resolveInstance({ use: name, ...(Object.keys(options).length === 0 ? {} : { options }) });
		} catch (err) {
			throw new Error(
				`Unknown workspace provider "${name}". Built-in providers: ${known}; or an instance defined in the flow config (plugins.instances.${name}). ${getErrorMessage(err)}`
			);
		}
	}

	private async fromDeprecatedPluginSection(section: PluginSection): Promise<ResolvedWorkspaceProvider> {
		const warning =
			'"plugins.workspace" is deprecated and will be removed: declare the workspace with "workspace:" instead ("workspace: <instance name>" or "workspace: { provider: <name>, ...options }").';
		if (this.resolveInstance === undefined) {
			throw new Error(`${warning} It cannot be resolved here.`);
		}
		try {
			return { provider: await this.resolveInstance(section), warnings: [warning] };
		} catch (err) {
			throw new Error(`Failed to resolve "plugins.workspace" of the flow: ${getErrorMessage(err)}. ${warning}`);
		}
	}
}
