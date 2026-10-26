/** Markdown section about projects, embedded in the generated flow documentation. */
export class ProjectsDocumentation {
	public generate(): string {
		return [
			'## Section 12: Projects',
			'',
			'A project is only a folder registered with the shared project registry: `project add "<folder>"` (also `project list`, `project paths add <name> <folder>`). flow does not detect a project from `.git`, `.flow/config.yml`, `.flows/` or `.agent-fleet/`. Flow registry entries (`.flow/flows.yml`, `.flow/flows-custom.yml`) and `.flow/workspaces/` stay in the project folder.',
			'',
			'### Which project a command uses',
			'',
			'1. `-p/--project <name|alias|id>` (on `flow run`, `flow versions`, `flow history`).',
			'2. Environment variable `FLOW_PROJECT` (blank = unset).',
			'3. The registered folder containing the current directory (the deepest one wins).',
			'',
			'There is no fallback: an unknown reference or an unregistered current directory is an error listing the registered projects and the `project add "<folder>"` command to run. A run outside any registered project is refused, including `flow run <file>` from an unregistered folder. `flow history` only filters by project when `-p` or `FLOW_PROJECT` is given. `flow show`, `flow validate` and `flow logs` take no project.',
			'',
			'### Recorded',
			'',
			'Every execution records `projectId` (the registry id) next to `projectRoot`; `flow show <execution-id>` prints `Project: name (id)`. Queue events carry `projectId` next to `projectRoot`. Records written before projects existed only have `projectRoot`.',
			'',
			'### Project config',
			'',
			'Hooks and plugins live in `<registry>/projects/<project id>/flow/config/config.yml` (registry: `$XDG_CONFIG_HOME/project`, else `~/.config/project`; the id is in `project list`), not in the repository. Only `plugins` and `hooks` are allowed there, and they are not inherited from a parent project. A daemon setting (`queue`, `worker`, `autoUpdate`, ...) is refused with the file and key, and belongs in `~/.config/flow/config.yml`; hooks in that global file are refused too. A leftover `<project folder>/.flow/config.yml` is an error giving the `mv` command; flow never reads it or moves it for you.',
			'',
			'### Workers',
			'',
			'`flow worker --project <name|alias|id>` (repeatable) and `FLOW_WORKER_PROJECTS` attach a worker to registered projects; a folder path is refused. Steps are routed by project id.',
		].join('\n');
	}
}
