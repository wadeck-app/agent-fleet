import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** Decides whether the daemon may read the flow file a client asked it to run. */
export class FlowFileAccessGuard {
	constructor(private readonly allowAbsolutePaths: boolean) {}

	/** The absolute path of the requested flow file, relative paths being resolved against the client's cwd. */
	resolve(flowFile: string, cwd: string): string {
		return path.isAbsolute(flowFile) ? flowFile : path.resolve(cwd, flowFile);
	}

	/** Whether the flow file lies under the client's cwd or the user's home (symlinks resolved), unless any path is allowed. */
	isAllowed(flowFile: string, cwd: string): boolean {
		if (this.allowAbsolutePaths) {
			return true;
		}
		// violations-suppress: shared/no-out-of-repo-path homedir is deliberately an allowed root for the flow-file path restriction, so flows under the user's home are runnable
		const allowedRoots = [path.resolve(cwd), path.resolve(os.homedir())];
		let realFlowFile: string;
		try {
			realFlowFile = fs.existsSync(flowFile) ? fs.realpathSync(flowFile) : flowFile;
		} catch {
			realFlowFile = flowFile;
		}
		return allowedRoots.some(root => {
			let realRoot: string;
			try {
				realRoot = fs.realpathSync(root);
			} catch {
				realRoot = root;
			}
			const rel = path.relative(realRoot, realFlowFile);
			return !rel.startsWith('..') && !path.isAbsolute(rel);
		});
	}
}
