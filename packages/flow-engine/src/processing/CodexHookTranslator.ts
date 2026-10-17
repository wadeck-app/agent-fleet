/**
 * CodexHookTranslator -- converts ToolHook[] into a Node script that codex runs as a command hook.
 *
 * Codex hooks (`hooks.PreToolUse` / `hooks.PostToolUse`, registered with `-c`, see
 * CodexConfigBuilder.hookOverride) are Claude-style command hooks. Verified against codex-cli
 * 0.163.0 with real runs:
 *  - stdin is one JSON object: { hook_event_name, tool_name, tool_input, tool_response (post),
 *    tool_use_id, session_id, cwd, ... }.
 *  - tool_name is `Bash` for shell commands, `apply_patch` for file edits and
 *    `mcp__<server>__<tool>` for MCP tools.
 *  - printing { hookSpecificOutput: { hookEventName, permissionDecision: "deny",
 *    permissionDecisionReason } } blocks the call; the reason must be non-empty. The model is told
 *    "Command blocked by PreToolUse hook: <reason>" and no command_execution item is emitted.
 *  - hooks do NOT run at all unless the run passes --dangerously-bypass-hook-trust. Codex prints
 *    nothing when it skips them, so the provider must always pass that flag together with hooks.
 *
 * Why one script instead of one hook per ToolHook: `toolPattern` is a glob matched against the tool
 * name. Codex's own `matcher` semantics are not needed -- matching here also allows
 * case-insensitive names (a flow written with opencode's `bash` or claude's `Bash` both match
 * `Bash`) and the canonical `write` / `edit` names, which both map to codex's single `apply_patch`.
 *
 * The script fails CLOSED: if it crashes while deny rules exist, it denies. Codex treats a hook
 * that errors out as "not a block", so failing open would silently disable a security rule.
 */
import type { ToolHook } from './ToolHook';

export interface CodexHookScript {
	/** The script source, or undefined when no hook produces any behaviour for codex. */
	source: string | undefined;
	hasBefore: boolean;
	hasAfter: boolean;
	/** Human-readable notes about hooks that were dropped, for the caller to surface. */
	warnings: string[];
}

interface ScriptRule {
	timing: 'before' | 'after';
	type: 'log' | 'deny';
	reason?: string;
	toolPattern?: string;
	argsContains?: string;
}

export class CodexHookTranslator {
	/**
	 * @param hooks - the step's tool hooks
	 * @param logFile - path the script appends `[tool-use]` / `[tool-result]` lines to; the provider
	 *   reads it after the run (hook stderr is not visible to the parent process)
	 */
	public static toScript(hooks: readonly ToolHook[], logFile: string): CodexHookScript {
		const rules: ScriptRule[] = [];
		const warnings: string[] = [];
		for (const hook of hooks) {
			if (hook.action.type === 'log') {
				rules.push({ timing: hook.timing, type: 'log' });
			} else if (hook.timing === 'before') {
				rules.push({
					timing: 'before',
					type: 'deny',
					reason: hook.action.reason,
					toolPattern: hook.action.toolPattern,
					argsContains: hook.action.argsContains,
				});
			} else {
				warnings.push(
					"a 'deny' tool hook with timing 'after' was ignored: the tool has already run, so it cannot be denied. Use timing 'before'."
				);
			}
		}

		const hasBefore = rules.some(r => r.timing === 'before');
		const hasAfter = rules.some(r => r.timing === 'after');
		if (!hasBefore && !hasAfter) {
			return { source: undefined, hasBefore, hasAfter, warnings };
		}

		const hasDeny = rules.some(r => r.type === 'deny');
		const source = `'use strict';
const fs = require('fs');
const RULES = ${JSON.stringify(rules)};
const LOG_FILE = ${JSON.stringify(logFile)};
const HAS_DENY = ${hasDeny};
const PHASE = process.argv[2] === 'post' ? 'after' : 'before';
// codex has a single apply_patch tool for what the canonical tool names call write and edit
const ALIASES = { write: 'apply_patch', edit: 'apply_patch' };

function matches(pattern, toolName) {
  const candidates = [pattern];
  const alias = ALIASES[pattern.toLowerCase()];
  if (alias) candidates.push(alias);
  return candidates.some(p => new RegExp('^' + p.replace(/[.+^\${}()|[\\]\\\\]/g, '\\\\$&').replace(/\\*/g, '.*') + '$', 'i').test(toolName));
}

function deny(reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
}

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input);
    const toolName = String(payload.tool_name);
    const toolInput = JSON.stringify(payload.tool_input === undefined ? {} : payload.tool_input);
    for (const rule of RULES) {
      if (rule.timing !== PHASE) continue;
      if (rule.type === 'log') {
        const line = PHASE === 'before'
          ? '[tool-use] ' + toolName + ' ' + toolInput
          : '[tool-result] ' + toolName + ' ' + (typeof payload.tool_response === 'string' ? payload.tool_response : JSON.stringify(payload.tool_response));
        fs.appendFileSync(LOG_FILE, line + '\\n');
        continue;
      }
      if (rule.toolPattern !== undefined && !matches(rule.toolPattern, toolName)) continue;
      if (rule.argsContains !== undefined && !toolInput.toLowerCase().includes(rule.argsContains.toLowerCase())) continue;
      deny('Tool denied: ' + rule.reason);
      return;
    }
  } catch (err) {
    if (HAS_DENY && PHASE === 'before') deny('Tool denied: the hook script failed (' + (err && err.message) + '), failing closed');
  }
});
`;
		return { source, hasBefore, hasAfter, warnings };
	}
}
