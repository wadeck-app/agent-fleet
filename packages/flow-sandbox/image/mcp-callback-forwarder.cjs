'use strict';
/**
 * VM-side wrapper of the engine's MCP server for the exec variant (milestone M7). Installed as
 * /opt/flow/mcp-callback-forwarder.cjs next to the UNMODIFIED mcp-server.cjs of flow-cli.
 *
 * mcp-server.cjs reports `provideSteps` calls to a callback server at 127.0.0.1:FLOW_MCP_CALLBACK_PORT. In the exec
 * variant that server runs on the HOST (the engine runs there), which the VM reaches as host.docker.internal. This file:
 *  1. listens on a VM-local loopback port chosen by the OS,
 *  2. relays every connection byte for byte to FLOW_MCP_UPSTREAM_HOST:FLOW_MCP_UPSTREAM_PORT,
 *  3. points FLOW_MCP_CALLBACK_PORT at the local port and loads mcp-server.cjs (stdio JSON-RPC, as before).
 * The token and the execution id stay in the environment of the MCP process, exactly as without the relay; the host
 * callback server still checks both.
 */
const net = require('node:net');
const path = require('node:path');

const upstreamHost = process.env.FLOW_MCP_UPSTREAM_HOST;
const upstreamPort = Number(process.env.FLOW_MCP_UPSTREAM_PORT);

function fail(message) {
	process.stderr.write(`[mcp-callback-forwarder] ${message}\n`);
	process.exit(1);
}

if (!upstreamHost || !/^[A-Za-z0-9.-]+$/.test(upstreamHost)) {
	fail(`FLOW_MCP_UPSTREAM_HOST is missing or invalid (${JSON.stringify(upstreamHost)}); the engine's MCP config rewriter sets it.`);
}
if (!Number.isInteger(upstreamPort) || upstreamPort < 1 || upstreamPort > 65535) {
	fail(`FLOW_MCP_UPSTREAM_PORT is missing or invalid (${JSON.stringify(process.env.FLOW_MCP_UPSTREAM_PORT)}).`);
}

const server = net.createServer(client => {
	const upstream = net.connect(upstreamPort, upstreamHost);
	const close = () => {
		client.destroy();
		upstream.destroy();
	};
	upstream.on('error', error => {
		process.stderr.write(`[mcp-callback-forwarder] cannot reach ${upstreamHost}:${upstreamPort}: ${error.message}\n`);
		close();
	});
	client.on('error', close);
	client.pipe(upstream);
	upstream.pipe(client);
});

server.on('error', error => fail(`cannot listen on a loopback port: ${error.message}`));
server.listen(0, '127.0.0.1', () => {
	process.env.FLOW_MCP_CALLBACK_PORT = String(server.address().port);
	delete process.env.FLOW_MCP_UPSTREAM_HOST;
	delete process.env.FLOW_MCP_UPSTREAM_PORT;
	require(path.join(__dirname, 'mcp-server.cjs'));
});
