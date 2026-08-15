# Recommendations

<!-- consolidated 2026-07-31 -->

- [ ] **Documentation**: Add an explicit SDK boundary statement to relevant specs before any design work begins — state what the SDK handles and what it does not (e.g., "SDK handles CLI↔daemon only, not worker↔daemon").
- [ ] **Documentation**: Add a glossary of domain terms (e.g., RE-QUEUED, bufferSpill, reconnectTimeout) to spec files so repeated grep searches are unnecessary during audits.
- [ ] **Documentation**: Add to CLAUDE.md the criteria for parallel vs. sequential agent delegation — when agents should share findings vs. each reading specs independently.
- [ ] **Documentation**: Define a decision-log schema in CLAUDE.md (structure, naming convention for D12/D13-style markers, file location) to reduce audit-fix cycles.
- [ ] **Process**: During brainstorming/design sessions, never make design choices unilaterally — always present options and wait for explicit approval before proceeding.
- [ ] **Process**: Before proposing a new option, cross-check all prior decisions and exclude already-rejected alternatives.
- [ ] **Process**: When full content is explicitly requested (spec sections, file contents), output the complete text — never summarize.
- [ ] **Process**: For independent evaluations (code review, coherence audit), use subprocess model (`claude --print` via Bash) rather than the Agent tool — subprocess gets fresh context without harness state.
- [ ] **Process**: When multiple agents need the same spec files, pass shared context or findings rather than having each agent re-read the same files independently.
