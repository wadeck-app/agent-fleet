/**
 * GATED live EXPERIMENT (not a pass/fail check): which raw TCP connections (clients that ignore the proxy variables) leave the VM, with
 * and without a sandbox allow rule. Never part of `npm test`, `npm run check` or CI. Creates ONE sandbox `flow-sbx-live-tcp-<random>`
 * (image from TCP_IMAGE, default flow-sandbox:m6), starts two TCP servers on the host (one on 127.0.0.1, one on 0.0.0.0, both answer a
 * fixed banner and log every connection), and adds ONE sandbox-scoped rule `localhost:<port>` for phase B; the sandbox, the servers and
 * the rule are removed in a `finally`. No machine-wide policy or setting is touched.
 *
 * Phase A (no rule): from the VM, with bash /dev/tcp and with curl --noproxy '*' (and, for comparison, through the proxy variables):
 * a public IP by number (1.1.1.1:443), the host loopback server through host.docker.internal, the host LAN address.
 * Phase B (rule localhost:<loopback port>): the same probes again. The verdict per probe is taken on the HOST: the server logged the
 * connection or it did not (a "connected" in the VM alone is not trusted).
 *
 * Usage: SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/RawTcpLiveCheck.mjs
 * Output: JSON on stdout and in .claude/temp/sbx-0-51/rawtcp-results.json.
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { SbxCliRuntime } from '../../src/SbxCliRuntime.ts';

if (process.env.SBX_LIVE !== '1') {
	console.error('RawTcpLiveCheck refused to run: set SBX_LIVE=1 to confirm that you want to create and remove a real sandbox.');
	process.exit(2);
}
if (process.env.SBX_MOCK_PATH) {
	console.error('RawTcpLiveCheck refused to run: SBX_MOCK_PATH is set, the result would not be live.');
	process.exit(2);
}

const suffix = randomBytes(3).toString('hex');
const sandbox = `flow-sbx-live-tcp-${suffix}`;
const image = process.env.TCP_IMAGE ?? 'flow-sandbox:m6';
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `flow-sbx-tcp-${suffix}-`)));
const workspace = path.join(root, 'ws');
fs.mkdirSync(workspace);

const runtime = new SbxCliRuntime();
const report = { sandbox, image, platform: `${process.platform} ${os.release()}`, hostConnections: [], phases: {} };
const servers = [];

/** A server that answers a banner and records who connected. */
async function startServer(label, host) {
	const server = net.createServer(socket => {
		report.hostConnections.push({ server: label, at: new Date().toISOString(), remote: `${socket.remoteAddress}` });
		socket.end(`BANNER-${label}\n`);
	});
	await new Promise(resolve => server.listen(0, host, resolve));
	servers.push(server);
	return server.address().port;
}

function lanAddress() {
	for (const entries of Object.values(os.networkInterfaces())) {
		for (const entry of entries ?? []) if (entry.family === 'IPv4' && !entry.internal) return entry.address;
	}
	return undefined;
}

