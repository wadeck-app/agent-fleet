import { type PortFileData, isFresh, readPortFile } from '@wadeck-app/singleton-daemon-kit';
import * as net from 'node:net';

const CONNECT_TIMEOUT_MS = 500;

function isPortOpen(port: number): Promise<boolean> {
	return new Promise(resolve => {
		const socket = new net.Socket();
		socket.setTimeout(CONNECT_TIMEOUT_MS);
		socket.once('connect', () => {
			socket.destroy();
			resolve(true);
		});
		socket.once('error', () => resolve(false));
		socket.once('timeout', () => {
			socket.destroy();
			resolve(false);
		});
		socket.connect(port, '127.0.0.1');
	});
}

/**
 * The daemon that currently owns `daemonDir`, or null when there is none.
 *
 * "Owns" means it published a fresh port file (the kit's heartbeat keeps it fresh) AND still answers on that port.
 * The pid alone is not trusted: on Windows a daemon started through VBScript is reported dead by process checks.
 */
export async function findLiveDaemon(daemonDir: string): Promise<Pick<PortFileData, 'pid' | 'port'> | null> {
	const data = await readPortFile(daemonDir);
	if (data === null || !(await isFresh(daemonDir)) || !(await isPortOpen(data.port))) {
		return null;
	}
	return { pid: data.pid, port: data.port };
}
