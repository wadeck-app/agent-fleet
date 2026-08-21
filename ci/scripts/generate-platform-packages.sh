#!/usr/bin/env bash
# Generates platform package directories for npm publish.
# Called by CI before copy-binaries.sh. Not needed locally.
# Usage: bash ci/scripts/generate-platform-packages.sh
set -euo pipefail

REGISTRY="https://gitlab.com/api/v4/projects/84445653/packages/npm/"

generate() {
  local name="$1" os="$2" cpu="$3" bin_file="$4"
  local dir="packages/${name}"
  mkdir -p "$dir"
  cat > "$dir/package.json" <<EOF
{
  "name": "@wadeck/${name}",
  "version": "0.0.0",
  "os": ["${os}"],
  "cpu": ["${cpu}"],
  "files": ["${bin_file}"],
  "publishConfig": {
    "@wadeck:registry": "${REGISTRY}"
  }
}
EOF
  echo "generated packages/${name}/package.json"
}

generate "flow-cli-win32-x64"    "win32"  "x64"   "flow.exe"
generate "flow-cli-darwin-arm64" "darwin" "arm64" "flow"
generate "flow-cli-darwin-x64"   "darwin" "x64"   "flow"
generate "task-cli-win32-x64"    "win32"  "x64"   "task.exe"
generate "task-cli-darwin-arm64" "darwin" "arm64" "task"
generate "task-cli-darwin-x64"   "darwin" "x64"   "task"
