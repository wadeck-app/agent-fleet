#!/usr/bin/env node

/**
 * GATED live probe for GATE G1 (plan, section 5): does a per-sandbox bridge token survive the sbx proxy placeholder
 * mechanism on a WebSocket upgrade from the VM to a host listener? Never part of `npm test`, `npm run check` or CI.
 *
 * It creates ONE sandbox `flow-sbx-g1-<hex>` (image flow-sandbox:m2 by default), allows `localhost:<port>` for it,
 * stores a custom secret for host `localhost` (placeholder -> real token read from a private file by `cat`), and
 * starts a WebSocket server on 127.0.0.1. From the VM it connects through `host.docker.internal:<port>` four times
 * with the PLACEHOLDER in (a) the query string, (b) a request header, (c) the first message, (d) the `Sec-WebSocket-Protocol`
 * subprotocol header. The host records what it actually received and compares it with the real token.
 * Everything is removed in a `finally`.
 *
 * Usage (repository root): SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/BridgeTokenProbe.mjs
 * Env: SBX_LIVE=1 (required), G1_IMAGE (default flow-sandbox:m2), G1_OUTPUT (JSON evidence file, optional).
 * Exit code: 0 probe ran (read the verdict lines, a failing channel is a RESULT, not an error), 1 error, 2 refused.
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';

import { PrivateSecretFile } from '../../src/PrivateSecretFile.ts';
import { SbxCliRuntime } from '../../src/SbxCliRuntime.ts';

if (process.env.SBX_LIVE !== '1') {
	console.error('BridgeTokenProbe refused to run: set SBX_LIVE=1 to confirm that you want to create a real sandbox.');
	process.exit(2);
}
if (process.env.SBX_MOCK_PATH) {
	console.error('BridgeTokenProbe refused to run: SBX_MOCK_PATH is set, the result would not be live.');
	process.exit(2);
}

const suffix = randomBytes(3).toString('hex');
const sandbox = `flow-sbx-g1-${suffix}`;
const image = process.env.G1_IMAGE ?? 'flow-sandbox:m2';
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `flow-g1-${suffix}-`)));
const workspace = path.join(root, 'ws');
const meta = path.join(root, 'ws.meta');
const secretsDirectory = path.join(root, 'secrets');
for (const directory of [workspace, meta, secretsDirectory]) fs.mkdirSync(directory);

const realToken = randomBytes(24).toString('hex');
const placeholder = `flow-ph-${randomBytes(16).toString('hex')}`;
// The harness stores TWO custom secrets for host `localhost` (credential endpoint first, bridge token second).
const credentialToken = randomBytes(24).toString('hex');
const credentialPlaceholder = `flow-ph-${randomBytes(16).toString('hex')}`;
const runtime = new SbxCliRuntime();
const received = [];

const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
await new Promise(resolve => server.once('listening', resolve));
const port = server.address().port;
server.on('connection', (socket, request) => {
	const record = {
		channel: undefined,
		url: request.url,
		headerToken: request.headers['x-flow-bridge-token'],
		authorization: request.headers['authorization'],
		subprotocol: request.headers['sec-websocket-protocol'],
		firstMessage: undefined,
	};
	received.push(record);
	socket.on('message', data => {
		record.firstMessage ??= data.toString();
		socket.send('ack');
	});
});

const probeScript = `
const [url, mode, placeholder] = process.argv.slice(2);
const outcome = (value) => { console.log(JSON.stringify({ mode, ...value })); process.exit(0); };
setTimeout(() => outcome({ result: 'timeout' }), 15000);
let socket;
try {
  if (mode === 'query') socket = new WebSocket(url + '/?token=' + placeholder);
  else if (mode === 'header') socket = new WebSocket(url + '/', { headers: { 'x-flow-bridge-token': placeholder } });
  else if (mode === 'subprotocol') socket = new WebSocket(url + '/', [placeholder]);
  else socket = new WebSocket(url + '/');
} catch (error) { outcome({ result: 'constructor-error', message: String(error) }); }
socket.addEventListener('open', () => { socket.send(mode === 'message' ? 'token=' + placeholder : 'hello'); });
socket.addEventListener('message', (event) => outcome({ result: 'open-and-ack', data: String(event.data) }));
socket.addEventListener('error', (event) => outcome({ result: 'error', message: String(event.message ?? event.type) }));
socket.addEventListener('close', (event) => outcome({ result: 'closed', code: event.code, reason: event.reason }));
`;

const evidence = { sandbox, image, port, channels: {} };
let created = false;
try {
	console.log(`creating ${sandbox} from ${image}`);
	await runtime.create({
		name: sandbox,
		agent: 'claude',
		mounts: [{ hostPath: workspace }, { hostPath: meta }],
		cpus: 2,
		memory: '2g',
		image,
		pull: 'never',
	});
	created = true;
	await runtime.allowNetwork({ sandbox, resources: [`localhost:${port}`] });
	const credentialFile = PrivateSecretFile.create(secretsDirectory, credentialToken);
	await runtime.setSecret({
		sandbox,
		hosts: ['localhost'],
		envVar: 'FLOW_CREDENTIAL_TOKEN',
		placeholder: credentialPlaceholder,
		valueCommand: credentialFile.valueCommand(),
	});
	const secretFile = PrivateSecretFile.create(secretsDirectory, realToken);
	await runtime.setSecret({
		sandbox,
		hosts: ['localhost'],
		envVar: 'FLOW_BRIDGE_TOKEN',
		placeholder,
		valueCommand: secretFile.valueCommand(),
	});

	// G1_MODES selects and orders the channels (default: all). `shim` runs the real /opt/flow/inner-bridge.cjs (the `ws` library) against this server.
	const modes = (process.env.G1_MODES ?? 'query,header,headerCredential,message,subprotocol').split(',');
	if (process.env.G1_DELAY_MS) await new Promise(resolve => setTimeout(resolve, Number(process.env.G1_DELAY_MS)));
	for (const mode of modes) {
		if (mode === 'rawtcp') {
			// Clients that ignore the proxy variables: does the sandbox policy still apply to them? A host port WITHOUT an allow rule, and the internet.
			const unruled = net.createServer(socket => socket.end('hello'));
			await new Promise(resolve => unruled.listen(0, '127.0.0.1', resolve));
			const unruledPort = unruled.address().port;
			const script = `
const net = require('node:net');
const attempt = (label, host, port) => new Promise(resolve => {
  const socket = net.connect({ host, port, timeout: 6000 });
  socket.on('connect', () => { resolve(label + '=CONNECTED'); socket.destroy(); });
  socket.on('timeout', () => { resolve(label + '=timeout'); socket.destroy(); });
  socket.on('error', error => resolve(label + '=error:' + error.code));
});
(async () => {
  console.log(await attempt('host_port_without_rule', 'host.docker.internal', ${unruledPort}));
  console.log(await attempt('host_port_with_rule', 'host.docker.internal', ${port}));
  console.log(await attempt('internet_1.1.1.1:443', '1.1.1.1', 443));
  console.log(await attempt('internet_example.com:80', 'example.com', 80));
})();
`;
			const raw = await runtime.exec({
				sandbox,
				command: ['node', '-e', script],
				signal: AbortSignal.timeout(60_000),
			});
			unruled.close();
			console.log(`[rawtcp]
${raw.stdout}${raw.stderr}`);
			evidence.rawTcp = raw.stdout;
			continue;
		}
		if (mode === 'bearer') {
			// curl (proxy-aware) with the CREDENTIAL placeholder in an Authorization header while two custom secrets exist,
			// against a plain HTTP server of the host (the credential endpoint is plain HTTP too).
			const seen = [];
			const http = createHttpServer((request, response) => {
				seen.push(request.headers['authorization']);
				response.end('ok');
			});
			await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
			const httpPort = http.address().port;
			await runtime.allowNetwork({ sandbox, resources: [`localhost:${httpPort}`] });
			const curl = await runtime.exec({
				sandbox,
				command: [
					'bash',
					'-c',
					`curl -s -m 10 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${credentialPlaceholder}" http://host.docker.internal:${httpPort}/ || true`,
				],
				signal: AbortSignal.timeout(30_000),
			});
			http.close();
			const authorization = seen[0];
			const expected = `Bearer ${credentialToken}`;
			const verdict =
				authorization === expected
					? 'SWAPPED to the real credential secret'
					: authorization === `Bearer ${credentialPlaceholder}`
						? 'NOT SWAPPED (placeholder text)'
						: `OTHER (length ${authorization?.length ?? 'n/a'}, expected ${expected.length})`;
			console.log(`[bearer] ${verdict}; curl http code ${curl.stdout.trim()}`);
			evidence.channels.bearer = { verdict };
			continue;
		}
		if (mode === 'env') {
			// Names and values of proxy-related variables of the VM (no secret is in them), to explain which clients use the proxy.
			const dump = await runtime.exec({
				sandbox,
				command: ['bash', '-c', 'node -v; env | grep -i -E "proxy|^NODE_" | sort'],
			});
			console.log(`[env]
${dump.stdout}`);
			evidence.vmEnvironment = dump.stdout;
			continue;
		}
		const before = received.length;
		const result = await (mode === 'shim'
			? runtime
					.exec({
						sandbox,
						command: ['node', '/opt/flow/inner-bridge.cjs'],
						env: { FLOW_BRIDGE_URL: `ws://host.docker.internal:${port}/`, FLOW_BRIDGE_TOKEN: placeholder },
						signal: AbortSignal.timeout(8000),
					})
					.catch(() => ({ exitCode: -1, stdout: '{"mode":"shim","result":"aborted after 8 s"}', stderr: '' }))
			: runtime.exec({
					sandbox,
					command: [
						'node',
						'-',
						`ws://host.docker.internal:${port}`,
						mode === 'headerCredential' ? 'header' : mode,
						mode === 'headerCredential' ? credentialPlaceholder : placeholder,
					],
					stdin: probeScript,
					signal: AbortSignal.timeout(60_000),
				}));
		await new Promise(resolve => setTimeout(resolve, 500));
		const seen = received.slice(before);
		const vmSide = result.stdout.trim().split(/\r?\n/).at(-1) ?? '';
		const record = seen[0];
		const expectedToken = mode === 'headerCredential' ? credentialToken : realToken;
		const expectedPlaceholder = mode === 'headerCredential' ? credentialPlaceholder : placeholder;
		const sawReal = value => typeof value === 'string' && value.includes(expectedToken);
		const sawPlaceholder = value => typeof value === 'string' && value.includes(expectedPlaceholder);
		const where = {
			query: record?.url,
			header: record?.headerToken,
			headerCredential: record?.headerToken,
			shim: record?.headerToken,
			message: record?.firstMessage,
			subprotocol: record?.subprotocol,
		}[mode];
		const verdict = !record
			? 'NO CONNECTION REACHED THE HOST'
			: sawReal(where)
				? 'SWAPPED (host received the real token; the placeholder mechanism works on this channel)'
				: sawPlaceholder(where)
					? 'NOT SWAPPED (host received the placeholder text unchanged)'
					: `OTHER (host saw ${JSON.stringify(where)})`;
		const exact = typeof where === 'string' && where === expectedToken;
		evidence.channels[mode] = {
			exitCode: result.exitCode,
			vmSide,
			hostSawConnection: Boolean(record),
			verdict,
			exactMatch: exact,
			receivedLength: typeof where === 'string' ? where.length : null,
			expectedLength: expectedToken.length,
		};
		console.log(
			`[${mode}] ${verdict}; exact match: ${exact}; received length ${typeof where === 'string' ? where.length : 'n/a'}, expected ${expectedToken.length}`
		);
		console.log(`    vm: ${vmSide}`);
		if (result.exitCode !== 0) console.log(`    vm stderr: ${result.stderr.slice(0, 400)}`);
	}
} catch (error) {
	console.error(`BridgeTokenProbe failed: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
} finally {
	server.close();
	if (created) {
		try {
			await runtime.remove(sandbox);
			console.log(`removed ${sandbox}`);
		} catch (error) {
			console.error(
				`could not remove ${sandbox}: ${error instanceof Error ? error.message : String(error)}. Run: sbx rm ${sandbox}`
			);
			process.exitCode = 1;
		}
	}
	fs.rmSync(root, { recursive: true, force: true });
	if (process.env.G1_OUTPUT) fs.writeFileSync(process.env.G1_OUTPUT, JSON.stringify(evidence, null, 2));
}
