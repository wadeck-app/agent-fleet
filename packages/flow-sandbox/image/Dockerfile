# Template image for flow sandboxes. Rebuild with: node --import tsx packages/flow-sandbox/image/build-image.mjs
# Why each pin: see packages/flow-sandbox/README.md ("Image").

# Base: docker/sandbox-templates:claude-code-docker, pinned by digest (claude, node, docker CLI, user `agent`).
FROM docker/sandbox-templates:claude-code-docker@sha256:4a94d9144a70df744fd9247e0c365a14cfb97024afab8db7597c8ba3e0637642

# The model CLIs come from the COMMITTED lock (image/package.json + package-lock.json, copied by build-image.mjs into tools/):
# every transitive dependency is pinned with its integrity hash, and `--ignore-scripts` means no dependency runs a lifecycle
# script at build time. opencode-ai needs its own postinstall (it replaces bin/opencode.exe by the binary of the platform
# package), so exactly that one script, from the lock-pinned package, is run by hand.
# codex stays on 0.149.1: 0.164.0 fails `codex exec resume` with CODEX_HOME on the mounted dir ("list_turns is not supported yet").
RUN mkdir -p /home/agent/.local/lib/flow-tools /home/agent/.local/bin
COPY --chown=agent:agent tools/package.json tools/package-lock.json /home/agent/.local/lib/flow-tools/
RUN cd /home/agent/.local/lib/flow-tools \
 && npm ci --ignore-scripts --omit=dev \
 && node node_modules/opencode-ai/postinstall.mjs \
 && ln -sf ../lib/flow-tools/node_modules/.bin/codex /home/agent/.local/bin/codex \
 && ln -sf ../lib/flow-tools/node_modules/.bin/opencode /home/agent/.local/bin/opencode \
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
