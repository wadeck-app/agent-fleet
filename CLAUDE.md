Important: Delegate to sub-agents early and often. It reduces the context size and increases drastically the performance.

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
- **Capturing in-flight UI states** (loading spinners, opacity during save): use the `dev-hold` skill

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

## Additional references (only consult when needed)

- `.claude/kb/lessons-learned.md` - Project-specific gotchas and solutions. **Important**: Append it with what you are learning!
- `.claude/docs/ux-guidelines.md` - UX/UI/Design rules. MUST read before any task touching UI, UX, or design. Violations = bugs.
- `agent-browser` is a skill, not a sub-agent!
