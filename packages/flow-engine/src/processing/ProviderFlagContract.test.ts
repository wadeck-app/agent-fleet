/**
 * Do the flags we send still exist in the installed CLIs?
 *
 * This exists because `--resume` drifted to `--session` in opencode and nothing noticed for
 * months. The provider unit tests assert we *build* the flag we intend; the integration tests
 * run against mock CLIs that accept anything. Neither can see a real CLI renaming a flag.
 *
 * Deliberately reads `--help` and nothing else: no model call, no token spend, no network, so
 * it can run on every commit rather than only when a version changes. A flag we emit that the
 * CLI no longer lists is a hard failure -- sending it means the step dies with a usage screen
 * before the model is ever reached.
 *
 * Skips only when a CLI is absent, which is honest: there is nothing to compare against. It
 * says which one, so an empty run is never mistaken for a passing one.
 */
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/** Flags each provider can put on the command line, and where they come from. */
const PROVIDER_FLAGS: { cli: string; helpArgs: string[]; source: string; flags: string[] }[] = [
	{
		cli: 'opencode',
		helpArgs: ['run', '--help'],
		source: 'OpenCodeModelProvider.buildSpawnParams',
		flags: ['--format', '--auto', '-m', '--session'],
	},
	{
		cli: 'claude',
		helpArgs: ['--help'],
		source: 'ClaudeLauncher.buildArgs',
		flags: [
			'--mcp-config',
			'--settings',
			'--include-hook-events',
			'--dangerously-skip-permissions',
			'--output-format',
			'--verbose',
			'--model',
			'--resume',
			'-p',
		],
	},
	{
		cli: 'codex',
		helpArgs: ['exec', '--help'],
		source: 'CodexModelProvider.buildSpawnParams',
		// `resume` is a subcommand rather than a flag, and appears in the same help output.
		flags: ['--json', '--skip-git-repo-check', '-m', '--approve-for-me', 'resume'],
	},
];

/** The CLI's own help text, or undefined when the CLI is not installed. */
function helpText(cli: string, helpArgs: string[]): string | undefined {
	const result = spawnSync(cli, helpArgs, { encoding: 'utf8', timeout: 60_000, shell: true });
	if (result.error !== undefined) return undefined;
	const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
	return output.trim() === '' ? undefined : output;
}

describe.each(PROVIDER_FLAGS)('$cli accepts every flag $source sends', ({ cli, helpArgs, flags }) => {
	const help = helpText(cli, helpArgs);

	it.skipIf(help === undefined)('lists all of them in its help', () => {
		const missing = flags.filter(flag => !(help ?? '').includes(flag));

		expect(
			missing,
			`${cli} no longer lists: ${missing.join(', ')}. A step sending these dies on a usage screen before reaching the model. Check "${cli} ${helpArgs.join(' ')}" and update the provider.`
		).toEqual([]);
	});

	it(`reports whether ${cli} was available to check`, () => {
		// Never silent: a run where the CLI is missing has to look different from a passing one.
		if (help === undefined) {
			console.warn(`[flag contract] ${cli} is not installed, so its flags were not verified`);
		}
		expect(true).toBe(true);
	});
});
