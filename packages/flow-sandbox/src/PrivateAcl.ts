import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

import { SandboxError } from './SandboxError';

export type AclCommandRunner = (
	command: string,
	args: string[]
) => { status: number | null; stdout: string; stderr: string };

export interface PrivateAclOptions {
	platform?: NodeJS.Platform;
	/** A test seam for the two commands (`whoami`, `icacls`). */
	run?: AclCommandRunner;
	/** Default: the SystemRoot variable, else C:\Windows. */
	systemRoot?: string;
}

const defaultRun: AclCommandRunner = (command, args) => {
	const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
	return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? result.error?.message ?? '' };
};

/**
 * Makes a file or directory THIS PROCESS created readable by the current user only. The 0o600 / 0o700 modes of Node mean nothing on
 * Windows, where the temp folder is readable by SYSTEM and the administrators too and the entries come from the parent (inheritance).
 * Here, on Windows, the inherited entries are removed and the current user (by SID) gets full control; for a directory the grant is
 * inherited by what is created in it afterwards. Elsewhere it does nothing, the modes apply.
 *
 * Call it on a directory right after creating it, before anything secret is written in it, and on the file itself. Never call it on
 * something this process did not create. It fails loudly (a SandboxError with the command output): a secret file whose ACL could not be
 * set is not written.
 */
export class PrivateAcl {
	static restrictToCurrentUser(target: string, kind: 'file' | 'directory', options: PrivateAclOptions = {}): void {
		if ((options.platform ?? process.platform) !== 'win32') return;
		const run = options.run ?? defaultRun;
		// The Windows programs by absolute path: in Git Bash the name `whoami` finds the GNU one, which does not understand /user.
		const system32 = path.win32.join(options.systemRoot ?? process.env['SystemRoot'] ?? 'C:\\Windows', 'System32');
		const whoami = path.win32.join(system32, 'whoami.exe');
		const icacls = path.win32.join(system32, 'icacls.exe');
		const grant =
			kind === 'directory'
				? `*${PrivateAcl.currentUserSid(run, whoami)}:(OI)(CI)F`
				: `*${PrivateAcl.currentUserSid(run, whoami)}:F`;
		const result = run(icacls, [target, '/inheritance:r', '/grant:r', grant]);
		if (result.status !== 0) {
			throw new SandboxError(
				'command-failed',
				`Cannot restrict ${target} to the current user (icacls exited with ${String(result.status)}: ${(result.stderr || result.stdout).trim() || 'no output'}). ` +
					'The secret was not written. Check that icacls.exe is available and that the temporary directory is on an NTFS volume you own (TEMP/TMP), then retry.'
			);
		}
	}

	private static currentUserSid(run: AclCommandRunner, whoami: string): string {
		const result = run(whoami, ['/user', '/fo', 'csv', '/nh']);
		const sid = /"(S-1-[0-9-]+)"/.exec(result.stdout)?.[1];
		if (result.status !== 0 || sid === undefined) {
			throw new SandboxError(
				'command-failed',
				`Cannot read the SID of the current user (whoami exited with ${String(result.status)}: ${(result.stderr || result.stdout).trim() || 'no output'}), so the private file cannot be restricted to you. Run "whoami /user" in the same terminal to see why.`
			);
		}
		return sid;
	}
}
