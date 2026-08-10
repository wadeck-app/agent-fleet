# Recommendations

<!-- consolidated 2026-07-03 -->
Looking at the lessons learned, I'll extract actionable recommendations:

## Documentation
- [ ] Fix SKILL.md to accurately document that flows-custom.yml requires explicit `loadProjectFlows()` call and is not auto-loaded by FlowRegistry constructor
- [ ] Document FlowCliRunner initialization pattern: must call `registry.loadProjectFlows(projectRoot)` to enable custom flow discovery

## Process
- [ ] Establish verification protocol before code changes: grep for actual usage, inspect implementation, confirm ground truth before proposing solutions

## Code comments
- [ ] Add comment in FlowCliRunner.__init__ explaining why `loadProjectFlows()` call is required for custom flow discovery
- [ ] Add comment in bin/flow.js documenting tsx loader requirement and why dist/ directory is not used

## Configuration
- [ ] Verify all publishable packages have "exports" field in package.json, not just "main" field, for proper ESM/CJS import resolution

<!-- consolidated 2026-08-10 -->
Looking at the lessons learned to extract actionable recommendations.

## Documentation
- [ ] Document monorepo source-only architecture (tsx + path aliases, no dist builds) and npm link limitations in project README or architecture doc
- [ ] Document flow-cli's monorepo context requirement and --cwd usage for external projects in flow-cli README
- [ ] Document package.json exports configuration pattern for TypeScript packages in monorepo setup guide
- [ ] Add Flow CLI execution guide covering tsx loader, bin/ script configuration, and global installation gotchas
- [ ] Audit all SKILL.md files to ensure documented behavior matches actual implementation (especially flows-custom.yml loading)

## Process
- [ ] Test all proposed solutions practically before presenting them (run commands, execute flows, verify outputs)
- [ ] Proactively document brainstorming insights and design decisions during discussion, not after user prompts
- [ ] Verify facts through grep/code inspection before making assumptions; always investigate before concluding
- [ ] Execute tests immediately after creating them to catch pattern errors before declaring work complete
- [ ] Check skill/tool availability before attempting to invoke (handle gracefully if not available)
- [ ] When files are too large to display directly, offer specific sections or summaries instead of declining
- [ ] Be upfront about limitations immediately rather than cycling through multiple failing approaches
- [ ] Validate assumptions one at a time through code investigation; avoid stacking multiple unverified assumptions

## Configuration
- [ ] Add flow-cli package to monorepo test-config.js to enable run-test skill support
- [ ] Ensure all .claude/skills/ follow directory structure (skills/name/SKILL.md, not skills/name.md)
- [ ] Update FlowCliRunner to call registry.loadProjectFlows(projectRoot) during initialization
- [ ] Fix bin/flow.js to reference actual TypeScript source with tsx loader instead of non-existent dist/
- [ ] Add package.json exports field to all TypeScript packages imported by other packages (flow-engine, etc.)

## Code comments
NOTHING

<!-- consolidated 2026-08-10 -->
I'll analyze the lessons learned and synthesize them into actionable recommendations.

**Documentation**
- [ ] Document monorepo source-only architecture (tsx + path aliases, no dist) and its impact on npm link/global CLI workflows
- [ ] Document that flow-cli is monorepo-first (requires --cwd override for external projects)
- [ ] Document package.json exports field requirements for TypeScript packages with import resolution
- [ ] Document that Claude Code skills must be directories containing SKILL.md, not standalone .md files
- [ ] Document FlowRegistry initialization pattern: CLI runners must call loadProjectFlows() to discover custom flows

**Process**
- [ ] Test all proposed solutions (CLI commands, installation procedures) before presenting to user
- [ ] Proactively capture brainstorming insights and decisions into documentation during sessions without waiting for user request
- [ ] When tool/skill unavailable or failing repeatedly, state limitation upfront rather than trying multiple approaches silently
- [ ] Verify skill availability before invoking; handle gracefully if not available
- [ ] For large files, offer to show specific sections or summaries instead of "too large to display"
- [ ] Establish facts through verification (grep/bash/read) before making assumptions — no guesses

**Configuration**
- [ ] Add flow-cli to monorepo test-config.js to enable run-test skill coverage
- [ ] Fix FlowCliRunner to call registry.loadProjectFlows() during initialization (enables custom flow discovery)
- [ ] Add exports field to flow-engine package.json for proper downstream import resolution
- [ ] Fix bin/flow.js to reference actual entry point (tsx src/cli.ts) not non-existent dist/