function probesScript(loopbackPort, anyPort, lan) {
	const lines = [
		'set +e',
		// tcp <label> <host> <port>: the CONNECT alone (status of the handshake, nothing read), then what the server says in 3 s.
		`tcp() { label="$1"; timeout 6 bash -c "exec 3<>/dev/tcp/$2/$3" 2>/tmp/tcp-err.txt; c=$?; banner=$(timeout 6 bash -c "exec 3<>/dev/tcp/$2/$3 && timeout 3 head -c 60 <&3" 2>/dev/null | tr '\n' ' '); echo "[tcp  $label] connect-exit=$c ($(head -c 80 /tmp/tcp-err.txt | tr '\n' ' ')) banner=$banner"; }`,
		// curl without the proxy
		`web() { label="$1"; shift; out=$(timeout 10 curl -sS --noproxy '*' -m 6 "$@" 2>&1); echo "[curl $label] exit=$? out=$(echo "$out" | head -c 120 | tr '\\n' ' ')"; }`,
		'echo "proxy variables: $(env | grep -i "^\\(http\\|https\\)_proxy=" | tr \'\\n\' \' \')"',
		'echo "resolve host.docker.internal: $(getent hosts host.docker.internal | head -1)"',
		'echo "resolve gateway.docker.internal: $(getent hosts gateway.docker.internal | head -1)"',
		'echo "default route: $(ip route 2>&1 | head -3 | tr \'\\n\' \';\')"',
		'tcp public-ip-443 1.1.1.1 443',
		// A documentation address (TEST-NET-1) that no network routes: a handshake that completes here is not a real connection.
		'tcp unroutable-control 192.0.2.1 443',
		'tcp public-ip-53 8.8.8.8 53',
		`tcp host-loopback-via-host.docker.internal host.docker.internal ${loopbackPort}`,
		`tcp host-any-via-host.docker.internal host.docker.internal ${anyPort}`,
		`web host-loopback-curl http://host.docker.internal:${loopbackPort}/`,
		`web public-ip-curl-https https://1.1.1.1/ -o /dev/null -w "http=%{http_code}"`,
		`curl -sS -m 6 -x http://gateway.docker.internal:3128 http://host.docker.internal:${loopbackPort}/ 2>&1 | head -c 120; echo " [via proxy: host loopback, exit=\${PIPESTATUS[0]}]"`,
		`curl -sS -m 6 -x http://gateway.docker.internal:3128 https://example.com/ -o /dev/null -w "http=%{http_code}" 2>&1 | head -c 160; echo " [via proxy: example.com]"`,
	];
	if (lan !== undefined) {
		lines.push(`tcp host-lan-address ${lan} ${anyPort}`);
	} else {
		lines.push('echo "[no LAN address on the host: the host LAN probe is skipped]"');
	}
	return lines.join('\n');
}

try {
	const loopbackPort = await startServer('LOOPBACK', '127.0.0.1');
	const anyPort = await startServer('ANY', '0.0.0.0');
	const lan = lanAddress();
	report.lanAddressPresent = lan !== undefined;
	report.loopbackPort = loopbackPort;
	report.anyPort = anyPort;
	console.log(`sandbox ${sandbox}, image ${image}; host servers on 127.0.0.1:${loopbackPort} and 0.0.0.0:${anyPort}`);
	await runtime.create({ name: sandbox, agent: 'shell', image, pull: 'never', mounts: [{ hostPath: workspace }], cpus: 2, memory: '2g' });

	const run = async phase => {
		const before = report.hostConnections.length;
		const result = await runtime.exec({ sandbox, command: ['bash', '-s'], stdin: probesScript(loopbackPort, anyPort, lan) });
		await new Promise(resolve => setTimeout(resolve, 1000));
		report.phases[phase] = {
			exitCode: result.exitCode,
			output: result.stdout,
			stderr: result.stderr,
			hostSawConnections: report.hostConnections.slice(before),
		};
	};
	await run('A: no allow rule');

	await runtime.allowNetwork({ sandbox, resources: [`localhost:${loopbackPort}`] });
	report.ruleAdded = `localhost:${loopbackPort}`;
	await run('B: rule localhost:<loopback port>');
} catch (error) {
	report.error = error instanceof Error ? error.stack : String(error);
	process.exitCode = 1;
} finally {
	for (const server of servers) server.close();
	try {
		// Removing the sandbox also removes its rules; the explicit removal below is a belt for a half-created state.
		await runtime.remove(sandbox);
		console.log(`cleanup: sandbox ${sandbox} removed`);
	} catch (error) {
		console.error(`CLEANUP FAILED: run "sbx rm --force ${sandbox}" and check "sbx policy ls" by hand: ${error.message}`);
		process.exitCode = 1;
	}
	const output = path.resolve(import.meta.dirname, '..', '..', '..', '..', '.claude', 'temp', 'sbx-0-51');
	fs.mkdirSync(output, { recursive: true });
	fs.writeFileSync(path.join(output, 'rawtcp-results.json'), JSON.stringify(report, null, 2));
	for (const [phase, data] of Object.entries(report.phases)) {
		console.log(`\n===== ${phase}\n${data.output}${data.stderr}\nhost servers saw: ${JSON.stringify(data.hostSawConnections)}`);
	}
	fs.rmSync(root, { recursive: true, force: true });
}
