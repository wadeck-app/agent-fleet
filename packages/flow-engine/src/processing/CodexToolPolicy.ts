/**
 * CodexToolPolicy -- maps a step's canonical `tools` allow-list (see ToolAccess) onto what codex
 * can actually enforce, and refuses what it cannot.
 *
 * Codex has no `--tools` allow-list. What it does have, each verified against codex-cli 0.163.0
 * with a real model run (StepRunner.codex.integration.test.ts re-checks them when the version
 * changes):
 *
 *   canonical tool        codex mechanism                              verified behaviour
 *   write + edit          --sandbox read-only                          shell redirect AND apply_patch both rejected
 *   bash                  --disable shell_tool                         model reports it has no shell tool
 *   websearch + webfetch  -c web_search="disabled"                     value accepted; default was already off, so
 *                                                                      the "turns it off" effect is NOT verified
 *   read / glob / grep    none -- codex reads files through the shell  satisfied only by also disabling the shell;
 *                                                                      otherwise warned about
 *   task / todowrite      none found (--disable multi_agent did not    warned about
 *                         change the model's own report)
 *
 * An exclusion that would leave a file-writing or web tool usable (one of write/edit, one of
 * websearch/webfetch) throws instead of being ignored: a silent under-restriction is worse than a
 * failed step. Exclusions that are not boundaries (see above) are surfaced as warnings.
 */
import type { ToolName } from './ToolAccess';
import { TOOL_NAMES } from './ToolAccess';

export interface CodexToolPolicyResult {
	/** Run with the read-only sandbox (no file writes, neither via shell nor apply_patch). */
	readOnlySandbox: boolean;
	/** Remove the shell tool entirely. */
	disableShell: boolean;
	/** Turn the web search tool off. */
	disableWebSearch: boolean;
	/** Exclusions codex cannot enforce but that are not a boundary; the caller must surface them. */
	warnings: string[];
}

const NO_RESTRICTION: CodexToolPolicyResult = {
	readOnlySandbox: false,
	disableShell: false,
	disableWebSearch: false,
	warnings: [],
};

export class CodexToolPolicy {
	/**
	 * @param tools - the step's allow-list, or undefined for "no restriction"
	 * @throws when an exclusion cannot be enforced by codex
	 */
	public static resolve(tools: readonly ToolName[] | undefined): CodexToolPolicyResult {
		if (tools === undefined) {
			return { ...NO_RESTRICTION, warnings: [] };
		}
		const allowed = new Set<ToolName>(tools);
		const excluded = TOOL_NAMES.filter(name => !allowed.has(name));
		const isExcluded = (name: ToolName): boolean => !allowed.has(name);

		if (isExcluded('write') !== isExcluded('edit')) {
			const only = isExcluded('write') ? 'write' : 'edit';
			throw new Error(
				`tools excludes '${only}' but not the other of write/edit: codex has a single apply_patch tool for both, so only one cannot be blocked. List both 'write' and 'edit', or neither, in the step's 'tools'.`
			);
		}
		if (isExcluded('websearch') !== isExcluded('webfetch')) {
			const only = isExcluded('websearch') ? 'websearch' : 'webfetch';
			throw new Error(
				`tools excludes '${only}' but not the other of websearch/webfetch: codex has a single web_search tool covering both. List both 'websearch' and 'webfetch', or neither, in the step's 'tools'.`
			);
		}

		const disableShell = isExcluded('bash');
		const warnings: string[] = [];
		const unreachableReads = (['read', 'glob', 'grep'] as const).filter(isExcluded);
		if (unreachableReads.length > 0 && !disableShell) {
			// A warning rather than an error: with the shell allowed these tools are reachable through it
			// in every provider (claude's Bash can cat too), so the exclusion was never a boundary.
			warnings.push(
				`tools excludes ${unreachableReads.map(n => `'${n}'`).join(', ')} but allows 'bash'; codex has no separate file-reading tools, it reads through the shell, so the step can still read files. Exclude 'bash' as well to remove file reading.`
			);
		}

		for (const name of ['task', 'todowrite'] as const) {
			if (excluded.includes(name)) {
				warnings.push(
					`tools excludes '${name}' but no codex setting that disables it was found, so the step may still use it.`
				);
			}
		}

		return {
			readOnlySandbox: isExcluded('write') && isExcluded('edit'),
			disableShell,
			disableWebSearch: isExcluded('websearch') && isExcluded('webfetch'),
			warnings,
		};
	}
}
