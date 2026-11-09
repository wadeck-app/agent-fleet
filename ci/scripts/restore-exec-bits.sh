#!/usr/bin/env bash
# Restores the executable bit of the platform binaries after download-artifact: upload/download-artifact do not keep
# file modes, so the chmod +x of copy-binaries.sh is lost and npm would pack the darwin launcher as 0644 (the shim
# then fails with EACCES). Fails loudly when a binary is missing or still not executable.
# Usage: bash ci/scripts/restore-exec-bits.sh   (from the repository root, before npm publish)
set -euo pipefail

for binary in packages/flow-cli-darwin-arm64/flow packages/flow-cli-darwin-x64/flow; do
  if [ ! -f "$binary" ]; then
    echo "restore-exec-bits: $binary is missing after the artifact download" >&2
    exit 1
  fi
  chmod +x "$binary"
  if [ ! -x "$binary" ]; then
    echo "restore-exec-bits: $binary is still not executable after chmod +x" >&2
    exit 1
  fi
  echo "restore-exec-bits: $binary is executable"
done
