#!/usr/bin/env bash
# Copies Go launcher binaries and esbuild bundles into platform packages and dist packages.
# Usage: bash ci/scripts/copy-binaries.sh
set -euo pipefail

FLOW_LAUNCHER_DIST="packages/flow-cli/launcher-go/dist"

cp "$FLOW_LAUNCHER_DIST/flow_windows_release.exe"  packages/flow-cli-win32-x64/flow.exe
cp "$FLOW_LAUNCHER_DIST/flow_darwin_arm64_release"  packages/flow-cli-darwin-arm64/flow
cp "$FLOW_LAUNCHER_DIST/flow_darwin_amd64_release"  packages/flow-cli-darwin-x64/flow
chmod +x packages/flow-cli-darwin-arm64/flow packages/flow-cli-darwin-x64/flow
cp packages/flow-cli/dist-bundle/flow.cjs          packages/flow-cli-dist/flow.cjs
cp packages/flow-cli/dist-bundle/worker.cjs        packages/flow-cli-dist/worker.cjs
cp packages/flow-cli/dist-bundle/flow-updater.cjs  packages/flow-cli-dist/flow-updater.cjs
echo "flow artifacts copied"
