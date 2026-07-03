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
