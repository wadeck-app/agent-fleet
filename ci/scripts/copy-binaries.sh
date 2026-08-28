#!/usr/bin/env bash
# Copies Go launcher binaries and esbuild bundles into platform packages and dist packages.
# Usage: bash ci/scripts/copy-binaries.sh [flow|task|all]
# Default: copies both.
set -euo pipefail

CLI="${1:-all}"
FLOW_LAUNCHER_DIST="packages/flow-cli/launcher-go/dist"
TASK_LAUNCHER_DIST="packages/task-cli/launcher-go/dist"

copy_flow() {
  cp "$FLOW_LAUNCHER_DIST/flow_windows_release.exe"  packages/flow-cli-win32-x64/flow.exe
  cp "$FLOW_LAUNCHER_DIST/flow_darwin_arm64_release"  packages/flow-cli-darwin-arm64/flow
  cp "$FLOW_LAUNCHER_DIST/flow_darwin_amd64_release"  packages/flow-cli-darwin-x64/flow
  chmod +x packages/flow-cli-darwin-arm64/flow packages/flow-cli-darwin-x64/flow
  cp packages/flow-cli/dist-bundle/flow.cjs          packages/flow-cli-dist/flow.cjs
  cp packages/flow-cli/dist-bundle/flow-updater.cjs  packages/flow-cli-dist/flow-updater.cjs
  echo "flow artifacts copied"
}

copy_task() {
  cp "$TASK_LAUNCHER_DIST/task_windows_release.exe"  packages/task-cli-win32-x64/task.exe
  cp "$TASK_LAUNCHER_DIST/task_darwin_arm64_release"  packages/task-cli-darwin-arm64/task
  cp "$TASK_LAUNCHER_DIST/task_darwin_amd64_release"  packages/task-cli-darwin-x64/task
  chmod +x packages/task-cli-darwin-arm64/task packages/task-cli-darwin-x64/task
  cp packages/task-cli/dist-bundle/task.cjs           packages/task-cli-dist/task.cjs
  cp packages/task-cli/dist-bundle/task-updater.cjs   packages/task-cli-dist/task-updater.cjs
  echo "task artifacts copied"
}

case "$CLI" in
  flow) copy_flow ;;
  task) copy_task ;;
  all)  copy_flow; copy_task ;;
  *) echo "Unknown CLI: $CLI"; exit 1 ;;
esac
