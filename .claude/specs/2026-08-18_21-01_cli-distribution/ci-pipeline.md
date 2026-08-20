# CI Pipeline -- CLI Distribution

**Version:** v0.1
**Last updated:** 2026-08-19
**Status:** Draft

## Overview

GitHub Actions workflows that publish `@wadeck/flow-cli` and `@wadeck/task-cli` to the GitLab npm registry.
Each CLI has its own workflow, path-filtered to its source files and shared dependencies.
Edge releases on every relevant push to `main`. Stable releases via `workflow_dispatch` (manual).

## Release channels

| Channel         | Trigger                                | Version format              | dist-tag                                       |
| --------------- | -------------------------------------- | --------------------------- | ---------------------------------------------- |
| `edge`          | push to main (path-filtered)           | `YYYY.MM.DD-<count>-<sha8>` | `edge`                                         |
| `breaking-edge` | manual, for breaking changes           | Same as edge                | `breaking-edge` for 48h, then re-tag to `edge` |
| `stable`        | `workflow_dispatch` with version input | semver (e.g. `1.2.0`)       | `latest`                                       |

Users configure their preferred channel in `~/.config/flow/config.yml: update: channel: edge|stable`.
Default: `edge`.

## Workflow: publish-flow-cli.yml

### Trigger

```yaml
on:
    push:
        branches: [main]
        paths:
            - packages/flow-cli/**
            - packages/flow-engine/**
            - packages/extension-points/**
            - packages/plugin-none/**
            - packages/plugin-worktree/**
            - packages/plugin-cli-approval/**
            - packages/shared-common/**
    workflow_dispatch:
        inputs:
            version:
                description: 'Stable version (e.g. 1.2.0)'
                required: true
            breaking:
                description: 'Is this a breaking change? (true/false)'
                required: false
                default: 'false'
```

### Steps (in order)

1. `actions/checkout@v4` + `actions/setup-node@v4` (Node 22)
2. `npm ci` (full workspace install)
3. `npm run build --workspaces` (tsc for all packages)
4. `npm run bundle:all --workspace packages/flow-cli` (flow.cjs + task.cjs + flow-updater.cjs)
5. `npm run build-launcher --workspace packages/flow-cli` (4 Go binaries: win32-x64, darwin-arm64, darwin-x64, linux-x64)
6. `bash ci/scripts/compute-version.sh` (outputs VERSION and DIST_TAG to GITHUB_OUTPUT)
7. `bash ci/scripts/copy-binaries.sh` (copies launcher binaries + flow.cjs into platform package dirs)
8. Set version in all 5 packages: `npm version $VERSION --no-git-tag-version` for each
9. Publish platform packages first (must exist before main package optionalDeps resolve):
   `npm publish --workspace packages/flow-cli-win32-x64` (repeat for each platform)
10. Publish main package: `npm publish --workspace packages/flow-cli-dist --tag $DIST_TAG`

### Environment / secrets

- `NODE_AUTH_TOKEN`: GitLab npm token (same token as in local `~/.npmrc` for `@wadeck` scope)
- npmrc injected via `actions/setup-node` `registry-url` + `NODE_AUTH_TOKEN` secret, or via `.npmrc` committed to repo with `_authToken` from secret

## Workflow: publish-task-cli.yml

Same structure as `publish-flow-cli.yml` with:

- paths: `packages/task-cli/**` (once task CLI is split into its own package) + all shared dep paths
- Replaces `flow-cli` with `task-cli` throughout

## compute-version.sh

Adapted from `C:\Workspace_Tooling\wdrive\ci\scripts\compute-version.sh`.

Outputs to `$GITHUB_OUTPUT`:

- `version` -- version string
- `dist_tag` -- `edge`, `latest`, or `breaking-edge`

Logic:

- If `workflow_dispatch` with version input and `breaking=true`: `dist_tag=breaking-edge`, `version=YYYY.MM.DD-<count>-<sha8>`
- If `workflow_dispatch` with version input (non-breaking): `dist_tag=latest`, `version=$INPUT_VERSION`
- Otherwise (push to main): `dist_tag=edge`, `version=YYYY.MM.DD-$(git rev-list --count HEAD)-$(git rev-parse --short=8 HEAD)`

## copy-binaries.sh

```bash
#!/usr/bin/env bash
set -euo pipefail
DIST=packages/flow-cli/launcher-go/dist
cp "$DIST/flow_windows_release.exe"  packages/flow-cli-win32-x64/flow.exe
cp "$DIST/flow_darwin_arm64_release" packages/flow-cli-darwin-arm64/flow
cp "$DIST/flow_darwin_amd64_release" packages/flow-cli-darwin-x64/flow
cp "$DIST/flow_linux_amd64_release"  packages/flow-cli-linux-x64/flow
cp packages/flow-cli/dist-bundle/flow.cjs packages/flow-cli-dist/flow.cjs
chmod +x packages/flow-cli-darwin-arm64/flow \
         packages/flow-cli-darwin-x64/flow \
         packages/flow-cli-linux-x64/flow
```

## Security considerations

- `NODE_AUTH_TOKEN` is scoped to publish steps only; not exposed to build steps.
- Platform packages are published before the main package to ensure optionalDependencies resolve correctly on install.
- No artifact signing at application level; npm SHA512 integrity check is the accepted mitigation for this private single-user registry.
- Breaking change dist-tag (`breaking-edge`) isolates users on `edge` channel for 48h before the tag moves; users on `stable` are unaffected.
