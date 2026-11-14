# Template image for flow sandboxes. Rebuild with: node --import tsx packages/flow-sandbox/image/build-image.mjs
# Why each pin: see packages/flow-sandbox/README.md ("Image").

# Base: docker/sandbox-templates:claude-code-docker, pinned by digest (claude, node, docker CLI, user `agent`).
FROM docker/sandbox-templates:claude-code-docker@sha256:4a94d9144a70df744fd9247e0c365a14cfb97024afab8db7597c8ba3e0637642

# Node 24: the project declares engines node >= 24, the base ships the distribution's Node 22 (apt package `nodejs`, Ubuntu 26.04).
# The official tarball, version and sha256 pinned here (sha256 from https://nodejs.org/dist/v24.22.3/SHASUMS256.txt, fetched over TLS on
# 2026-11-14; the signed SHASUMS256.txt.sig was NOT checked), verified before it is unpacked. It goes to /usr/local, which comes before /usr/bin
# in PATH, so `node`, `npm` and `npx` resolve to it; the distribution package stays (other packages depend on it) and is shadowed.
# claude is a native binary under ~/.local and does not use Node; codex and opencode are installed below, after this layer.
ARG NODE_VERSION=24.22.3
ARG NODE_SHA256=061ec3e3062115705b56b51fa9cc330ab50d34b6969387d4e4b1a50c6809acc2
USER root
RUN curl -fsSLo /tmp/node.tar.gz https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz \
 && echo "${NODE_SHA256}  /tmp/node.tar.gz" | sha256sum -c - \
 && tar -xzf /tmp/node.tar.gz -C /usr/local --strip-components=1 --no-same-owner --exclude=CHANGELOG.md --exclude=LICENSE --exclude=README.md \
 && rm -f /tmp/node.tar.gz \
 && test "$(node --version)" = "v${NODE_VERSION}"
USER agent

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
