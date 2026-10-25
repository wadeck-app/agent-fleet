import { addProject, defaultRegistryDir } from '@wadeck-app/project-sdk';
import type { Project } from '@wadeck-app/project-sdk';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A throwaway project registry for a test: its own XDG_CONFIG_HOME, projects registered through the SDK (never by writing
 * registry.json by hand), and an `env` to hand to the code under test. The real registry is never touched.
 *
 * `useAsProcessEnv()` also points this process at it (restored by `dispose()`), for code that reads `process.env`
 * (an in-process daemon, a command action).
 */
export class RegisteredProjectFixture {
	readonly root: string;
	readonly xdgConfigHome: string;
	readonly registryDir: string;
	private readonly previousXdg: string | undefined;
	private readonly previousProject: string | undefined;
	private installed = false;

	constructor() {
		this.root = realpathSync(mkdtempSync(join(tmpdir(), 'flow-registered-')));
		this.xdgConfigHome = join(this.root, 'xdg');
		mkdirSync(this.xdgConfigHome, { recursive: true });
		this.registryDir = defaultRegistryDir({ XDG_CONFIG_HOME: this.xdgConfigHome });
		this.previousXdg = process.env['XDG_CONFIG_HOME'];
		this.previousProject = process.env['FLOW_PROJECT'];
	}

	/** `process.env` with XDG_CONFIG_HOME replaced and FLOW_PROJECT removed (unless given in `extra`). */
	env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
		const base: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: this.xdgConfigHome };
		delete base['FLOW_PROJECT'];
		return { ...base, ...extra };
	}

	/** Creates a folder under the fixture root and returns its path. */
	makeFolder(name: string): string {
		const folder = join(this.root, name);
		mkdirSync(folder, { recursive: true });
		return folder;
	}

	/** Registers a project (a new folder named like the project unless `folder` is given); `folder: null` makes it virtual. */
	async register(
		name: string,
		options: { folder?: string | null; aliases?: string[] } = {}
	): Promise<Project & { folder?: string }> {
		const folder = options.folder === null ? undefined : (options.folder ?? this.makeFolder(name));
		const project = await addProject(this.registryDir, {
			name,
			...(folder === undefined ? {} : { path: folder }),
			...(options.aliases === undefined ? {} : { aliases: options.aliases }),
		});
		return { ...project, ...(folder === undefined ? {} : { folder }) };
	}

	/** Points this process at the fixture registry until `dispose()`. */
	useAsProcessEnv(): this {
		process.env['XDG_CONFIG_HOME'] = this.xdgConfigHome;
		delete process.env['FLOW_PROJECT'];
		this.installed = true;
		return this;
	}

	dispose(): void {
		if (this.installed) {
			restore('XDG_CONFIG_HOME', this.previousXdg);
			restore('FLOW_PROJECT', this.previousProject);
			this.installed = false;
		}
		rmSync(this.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
	}
}

function restore(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
	} else {
		process.env[name] = value;
	}
}
