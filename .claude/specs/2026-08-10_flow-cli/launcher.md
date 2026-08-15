# Invocation Modes & Build

Source: `packages/flow-cli/bin/flow.js`, `packages/flow-cli/scripts/build-launcher.mjs`, `packages/flow-cli/launcher.config.json`

## Mode 1 — Development / npm link (no build required)

`bin/flow.js` is the `bin.flow` entry in `package.json`. It is a plain ESM Node.js script (no TypeScript).

**What it does:**

1. Resolves `__dirname` via `fileURLToPath(import.meta.url)`
2. Walks up 3 levels from `bin/` to the monorepo root
3. Resolves `tsx` at `<repoRoot>/node_modules/tsx/dist/cli.mjs`
4. Resolves `src/cli.ts` at `<packageDir>/src/cli.ts`
5. Spawns: `node <tsx> <cli.ts> ...process.argv.slice(2)`
6. `stdio: 'inherit'` — all I/O passes through
7. On exit: `process.exit(code ?? 0)`

**Why this works globally:** `npm link` from the monorepo root adds `flow` to PATH. The `bin/flow.js` shebang (`#!/usr/bin/env node`) then executes, and the hardcoded upward path walk to `node_modules/tsx` always resolves correctly relative to the package location.

No TypeScript compilation step is required.

## Mode 2 — Native Go launcher (production distribution)

### `launcher.config.json`

```json
{
	"appName": "flow",
	"nodeScript": "flow.cjs",
	"defaultConfigDir": ".flow-cli",
	"cliFlags": ["--quit", "--restart", "--queue-status", "--cancel"]
}
```

| Field              | Value         | Meaning                                                             |
| ------------------ | ------------- | ------------------------------------------------------------------- |
| `appName`          | `"flow"`      | Name of the produced binary                                         |
| `nodeScript`       | `"flow.cjs"`  | The compiled CJS entry point the Go binary wraps                    |
| `defaultConfigDir` | `".flow-cli"` | Default daemon config/port-file directory                           |
| `cliFlags`         | 4 flags       | Extra flags the Go binary intercepts before passing through to Node |

**Extra flags added by the Go launcher:**

| Flag             | Purpose                                |
| ---------------- | -------------------------------------- |
| `--quit`         | Send quit signal to the running daemon |
| `--restart`      | Restart the daemon                     |
| `--queue-status` | Query daemon queue status              |
| `--cancel`       | Cancel a queued/running flow           |

### `scripts/build-launcher.mjs`

**Step-by-step:**

1. Resolve `PACKAGE_DIR = packages/flow-cli/`
2. Resolve `@wadeck/singleton-daemon-kit/package.json` via `require.resolve()` (handles workspace hoisting)
3. Locate `BUILD_SH = <SDK_DIR>/go-launcher/build.sh`
4. Exit 1 with error if `BUILD_SH` does not exist
5. `CONFIG = packages/flow-cli/launcher.config.json`
6. `OUT_DIR = packages/flow-cli/launcher-go/dist` — created with `fs.mkdirSync(..., { recursive: true })`
7. Convert all paths to Unix format (`\` → `/`) for bash compatibility on Windows
8. `execFileSync('bash', [BUILD_SH, CONFIG, OUT_DIR], { stdio: 'inherit' })`

Binary targets and names are determined by `build.sh` using `appName` from the config. The `launcher-go/dist/` directory contains the prebuilt binaries (Windows `.exe`, macOS arm64, macOS amd64).

### npm scripts

```json
"build":          "tsc --build tsconfig.json",
"build-launcher": "node scripts/build-launcher.mjs",
"dev":            "tsx src/cli.ts"
```

`build` compiles TypeScript to `dist/`. `build-launcher` builds the Go binaries. `dev` runs the CLI directly via tsx without compilation.
