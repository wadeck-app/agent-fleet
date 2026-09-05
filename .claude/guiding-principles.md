# Guiding Principles — agent-fleet

## Code structure
- PascalCase filenames must match the exported class name (`FlowExecutor.ts` → `class FlowExecutor`).
- Single Responsibility; dependency injection via constructor; no God classes — refactor at 400 lines, hard limit 500.
- No fallback for unrecognized values — `switch` defaults must `throw`, never silently continue.
- No circular dependencies between packages.
- Test files co-located with implementation (`Foo.ts` / `Foo.test.ts`); min 70% coverage, 90% for business logic.
- All API endpoints must start with `/api` — required by reverse proxy config.

## Data layer
- Entity schemas: strict, no `.default()` — prevents PATCH from silently overwriting fields with defaults.
- Response schemas: use `.catch()` for normalization on reads only.
- WebSocket event listeners are the single source of truth for UI data refresh; never add a manual reload on mutation success alongside a WebSocket listener (double-reload race condition).
- Worker workspace paths must always be absolute; relative paths break deduplication in `WorkspacesService`.

## Plugin system
- Credentials in plugin config must use `${ENV_VAR}` interpolation — literal secret values are a hard error at load time.
- Extension point interfaces live in `packages/extension-points` (`@flow/extension-points`); plugins depend on that package, not on internal orchestrator types.
- Plugin violation rules PLUGIN-001 through PLUGIN-008 are enforced via the violations CLI.

## Library boundaries
- `flow-engine` is a pure library — no process lifecycle concerns, no side effects, no I/O.
- `singleton-daemon-kit` is only for CLIs needing a persistent daemon; `task-cli` is file-based and must NOT use it.

## Frontend (Data2)
- Feature contracts passed as whole props (`pagination={pagination}`), never spread (`{...pagination}`) — spread causes `useQueryComposition` to receive `undefined`, silently breaking sort/search/refresh.
- `queryUrl` is the source of truth for change detection; do not add `fetchData` to `useAbortableEffect` dependencies.

## CLI distribution
- Config directory is `~/.config/<appName>` on all platforms including Windows — never `%APPDATA%`.
- `preversion` script blocks manual `npm version`; versioning is CI-managed CalVer only.
- Antifragile design: components should be composable, reusable, and isolated such that new situations improve rather than break them.

## From lessons learned

### Build / monorepo
- Run `npm run build` on `flow-engine` before running TypeScript checks in any dependent package (`flow-cli`, `task-cli`) — composite tsconfig references require built dist-types or errors are misleading.
- Always run `npm install` from the monorepo root, never from a subpackage directory — per-subpackage install causes workspace shadowing (hoisted dep resolves from registry instead of workspace).
- Scope all affected files (grep for all import/use sites) before starting any cross-package refactor — partial scoping is the root cause of "incomplete fix" cycles.

### Testing
- Vitest requires its own path alias config in `vitest.config.ts` — `tsconfig.json` path mappings are NOT inherited; a missing alias produces "Failed to load url @/..." only in tests, not in TS compilation.
- TDD: write tests in the red phase, verify they fail, implement, verify they pass — never write a stub implementation labeled "tests will fail first" without that verification step being explicit.
- Run the full test suite (`npm test`) before declaring any implementation complete; build success alone is not sufficient.

### Debugging
- When debugging a failure: form one hypothesis, make one change, observe the result — never make multiple speculative edits in parallel (thrashing pattern observed 20+ times in sessions).

### Flow scripts (Windows)
- Flow `.yml` inline scripts must use `http.request()`, never `fetch()` — `fetch()` in Node.js inline scripts causes `STATUS_STACK_BUFFER_OVERRUN` on Windows (exit code 3221226505).
- Event loop prevention belongs at the flow/subscription filter level (`filter: { authorType: human }`), not at the event emission level — do not filter emitters by author at emission time.

### OpenCode subprocess
- Spawn with `shell: false`, `stdin: 'ignore'` — an open stdin pipe causes indefinite hang waiting for EOF.
- Listen on `exit` event, not `close` — OpenCode spawns a backend server that inherits stdio pipes, so `close` never fires.
- Use `XDG_CONFIG_HOME=<uniqueTemp>` per subprocess for full config isolation; `OPENCODE_CONFIG_DIR` is additive and does not isolate.

### Frontend (Framer Motion / Radix)
- Framer Motion + Radix: use `asChild` on Radix primitives, never wrap with `motion(DialogPrimitive.Content)` — the latter creates lifecycle conflicts causing 2s animation delays and dialog flash.
- `tsx watch` conflicts with terminal-kit stdin capture — never run orchestrator or worker UI scripts (`orch:ui`, `worker:flow:ui`) under tsx watch mode.

### Agent process
- Call `ToolSearch("select:<skillName>")` before invoking any deferred skill — never assume schema is pre-loaded; first "NOT YET KNOWN" is a hard stop, not a retry signal.
- Plan files go in `<projectRoot>/.claude/plans/`, not `~/.claude/plans/` — system reminders may reference the wrong path; CLAUDE.md takes priority.
- No barrel files (`index.ts` re-exporting everything) — direct imports only; barrel files hide dependencies and create circular dependency risks.
- All `if`/`return` statements use multi-line format with braces, even for single statements — project style rule enforced across all packages.
