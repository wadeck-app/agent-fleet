import path from 'node:path';

import { PathTranslator } from '../PathTranslator';
import type { RunMounts } from '../RunMounts';

/**
 * Stand-in for {@link RunMounts} that touches no file system: the two mounts exist only as strings, in the path syntax of the
 * `platform` given (`win32` or `linux`), so the same test runs for both flavours on any host. Provides what the translators use
 * (`translator`, `toSandboxPath`, `contains`); no link check, no `.git` inspection.
 */
export class PureMounts {
	readonly translator: PathTranslator;
	private readonly flavor: path.PlatformPath;

	constructor(
		private readonly roots: { workspaceDir: string; workspaceMetaDir: string },
		platform: NodeJS.Platform
	) {
		this.flavor = platform === 'win32' ? path.win32 : path.posix;
		this.translator = new PathTranslator({ ...roots, platform });
	}

	toSandboxPath(hostPath: string, label: string): string {
		return this.translator.toSandbox(hostPath, label);
	}

	contains(hostPath: string): boolean {
		return Object.values(this.roots).some(root => {
			const relative = this.flavor.relative(root, hostPath);
			return (
				hostPath.startsWith(`${root}${this.flavor.sep}`) ||
				relative === '' ||
				(!relative.startsWith('..') && !this.flavor.isAbsolute(relative))
			);
		});
	}

	metaMount(): { hostPath: string } {
		return { hostPath: this.roots.workspaceMetaDir };
	}

	/** For code that is typed against the real class. */
	asRunMounts(): RunMounts {
		return this as unknown as RunMounts;
	}
}
