/** True when a process with this pid exists (signal 0 checks without sending anything). EPERM = it exists but belongs to another user. */
export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
}
