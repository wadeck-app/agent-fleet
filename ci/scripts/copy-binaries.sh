#!/usr/bin/env bash
# Copies Go launcher binaries and esbuild bundles into platform packages and dist packages.
# Usage: bash ci/scripts/copy-binaries.sh [flow|task|all]
# Default: copies both.
set -euo pipefail

CLI="${1:-all}"
LAUNCHER_DIST="packages/flow-cli/launcher-go/dist"

copy_flow() {
  cp "$LAUNCHER_DIST/flow_windows_release.exe"  packages/flow-cli-win32-x64/flow.exe
  cp "$LAUNCHER_DIST/flow_darwin_arm64_release"  packages/flow-cli-darwin-arm64/flow
  cp "$LAUNCHER_DIST/flow_darwin_amd64_release"  packages/flow-cli-darwin-x64/flow
  cp packages/flow-cli/dist-bundle/flow.cjs          packages/flow-cli-dist/flow.cjs
  cp packages/flow-cli/dist-bundle/flow-updater.cjs  packages/flow-cli-dist/flow-updater.cjs
  echo "flow artifacts copied"
}

copy_task() {
  # task launcher: use task-specific binaries if they exist, fall back to flow binaries
  # (same binary, different config -- to be refined when task gets its own launcher config)
  cp "$LAUNCHER_DIST/task_windows_release.exe"  packages/task-cli-win32-x64/task.exe 2>/dev/null \
    || cp "$LAUNCHER_DIST/flow_windows_release.exe"  packages/task-cli-win32-x64/task.exe
  cp "$LAUNCHER_DIST/task_darwin_arm64_release"  packages/task-cli-darwin-arm64/task 2>/dev/null \
    || cp "$LAUNCHER_DIST/flow_darwin_arm64_release"  packages/task-cli-darwin-arm64/task
  cp "$LAUNCHER_DIST/task_darwin_amd64_release"  packages/task-cli-darwin-x64/task 2>/dev/null \
    || cp "$LAUNCHER_DIST/flow_darwin_amd64_release"  packages/task-cli-darwin-x64/task
  cp packages/flow-cli/dist-bundle/task.cjs           packages/task-cli-dist/task.cjs
  # Shared updater bundle: flow-updater.cjs also serves task-cli via UPDATER_PKG_NAME env var.
  # Replace with a task-specific bundle when task-cli gets its own Go launcher config.
  cp packages/flow-cli/dist-bundle/flow-updater.cjs   packages/task-cli-dist/task-updater.cjs
  echo "task artifacts copied"
}

case "$CLI" in
  flow) copy_flow ;;
  task) copy_task ;;
  all)  copy_flow; copy_task ;;
  *) echo "Unknown CLI: $CLI"; exit 1 ;;
esac
