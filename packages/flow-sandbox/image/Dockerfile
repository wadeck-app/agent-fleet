# Template image for flow sandboxes. Rebuild with: node --import tsx packages/flow-sandbox/image/build-image.mjs
# Why each pin: see packages/flow-sandbox/README.md ("Image").

# Base: docker/sandbox-templates:claude-code-docker, pinned by digest (claude, node, docker CLI, user `agent`).
FROM docker/sandbox-templates:claude-code-docker@sha256:4a94d9144a70df744fd9247e0c365a14cfb97024afab8db7597c8ba3e0637642

# codex stays on 0.149.1: 0.164.0 fails `codex exec resume` with CODEX_HOME on the mounted dir ("list_turns is not supported yet").
RUN npm install -g --prefix /home/agent/.local @openai/codex@0.149.1 opencode-ai@1.19.4 \
 && npm cache clean --force

# From flow-sandbox:m7 the exec variant also needs mcp-callback-forwarder.cjs (image/mcp-callback-forwarder.cjs, copied into
# the context by build-image.mjs): it relays the engine's MCP callback from the VM to the host and loads mcp-server.cjs unmodified.
# The flow worker bundle (worker.cjs, the forked-worker entry), its MCP server and the harness shim (inner-bridge.cjs).
# Build them first: node --import tsx packages/flow-sandbox/scripts/BuildInnerBundles.mjs (needed from tag flow-sandbox:m4).
# --chmod=0644 also applies to the /opt/flow directory COPY creates (verified: drw-r--r--, unreadable by `agent`), so it is fixed right after.
USER root
COPY --chmod=0644 opt-flow/mcp-server.cjs opt-flow/worker.cjs opt-flow/inner-bridge.cjs opt-flow/mcp-callback-forwarder.cjs /opt/flow/
RUN chmod 0755 /opt/flow
USER agent
