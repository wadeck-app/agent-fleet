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

# From flow-sandbox:m9: a headless browser and the agent-browser CLI, so a step can open a page served on localhost, interact and take a screenshot.
# The distribution has no usable browser here (measured on m8, 2026-11-22: `chromium` has no candidate, `chromium-browser` and `firefox` are
# snap stubs), so the browser is Chrome for Testing, the build agent-browser itself downloads (`agent-browser install`). That command resolves
# "latest" through googlechromelabs.github.io (blocked by the sandbox network policy) and downloads without any checksum, so it is not used:
# the zip comes from the versioned storage.googleapis.com URL and is verified against a sha256 pinned here. Google publishes no sha256: this one
# was computed on 2026-11-22 from a download whose md5 equals the x-goog-hash header of the object (xmTYpjL3Of9XM+V8v3+UHw==).
# Chrome's shared libraries come from the distribution (apt), NOT pinned: versions are whatever archive.ubuntu.com serves at build time.
# `unzip` is installed with them (the base has none) and kept; the apt lists are removed. The build fails if `ldd` finds a missing library.
ARG CHROME_VERSION=158.0.8127.36
ARG CHROME_SHA256=dba9cc838e1ce269c33ea68170881127bd15d078fc3ca5891c90802819a4d7c7
USER root
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends \
      unzip fonts-liberation fonts-dejavu-core \
      libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64 libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
      libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2t64 libnss3 libnspr4 libxshmfence1 libx11-xcb1 libxcb1 libdbus-1-3 \
 && rm -rf /var/lib/apt/lists/*
USER agent

# agent-browser 0.41.0 (the version on the developer host) from its own committed lock (image/browser), `--ignore-scripts` like the model CLIs.
# Its postinstall only downloads the native binary when it is missing; the npm package already contains bin/agent-browser-linux-x64, so the
# only thing the script would do here is mark that file executable, done by hand. It is symlinked into ~/.local/bin.
# Chrome goes where `agent-browser install` would put it (~/.agent-browser/browsers/chrome-<version>) and ~/.agent-browser/config.json points at
# it, so the lookup does not depend on that layout.
RUN mkdir -p /home/agent/.local/lib/agent-browser /home/agent/.agent-browser/browsers/chrome-${CHROME_VERSION}
COPY --chown=agent:agent browser/package.json browser/package-lock.json /home/agent/.local/lib/agent-browser/
RUN cd /home/agent/.local/lib/agent-browser \
 && npm ci --ignore-scripts --omit=dev \
 && chmod 0755 node_modules/agent-browser/bin/agent-browser-linux-x64 \
 && ln -sf ../lib/agent-browser/node_modules/.bin/agent-browser /home/agent/.local/bin/agent-browser \
 && npm cache clean --force \
 && curl -fsSLo /tmp/chrome.zip https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-linux64.zip \
 && echo "${CHROME_SHA256}  /tmp/chrome.zip" | sha256sum -c - \
 && unzip -q /tmp/chrome.zip -d /home/agent/.agent-browser/browsers/chrome-${CHROME_VERSION} \
 && rm -f /tmp/chrome.zip \
 && ! ldd /home/agent/.agent-browser/browsers/chrome-${CHROME_VERSION}/chrome-linux64/chrome | grep "not found" \
 && printf '{"executablePath": "/home/agent/.agent-browser/browsers/chrome-%s/chrome-linux64/chrome"}\n' "${CHROME_VERSION}" > /home/agent/.agent-browser/config.json \
 && test "$(/home/agent/.local/bin/agent-browser --version)" = "agent-browser 0.41.0"
