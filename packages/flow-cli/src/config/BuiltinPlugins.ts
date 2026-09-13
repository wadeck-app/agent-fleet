import type { PluginManifest } from 'extension-points';
import { manifest as cliApprovalManifest } from 'plugin-cli-approval/plugin.config';
import { manifest as noneManifest } from 'plugin-none/plugin.config';
import { manifest as worktreeManifest } from 'plugin-worktree/plugin.config';

/**
 * The plugins that ship inside the CLI, reachable without touching the filesystem.
 *
 * Why they have to be imported rather than resolved: the published flow-cli is a single bundled
 * file with no `node_modules`, and each plugin's own entry point (`plugin.config.js`) imports its
 * TypeScript sources -- readable under tsx, meaningless to plain node. So the published binary
 * could not load *any* plugin: declaring `plugins.workspace` made the daemon refuse to start with
 * "No manifest found for plugin", and `plugins.approval` -- the only thing that makes a worker
 * interactive -- was unreachable in the product while working fine from a checkout.
 *
 * Static imports fix that: the bundler inlines this code, so the manifests exist in memory. A
 * third-party plugin still resolves from disk, and an explicit `pluginsDir` still wins over these,
 * so a project can override a built-in with its own copy.
 */
export const BUILTIN_PLUGIN_MANIFESTS: Record<string, PluginManifest> = {
	none: noneManifest as PluginManifest,
	'cli-approval': cliApprovalManifest as PluginManifest,
	worktree: worktreeManifest as PluginManifest,
};
