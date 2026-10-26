import { readPortFile } from '@wadeck-app/singleton-daemon-kit';
import { createRemoteDaemonClient } from 'flow-core';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { describeCliFailure } from './CliFailureText';
import { daemonLogHint, isDaemonUnavailable } from './DaemonContactFailure';

// violations-suppress-end: ts/no-deep-relative

function printNotRunningAndExit(): never {
	process.stdout.write('[fail] daemon not running\n');
	process.exit(2);
}

function failWithCause(what: string, err: unknown): never {
	// violations-suppress: security/no-raw-err-in-cli describeCliFailure prints the message only (stack under FLOW_DEBUG=1), followed by where to look
	process.stderr.write(`[fail] ${what}: ${describeCliFailure(err)}\n${daemonLogHint()}\n`);
	process.exit(1);
}

/**
 * `flow stop`: asks the running daemon to quit.
 *
 * @exits 2 when no daemon is serving (no port file, or one that refuses, resets or hangs up: it is already going).
 * @exits 1 when the daemon fails in another way; the cause is printed.
 */
export async function runStopCommand(daemonDir: string): Promise<void> {
	const portData = await readPortFile(daemonDir);
	const tokenPath = path.join(daemonDir, 'health_token');
	if (!portData || !fs.existsSync(tokenPath)) {
		printNotRunningAndExit();
	}
	const token = fs.readFileSync(tokenPath, 'utf8').trim();
	try {
		await new Promise<void>((resolve, reject) => {
			const req = http.request(
				{
					hostname: '127.0.0.1',
					port: portData.port,
					method: 'POST',
					path: '/quit',
					headers: { Authorization: `Bearer ${token}` },
				},
				res => {
					res.resume();
					res.on('end', resolve);
				}
			);
			req.on('error', reject);
			req.end();
		});
	} catch (err) {
		if (isDaemonUnavailable(err)) {
			printNotRunningAndExit();
		}
		failWithCause('Could not stop the daemon', err);
	}
	process.stdout.write('[ok] daemon stopped\n');
}

/**
 * `flow status`: running state, version and pid.
 *
 * @exits 1 when the daemon fails in a way other than "not serving"; the cause is printed.
 */
export async function runStatusCommand(daemonDir: string, useJson: boolean): Promise<void> {
	const client = createRemoteDaemonClient(daemonDir);

	let running: boolean;
	try {
		running = await client.isRunning();
	} catch (err) {
		if (!isDaemonUnavailable(err)) {
			failWithCause('Could not query the daemon', err);
		}
		running = false;
	}

	if (!running) {
		process.stdout.write(useJson ? JSON.stringify({ running: false }) + '\n' : '[flow] stopped\n');
		return;
	}

	try {
		const info = await client.version();
		process.stdout.write(
			useJson
				? JSON.stringify({ running: true, version: info.version, pid: info.pid }) + '\n'
				: `[flow] running  pid=${info.pid}  version=${info.version}\n`
		);
	} catch (err) {
		// violations-suppress: security/no-raw-err-in-cli describeCliFailure prints the message only (stack under FLOW_DEBUG=1)
		process.stderr.write(`[flow] version query failed: ${describeCliFailure(err)}\n`);
		process.stdout.write(
			useJson
				? JSON.stringify({ running: true, version: null, pid: null }) + '\n'
				: '[flow] running (version query failed)\n'
		);
	}
}

/**
 * `flow --pid`: prints the daemon pid.
 *
 * @exits 2 when no daemon is serving; @exits 1 for any other failure, with the cause.
 */
export async function printDaemonPid(daemonDir: string): Promise<void> {
	try {
		const info = await createRemoteDaemonClient(daemonDir).version();
		process.stdout.write(`pid=${info.pid}\n`);
	} catch (err) {
		if (isDaemonUnavailable(err)) {
			printNotRunningAndExit();
		}
		failWithCause('Could not query the daemon', err);
	}
}
