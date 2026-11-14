const CONFIG_DRIVEN = new Set([
	'git',
	'npm',
	'npx',
	'pnpm',
	'yarn',
	'make',
	'python',
	'python3',
	'node',
	'pip',
	'cargo',
	'go',
	'dotnet',
	'mvn',
	'gradle',
	'ruby',
	'php',
	'pwsh',
	'bash',
	'sh',
]);

/**
 * Executables that read configuration or scripts from their working directory (git hooks and `core.fsmonitor`, npm
 * config, Makefile, conftest.py, package.json scripts, ...). Started in a directory the model can write, they run
 * what the model planted. `flow validate` warns when a host tool pairs one of them with `cwd: workspace`.
 */
export class ConfigDrivenExecutables {
	/** True when the executable's basename (any directory, lower-cased, `.exe` removed) is in the list. */
	static includes(executable: string): boolean {
		const basename = executable.split(/[\\/]/).pop() ?? '';
		return CONFIG_DRIVEN.has(basename.toLowerCase().replace(/\.exe$/, ''));
	}
}
