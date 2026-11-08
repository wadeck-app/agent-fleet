/**
 * Drops the notice `sbx exec` prints on STDERR when it had to start a stopped sandbox (fixture `exec-after-stop`):
 * `  ✓ sandbox <name> — started`. It comes before the output of the command, so a step would otherwise find a line it
 * never wrote in its stderr.
 *
 * Only that exact line, for that sandbox, at the very beginning of the stream is removed. There is no switch in sbx 0.51.0
 * to turn the notice off (`sbx exec --help`, `sbx settings ls`, NO_COLOR and --no-input have no effect). A program that
 * itself prints exactly this line first is indistinguishable from the notice and loses it too.
 */
export class SbxStartNoticeFilter {
	private readonly notice: string;
	private held = '';
	private decided = false;

	constructor(
		sandbox: string,
		private readonly emit: (text: string) => void
	) {
		this.notice = SbxStartNoticeFilter.noticeFor(sandbox);
	}

	static noticeFor(sandbox: string): string {
		return `  ✓ sandbox ${sandbox} — started\n`;
	}

	/** The full stderr of a finished command, without the notice. */
	static strip(sandbox: string, stderr: string): string {
		const notice = SbxStartNoticeFilter.noticeFor(sandbox);
		return stderr.startsWith(notice) ? stderr.slice(notice.length) : stderr;
	}

	push(chunk: string): void {
		if (this.decided) {
			this.emit(chunk);
			return;
		}
		this.held += chunk;
		if (this.held.startsWith(this.notice)) {
			const rest = this.held.slice(this.notice.length);
			this.decided = true;
			this.held = '';
			if (rest !== '') this.emit(rest);
			return;
		}
		// Still a possible beginning of the notice: wait for more.
		if (this.notice.startsWith(this.held)) return;
		this.decided = true;
		const text = this.held;
		this.held = '';
		this.emit(text);
	}

	/** The command ended: whatever was held back is not the notice. */
	finish(): void {
		if (!this.decided && this.held !== '') this.emit(this.held);
		this.decided = true;
		this.held = '';
	}
}
