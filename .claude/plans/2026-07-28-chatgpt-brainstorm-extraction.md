# ChatGPT Brainstorm Extraction — Agent Fleet Architecture

## Decisions

- Flows are composable library artefacts without team ownership; they belong to the org/sub-org/project hierarchy, not to a specific team.
- Trusted steps are the governance boundary, not flows or agent actions directly.
- Trusted steps are provided at org / sub-org / project scope by whoever holds the appropriate permissions (e.g. Security team for scans at sub-org level).
- The agent/effect separation is a core architectural choice: agents propose intent, a controlled runtime executes effects.
- Progressive discovery is the intended UX model: simple by default, depth accessible, expert control available.
- `fleet.md` + Fleet DB are distinct: explicit documentation vs operational memory + production history.
- The observation flow produces suggestions; human validation is required before adoption into flows or policies.
- Readonly review phases are inserted as quality checkpoints within flows, not only at the end.

## Open Points

- How does the observation flow propose changes without creating an uncontrolled self-modification loop? (who can modify flows, policies, trusted steps, and under what conditions?)
- What is the minimal viable scope for V1 to avoid building an agent ERP?
- How are flow versioning and proposal promotion governed? (who approves `Bug Fix v1` → `Bug Fix v2` at org level?)
- Should agent autonomy scoring be a primitive or deferred? (flagged as "interesting but needs framing")
- How is the ownership metadata handled when org restructuring happens? (history model sketched but not decided)

## Interesting Elements

- The trusted steps / certified equipment analogy from industrial manufacturing is the strongest parallel: "we don't control each agent action, we control the critical passage points."
- Fleet is closer to a "software production system with adaptive governance" than a dark factory; agents will become interchangeable, the real value is in flows, controls, durable effects, and organisational memory.
- The learning loop (observation → suggestion → human validation → new flow version) is the key differentiator vs classical dark factories, which run fixed processes.
- Progressive discovery solves a real product problem: most AI systems either hide too much or expose full complexity — Fleet targets the middle ground.
- Meaningful metrics for a software dark factory: ticket→production time, rollback rate, human intervention count, post-release defect rate, confidence by change type, agent cost.
- Agents become commodity; the competitive moat is in flows, controls, effects runtime, and the ability to industrialise trust.

## Challenges

- Scope creep risk: tickets, agents, workflows, permissions, policies, memory, effects, monitoring, knowledge graph — the perimeter can explode; a minimal kernel must be enforced.
- Over-automating too early: the observation flow must never become agent-observes → agent-modifies → agent-optimises without human gate.
- Measuring the wrong thing: productivity in volume is not the goal; predictability, low defect rate, and continuous improvement are.
- Owner model is tempting to introduce early but adds premature complexity; deferred until it is needed as governance metadata.
- Agent self-improvement is flagged as risky and should not be a near-term feature.

## Needs

- Flows must support inheritance/layering across org → sub-org → project → user scopes.
- Trusted steps must carry: source, trust level, modification permissions, associated policies.
- The effect runtime must guarantee: action recorded, result verified, recovery after failure.
- Flow instances must be traceable back to the flow template version they used.
- The system must support ownership history (who was responsible, which policies were associated, which flows were in use) to survive org changes.
- Readonly phases must be enforceable within flows, not optional.
- Trusted steps must be immutable to unprivileged agents and developers.

---

## Appendix — MVP V1 Analysis (2026-07-28)

### V1 Constraints

- No autonomy
- No flow versioning
- Flow = DAG
- Execution model: pull + push, whichever event arrives first

### What Already Exists (do not rebuild)

Tasks, workers, flows (DAG + execution), workspaces, projects, interventions (user-in-the-loop), real-time transport. The brainstorming partially reinvents what is already in place.

### What Is Missing for MVP

- **Trusted steps** — the central governance concept. Flows exist but all steps are equivalent; none are certified or governed.
- **Hierarchical scopes** — org → sub-org → project → user. Absent. Everything is flat today (workspace + project, no permission hierarchy).
- **Effect runtime guarantees** — script and model steps execute but without explicit primitives for: action recorded, result verified, recovery after failure.
- **Observation flow** — no learning loop. What happens inside flows does not surface as improvement suggestions.
- **Policy / governance** — no rule constraining which flows can run, where, with which trusted steps.

### Thematic Iterations

**Iteration 1 — Trusted Steps (governance foundation)**
- Define `TrustedStep` type: source, trust level, modification permissions
- Allow a flow step to reference a trusted step by ID instead of being defined inline
- UI: trusted step catalogue per scope (project/workspace)
- Business value: flows become auditable — "this flow uses only approved steps"

**Iteration 2 — Effect Traceability**
- Every action executed by a step records: what, when, result, who triggered it
- Link execution traces to flow instances (`flowResult` + `traceChunkStorage` already exist — extend them)
- Business value: full auditability, rollback possible, production flow debugging

**Iteration 3 — Pull + Push Execution Model**
- Pull: worker polls and picks the next eligible task based on its available flows (partially in place)
- Push: an incoming event (git push, webhook, timer) triggers a flow without human intervention
- Business value: real automation — an opened PR triggers a review flow automatically

**Iteration 4 — Minimal Hierarchical Scope**
- Introduce `Organization` and `SubOrg` as containers above `Project`
- Trusted steps are assigned to a scope and inherited downward
- Business value: a security team can impose their steps on all projects without touching each flow

**Iteration 5 — Observation Loop (human-gated)**
- Flows can emit `suggestions` (new output type)
- Suggestions accumulate in a review queue
- A human validates → the suggestion becomes a flow modification (never automatic)
- Business value: the system learns without self-modifying

### Recommended V1 Scope

Iterations 1 + 2 form a coherent first deliverable: trusted steps as the governance primitive, full effect traceability as the auditability layer. Iterations 3–5 are V2.
