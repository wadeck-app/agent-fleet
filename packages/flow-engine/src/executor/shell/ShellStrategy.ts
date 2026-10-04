/**
 * Resolves the executable path for a `shell:` kind requested on a `type: script` step.
 * One implementation per shell kind (bash/cmd/pwsh) -- see
 * .claude/plans/2026-10-04_script-step-shell-field.md for the per-shell resolution rules.
 */
export interface ShellStrategy {
	/**
	 * Resolves the binary path for this shell, or throws a fail-fast error naming the shell
	 * and exactly what was searched for. Never falls back silently to another shell.
	 */
	resolve(env: NodeJS.ProcessEnv): string;
}
