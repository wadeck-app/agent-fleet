Important: Delegate to sub-agents early and often. It reduces the context size and increases drastically the performance.

## Local setup (one time)

Add to `~/.npmrc` to access `@wadeck-app` packages from GitHub Packages:

```
@wadeck-app:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=<GitHub personal access token with read:packages scope>
```

Then run `npm install` normally.

## Code Organization

**File naming**: TypeScript files MUST be PascalCase matching their exported class (e.g., `FlowExecutor.ts` → `class FlowExecutor`). See `.agent-fleet/.claude/docs/naming-conventions.md`

**Required:**

- Single Responsibility - One clear purpose per class
- Dependency Injection - Constructor parameters, not globals
- Test Coverage - >70% coverage for all classes, targeting 90% for business logic
- Clear Naming - No abbreviations (use `WebSocket` not `WS`)
- "Antifragile" approach: composable/reusable/isolated features that are improved by encountering new situations rather than breaking

**Avoid:**

- God classes (>500 lines → refactor at 400+)
- Circular dependencies
- Generic names (`manager.ts` → `TaskManager.ts`)
- Kebab-case for class files
- Fallback for unrecognized value, you must fail fast (e.g. switch default case → throw)

**After each task:**
Use the skill "check" and fix the issues

**Coverage requirement**: Minimum 70% for all classes, targeting 90% for business logic. Place unit test files next to implementation:

```
FlowExecutor.ts
FlowExecutor.test.ts
```

**Documentation standards:**

- All documentation, code, and tests in English
- Keep docs concise - reference actual code instead of excerpts
- Examples must link to existing codebase files
- **Context-efficient:** Success = minimal signal (✓), Failure = full context. See https://www.humanlayer.dev/blog/context-efficient-backpressure

## Requirements

- Delegate to sub-agents early and often
- Test before declaring work complete (build + test:agent)
- Document in .claude/temp folder if needed
- <crucial>Never kill processes you didn't create</crucial>
- Ask user if requirements unclear (AskUserQuestion tool)
- **BLOCKING:** Changes to `packages/web-frontend/src/**` → delegate to frontend-dev agent (compilation ≠ working code)
- **Flow integration tests**: Every new model provider must have 1-2 automated flow tests in `packages/flow-engine/src/executor/StepRunner.opencode.integration.test.ts` using mock CLIs (`OPENCODE_MOCK_PATH`/`CLAUDE_MOCK_PATH`). Never use real APIs in automated tests.

## Communication Style

**BANNED PHRASES** - Never use:

- "Vous avez TOTALEMENT raison"
- "Excellente analyse!"
- "Parfait!"
- Any over-validation or excessive praise

**Required approach:**

- Be direct and factual
- Challenge ideas when they're incomplete or wrong
- Defend your analysis when it's valid
- Admit errors without over-apologizing
- Collaborate, don't just agree

**Example:**

- ❌ "Vous avez raison! Je n'ai pas vérifié..."
- ✅ "Let me verify if the event is actually sent. Adding logs to trace the flow."

If the user is wrong, say it. If you disagree, explain why. Act as a peer, not a servant.

## CLI Development Workflow

`flow-cli` and `task-cli` are installed globally via CI (GitHub Packages). Source edits alone do nothing -- the binary in PATH is the published version.

**To deploy a local change:**
1. `git commit` + `git push` → CI builds and publishes automatically
2. `flow cli update` or `task cli update` to install the new version locally

**Never patch `node_modules` manually** -- it gets overwritten on the next install.

**flow-cli daemonDir:** All daemon-related code (`flow run`, `flow history`, `Daemon.startDaemon`, `DAEMON_DIR`) must use `ConfigDir.get('flow')` = `~/.config/flow/`. Using `~/.flow-daemon/` or `~/.config/.flow-daemon/` causes `EADDRINUSE` because commands can't find the running daemon and try to start a new one on an occupied port.

## Additional references (only consult when needed)

- `.claude/kb/lessons-learned.md` - Project-specific gotchas and solutions. **Important**: Append it with what you are learning!
- `.claude/docs/collaboration-rules.md` - **Always apply**: proposals must include pros/cons/recommendation

## Agent reference docs

| Doc | Description |
|---|---|
| `.claude/guiding-principles.md` | Non-negotiable design rules + behavioral lessons from past sessions |
| `.claude/out-of-scope.md` | What this project explicitly does not cover |
| `.claude/product-vision.md` | Roadmap: plugin v2/v3, CLI harmonisation, policy engine |
| `.claude/threat-model.md` | Security threats with status (open/mitigated) |
