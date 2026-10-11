/**
 * Per-step overrides for opencode's own permission prompts (`external_directory`, `edit`,
 * `bash`, `webfetch`, `doom_loop`), mirroring opencode's own `permission` config block.
 *
 * Exists because a headless worker (no TTY, no approval plugin wired for this permission
 * type -- only `user_intervention`/file-approval covers that) can never answer opencode's
 * default `ask` action: the CLI just hangs until it eventually exits 0 with no output and
 * zero metered tokens (see ModelStepExecutor's empty-output guard, which is what actually
 * surfaces the failure). A project-wide `permission` block in `.flow/opencode.json` would
 * fix this, but over-restricts steps that legitimately need to touch files outside the
 * project, or over-opens every headless step's filesystem reach project-wide. Scoped to the
 * individual step instead: most steps never need this, and the ones that do need different
 * answers from each other.
 */
export const OPENCODE_PERMISSION_KEYS = ['external_directory', 'edit', 'bash', 'webfetch', 'doom_loop'] as const;
export type OpenCodePermissionKey = (typeof OPENCODE_PERMISSION_KEYS)[number];
export type OpenCodePermissionAction = 'allow' | 'deny' | 'ask';
export type OpenCodePermissionOverrides = Partial<Record<OpenCodePermissionKey, OpenCodePermissionAction>>;

const VALID_ACTIONS: readonly OpenCodePermissionAction[] = ['allow', 'deny', 'ask'];

/**
 * Validated at launch time, not left to opencode to reject: an unknown key or action would
 * otherwise reach the opencode CLI inside its own config and fail there with a message about
 * opencode's config schema, not about the flow step that set it.
 */
export function validateOpenCodePermissionOverrides(permission: OpenCodePermissionOverrides): void {
	for (const [key, value] of Object.entries(permission)) {
		if (!(OPENCODE_PERMISSION_KEYS as readonly string[]).includes(key)) {
			throw new Error(`permission key '${key}' is not one of: ${OPENCODE_PERMISSION_KEYS.join(', ')}`);
		}
		if (!VALID_ACTIONS.includes(value as OpenCodePermissionAction)) {
			throw new Error(
				`permission.${key} must be one of: ${VALID_ACTIONS.join(', ')}, got ${JSON.stringify(value)}`
			);
		}
	}
}
