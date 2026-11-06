import { describeError } from '../ErrorText';
import type { SandboxLog } from '../SandboxLog';
import { DaemonFrameFit } from './DaemonFrameFit';
import type { JsonObject } from './HarnessMessages';

const NO_DECLARED_OUTPUTS: ReadonlySet<string> = new Set();

/** What a wrapper sends to the daemon: every message is fitted to the frame limit, a failed send is logged, never thrown. */
export class DaemonReporter {
	constructor(
		private readonly daemon: { send(message: JsonObject): void },
		private readonly log: SandboxLog
	) {}

	/** Returns false (after logging why) when the message could not be sent. */
	send(message: JsonObject, declared: ReadonlySet<string> = NO_DECLARED_OUTPUTS): boolean {
		try {
			this.daemon.send(DaemonFrameFit.fit(message, declared));
			return true;
		} catch (error) {
			this.log.warn(`could not send "${String(message['type'])}" to the daemon: ${describeError(error)}`);
			return false;
		}
	}
}
