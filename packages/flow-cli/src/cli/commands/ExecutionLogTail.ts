import * as fs from 'node:fs';

interface LogLine {
	prefix: string;
	timestamp: string;
	level: string;
	message: string;
}

// TODO(Option B): replace file-tail with WebSocket Channel 3 (CLI->Daemon) for real-time
// streaming without polling delay. See docs/architecture.md for Channel 3 spec.
export function tailLogFile(
	logFile: string,
	executionId: string,
	lastByte: number,
	onLog: (stepId: string, message: string) => void
): number {
	if (!fs.existsSync(logFile)) {
		return lastByte;
	}

	const stat = fs.statSync(logFile);
	if (stat.size <= lastByte) {
		return lastByte;
	}

	const buf = Buffer.alloc(stat.size - lastByte);
	const fd = fs.openSync(logFile, 'r');
	fs.readSync(fd, buf, 0, buf.length, lastByte);
	fs.closeSync(fd);

	const chunk = buf.toString('utf8');
	const lines = chunk.split('\n');

	for (const raw of lines) {
		const trimmed = raw.trim();
		if (!trimmed) {
			continue;
		}
		let line: LogLine;
		try {
			line = JSON.parse(trimmed) as LogLine;
		} catch {
			continue;
		}
		const prefix = `[${executionId}|`;
		if (typeof line.prefix !== 'string' || !line.prefix.startsWith(prefix)) {
			continue;
		}
		const stepId = line.prefix.slice(prefix.length, -1);
		if (stepId === '__execution') {
			continue;
		}
		onLog(stepId, line.message);
	}

	return stat.size;
}
