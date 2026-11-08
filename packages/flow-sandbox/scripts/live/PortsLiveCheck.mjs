/**
 * GATED live EXPERIMENT (not a pass/fail check): is a port a step opens inside the VM reachable from outside it? It backs (or not) the
 * guarantee `ports=private`. Never part of `npm test`, `npm run check` or CI. Creates TWO sandboxes `flow-sbx-live-ports-<random>-a|b`
 * (image from PORTS_IMAGE, default flow-sandbox:m6), removed in a `finally`. No setting, policy or rule is touched.
 *
 * In sandbox A a listener answers a banner on 0.0.0.0:8099 (and on its loopback). Then:
 *   - from A itself (control: the listener works),
 *   - from sandbox B (another VM) to A's address(es),
 *   - from the HOST to A's address(es) and to 127.0.0.1:8099 / localhost:8099.
 * Every attempt is reported; the verdict is "reachable from outside" if B or the host got the banner.
 * The handshake alone proves nothing on this platform (an egress gateway completes any TCP handshake), so only the banner counts.
 *
 * Usage: SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/PortsLiveCheck.mjs
 * Output: JSON in .claude/temp/sbx-0-51/ports-results.json.
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { SbxCliRuntime } from '../../src/SbxCliRuntime.ts';

if (process.env.SBX_LIVE !== '1') {
	console.error(
		'PortsLiveCheck refused to run: set SBX_LIVE=1 to confirm that you want to create and remove real sandboxes.'
	);
	process.exit(2);
}
if (process.env.SBX_MOCK_PATH) {
	console.error('PortsLiveCheck refused to run: SBX_MOCK_PATH is set, the result would not be live.');
	process.exit(2);
}

const suffix = randomBytes(3).toString('hex');
const names = { a: `flow-sbx-live-ports-${suffix}-a`, b: `flow-sbx-live-ports-${suffix}-b` };
const image = process.env.PORTS_IMAGE ?? 'flow-sandbox:m6';
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `flow-sbx-ports-${suffix}-`)));
const runtime = new SbxCliRuntime();
const report = { image, platform: `${process.platform} ${os.release()}`, attempts: [] };
const BANNER = 'PRIVATE-PORT-BANNER';

function hostProbe(host, port) {
	return new Promise(resolve => {
		const socket = net.connect({ host, port, timeout: 4000 });
		let data = '';
		socket.on('data', chunk => (data += chunk.toString()));
		socket.on('error', error => resolve({ connected: false, error: error.code ?? error.message }));
		socket.on('timeout', () => {
			socket.destroy();
			resolve({ connected: data !== '', banner: data.trim(), note: 'timeout' });
		});
		socket.on('close', () => resolve({ connected: true, banner: data.trim() }));
	});
}

try {
	for (const key of ['a', 'b']) {
		const workspace = path.join(root, key);
		fs.mkdirSync(workspace);
		await runtime.create({
			name: names[key],
			agent: 'shell',
			image,
			pull: 'never',
			mounts: [{ hostPath: workspace }],
			cpus: 2,
			memory: '2g',
		});
	}
	// The listener, in the background, in A. python3 is in the image; nothing is installed.
	const started = await runtime.exec({
		sandbox: names.a,
		command: [
			'bash',
			'-c',
			`nohup python3 -c "import socket; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(('0.0.0.0', 8099)); s.listen(5)
while True:
    c,_=s.accept(); c.sendall(b'${BANNER}\\n'); c.close()" >/tmp/listener.log 2>&1 & sleep 1; ss -ltn 2>/dev/null | grep 8099 || true`,
		],
	});
	report.listener = started.stdout.trim();
	// The address(es) of A on ITS network interface (eth0), read from /proc: there is no `ip` in the image. hostname -I would list the
	// bridge of the VM's own docker (which another VM does not reach: it would be that VM's own bridge).
	const proc = await runtime.exec({
		sandbox: names.a,
		command: [
			'bash',
			'-c',
			"awk '/\\|--/ {ip=$2} /\\/32 host LOCAL/ {print ip}' /proc/net/fib_trie | sort -u; echo ===; cat /proc/net/if_inet6",
		],
	});
	const [v4Text = '', v6Text = ''] = proc.stdout.split('===');
	const ipv4 = v4Text
		.split('\n')
		.map(line => line.trim())
		.filter(ip => /^\d+\.\d+\.\d+\.\d+$/.test(ip) && !ip.startsWith('127.') && !ip.endsWith('.255'));
	const ipv6 = v6Text
		.split('\n')
		.map(line => line.trim().split(/\s+/))
		.filter(parts => parts[5] === 'eth0' && !(parts[0] ?? '').startsWith('fe80'))
		.map(parts => (parts[0] ?? '').match(/.{4}/g)?.join(':') ?? '');
	const addresses = [...ipv4, ...ipv6].filter(Boolean);
	report.addressesOfA = addresses;
	const probeInVm = async (sandbox, host) => {
		const result = await runtime.exec({
			sandbox,
			command: [
				'bash',
				'-c',
				`timeout 6 bash -c 'exec 3<>/dev/tcp/${host}/8099 && timeout 3 head -c 60 <&3' 2>&1; echo "[exit $?]"`,
			],
		});
		return result.stdout.replace(/\n/g, ' ').trim();
	};
	const attempt = async (from, to, action) => {
		const outcome = await action();
		const text = typeof outcome === 'string' ? outcome : JSON.stringify(outcome);
		const gotBanner = text.includes(BANNER);
		report.attempts.push({ from, to, gotBanner, detail: text });
		console.log(`${gotBanner ? 'REACHED ' : 'blocked '} ${from} -> ${to}: ${text.slice(0, 120)}`);
	};
	await attempt('A (control)', '127.0.0.1:8099', () => probeInVm(names.a, '127.0.0.1'));
	for (const address of addresses) {
		await attempt('B (other VM)', `${address}:8099`, () => probeInVm(names.b, address));
		await attempt('host', `${address}:8099`, () => hostProbe(address, 8099));
	}
	await attempt('host', '127.0.0.1:8099', () => hostProbe('127.0.0.1', 8099));
	await attempt('B (other VM)', 'host.docker.internal:8099', () => probeInVm(names.b, 'host.docker.internal'));
	report.reachedFromOutside = report.attempts
		.filter(item => item.gotBanner && item.from !== 'A (control)')
		.map(item => `${item.from} -> ${item.to}`);
	report.controlWorks = report.attempts[0]?.gotBanner === true;
	report.verdict = !report.controlWorks
		? 'INCONCLUSIVE: the listener did not answer inside its own VM'
		: report.reachedFromOutside.length === 0
			? 'private: nothing outside the VM got the banner (this machine, this run)'
			: `NOT private: ${report.reachedFromOutside.join(', ')}`;
	console.log(report.verdict);
} catch (error) {
	report.error = error instanceof Error ? error.stack : String(error);
	process.exitCode = 1;
} finally {
	for (const name of Object.values(names)) {
		try {
			await runtime.remove(name);
		} catch (error) {
			if (error?.kind !== 'not-found')
				console.error(`CLEANUP FAILED: run "sbx rm --force ${name}" by hand: ${error.message}`);
		}
	}
	const output = path.resolve(import.meta.dirname, '..', '..', '..', '..', '.claude', 'temp', 'sbx-0-51');
	fs.mkdirSync(output, { recursive: true });
	fs.writeFileSync(path.join(output, 'ports-results.json'), JSON.stringify(report, null, 2));
	try {
		fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
	} catch (error) {
		console.error(`The temporary tree ${root} could not be removed (${error.code}): remove it by hand.`);
	}
}
