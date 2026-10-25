import { spawnSync } from 'node:child_process';

/** One process of the machine, as the operating system reports it. */
export interface OsProcess {
	pid: number;
	ppid: number;
	commandLine: string;
	/** When it started, if the OS said. */
	startedAt?: Date;
}

const MAX_BUFFER = 128 * 1024 * 1024;

function fail(tool: string, status: number | null, detail: string): never {
	throw new Error(
		`Could not list the machine's processes with ${tool} (status ${String(status)}): ${detail}. ` +
			'Nothing was changed; the process list is only read.'
	);
}

interface WindowsProcessRow {
	ProcessId: number;
	ParentProcessId: number;
	CommandLine: string | null;
	StartedMs: number | null;
}

function asArray<T>(parsed: T | T[]): T[] {
	return Array.isArray(parsed) ? parsed : [parsed];
}

/** `ps` prints elapsed time as [[dd-]hh:]mm:ss. */
export function parseElapsed(etime: string): number | undefined {
	const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(etime.trim());
	if (match === null) {
		return undefined;
	}
	const [, days, hours, minutes, seconds] = match;
	return ((Number(days ?? 0) * 24 + Number(hours ?? 0)) * 60 + Number(minutes)) * 60 + Number(seconds);
}

/**
 * Every process of the machine with its parent, command line and start time. Read-only.
 *
 * @throws naming the tool when the listing fails: an empty list would read as "no leaks".
 */
export function listOsProcesses(now: Date = new Date()): OsProcess[] {
	if (process.platform === 'win32') {
		const result = spawnSync(
			'powershell',
			[
				'-NoProfile',
				'-NonInteractive',
				'-Command',
				'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine,@{n="StartedMs";e={if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { $null }}} | ConvertTo-Json -Compress',
			],
			{ encoding: 'utf8', windowsHide: true, maxBuffer: MAX_BUFFER, timeout: 60_000 }
		);
		if (result.error || result.status !== 0) {
			fail('PowerShell', result.status, result.error?.message ?? result.stderr);
		}
		return asArray(JSON.parse(result.stdout) as WindowsProcessRow | WindowsProcessRow[]).map(row => ({
			pid: row.ProcessId,
			ppid: row.ParentProcessId,
			commandLine: row.CommandLine ?? '',
			...(row.StartedMs === null ? {} : { startedAt: new Date(row.StartedMs) }),
		}));
	}
	// violations-suppress: cli/no-spawn-without-windows-hide this is the non-Windows branch (win32 uses PowerShell above), where windowsHide has no effect
	const result = spawnSync('ps', ['-eo', 'pid=,ppid=,etime=,args='], { encoding: 'utf8', maxBuffer: MAX_BUFFER });
	if (result.error || result.status !== 0) {
		fail('ps', result.status, result.error?.message ?? result.stderr);
	}
	const rows: OsProcess[] = [];
	for (const line of result.stdout.split('\n')) {
		const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
		if (match === null) {
			continue;
		}
		const elapsedSeconds = parseElapsed(match[3] ?? '');
		rows.push({
			pid: Number(match[1]),
			ppid: Number(match[2]),
			commandLine: match[4] ?? '',
			...(elapsedSeconds === undefined ? {} : { startedAt: new Date(now.getTime() - elapsedSeconds * 1000) }),
		});
	}
	return rows;
}

/**
 * TCP ports each process listens on, by pid. Read-only.
 *
 * @returns undefined when the OS tool is unavailable (no `lsof` on a minimal Linux): the caller says the ports are unknown
 *   instead of claiming there are none.
 */
export function listListeningPorts(): Map<number, number[]> | undefined {
	const ports = new Map<number, number[]>();
	const add = (pid: number, port: number): void => {
		ports.set(
			pid,
			[...(ports.get(pid) ?? []), port].sort((a, b) => a - b)
		);
	};
	if (process.platform === 'win32') {
		const result = spawnSync(
			'powershell',
			[
				'-NoProfile',
				'-NonInteractive',
				'-Command',
				'Get-NetTCPConnection -State Listen | Select-Object OwningProcess,LocalPort | ConvertTo-Json -Compress',
			],
			{ encoding: 'utf8', windowsHide: true, maxBuffer: MAX_BUFFER, timeout: 60_000 }
		);
		if (result.error || result.status !== 0) {
			return undefined;
		}
		const text = result.stdout.trim();
		if (text === '') {
			return ports;
		}
		for (const row of asArray(JSON.parse(text) as { OwningProcess: number; LocalPort: number }[])) {
			add(row.OwningProcess, row.LocalPort);
		}
		return ports;
	}
	// violations-suppress: cli/no-spawn-without-windows-hide this is the non-Windows branch (win32 uses PowerShell above), where windowsHide has no effect
	const result = spawnSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'], {
		encoding: 'utf8',
		maxBuffer: MAX_BUFFER,
	});
	// lsof exits 1 when nothing matches; only a failure to run it means "unknown".
	if (result.error) {
		return undefined;
	}
	let pid: number | undefined;
	for (const line of result.stdout.split('\n')) {
		if (line.startsWith('p')) {
			pid = Number(line.slice(1));
		} else if (line.startsWith('n') && pid !== undefined) {
			const port = /:(\d+)$/.exec(line);
			if (port !== null) {
				add(pid, Number(port[1]));
			}
		}
	}
	return ports;
}
