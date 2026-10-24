/** Markdown section about flow versions, embedded in the generated flow documentation. */
export class VersionsDocumentation {
	public generate(): string {
		return [
			'## Section 11: Flow versions',
			'',
			'### Declare',
			'',
			"Every flow file starts with `version: '1.2.0'`: a quoted semantic version `MAJOR.MINOR.PATCH`, optionally with a prerelease (`'1.3.0-rc.1'`). Unquoted `1.0` or `2` is a number and is refused. Build metadata (`+build`) is not supported.",
			'A flow without `version` is treated as `0.0.0`: it still runs, `flow validate` warns, and its runs cannot be pinned. Add a version.',
			'',
			'### What a version means',
			'',
			'- The first time a flow runs, the daemon stores an immutable snapshot of the exact definition (`definitions/<flow-id>/<version>-<hash>.yml` in the flow config directory). A snapshot is never rewritten or deleted by flow.',
			'- Every execution records `flowVersion`, `definitionHash`, the snapshot and how the version was chosen (`latest`, `pinned` or `file`). `flow show <execution-id>` and `flow history` print it; a later edit of the file cannot change what a past run means, and `flow resume` keeps the definition of the run.',
			'- Records written before versions existed say "version not recorded".',
			'',
			'### Bump rule',
			'',
			'The same version never holds two different contents: running a file whose version equals a snapshot but whose content differs is refused ("same version X but different content: bump the version"). Formatting, comments and key order do not count as a change.',
			'After ANY change to steps, prompts, inputs or settings that you want to run, raise the version: patch for a fix, minor for a compatible addition, major for a change of inputs or behaviour. Use a prerelease (`1.2.1-dev.1`, `1.2.1-dev.2`) while iterating; it ranks below the release `1.2.1`.',
			'`flow validate <file>` and `flow show <file>` tell beforehand whether the version is new, already run, in conflict, or lower than the latest known one (a lower version with new content is never picked as latest).',
			'',
			'### Choosing the version to run',
			'',
			'- `flow run flows/my-flow.yml`: runs that file as it is (and snapshots it).',
			'- `flow run my-flow`: runs the latest version, the highest semantic version among the project registry entry and the snapshots (1.10.0 is above 1.9.0; never decided by file date). It is decided once when the run starts and fixed for the whole execution.',
			'- `flow run my-flow@1.2.0`: runs exactly that version, from its snapshot. An unknown version lists the known ones.',
			'- `flow versions my-flow`: lists the known versions with their hash and the date they were first seen; `*` marks the latest.',
			'',
			'### Sub-flows',
			'',
			'A `subflow` step names a flow id. Rule: sub-flows are resolved when the parent starts, with the same latest-or-pinned logic, and fixed for the whole tree; each sub-execution records its own version. The daemon does not run `subflow` steps yet, so today this is a reserved rule.',
		].join('\n');
	}
}
