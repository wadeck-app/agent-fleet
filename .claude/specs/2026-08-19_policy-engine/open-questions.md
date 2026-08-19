# Policy Engine — Open Questions

> Extracted from `.claude/specs/2026-07-30-flow-cli/open-questions.md` and `decisions.md` on 2026-08-19.

---

## OQ-1 — `provideSteps` schema completeness [HIGH — from Q27]

**Status:** Partially resolved (D39 covers the schema). Still open at extraction time.

**Original wording (Q27 open item):**
> "**Open: `provideSteps` schema** — exact fields needed to describe an injected step and how it attaches to the running graph. What does a `provideSteps` call look like?"

D39 was added to address this, but the following sub-questions remain implicit:

- Does the policy step need to read current graph state before injecting (e.g. "is step X already present")? If so, what tool exposes that? `getFlowState` is listed as a v2+ tool in D35 but not designed.
- Can a policy step inject steps with `depends` on steps that do not yet exist but are themselves about to be injected in the same `provideSteps` call?
- What happens if a policy step calls `provideSteps` with an empty array — is that a no-op, or an error?

---

## OQ-2 — Injection scope semantics for policy sub-steps [HIGH — from Q27]

**Status:** Open.

**Original wording (Q27 open item):**
> "**Open: injection scope sémantique** — 'sub-tasks of A' model needs daemon implementation design."

The semantic contract: when step A injects steps with `parent: A`, step A is not complete until all those sub-steps finish. But:

- If a policy step injects a required step that subsequently fails — does the parent policy step also fail? Or is the failure propagated differently?
- If `onFailure.goto` on an injected sub-step points back to its parent (`goto: policy-step-id`) — is that a valid cycle? What does re-running the policy step mean (it might inject duplicates)?
- The "validate required loops exist" use case implies the policy step inspects the graph and either passes (no-op) or blocks. The spec does not define how "blocking" is expressed — is it simply: the policy step calls `provideSteps` with a step that eventually succeeds, and that step's completion is what unblocks?

---

## OQ-3 — `policy` as a first-class step type [MEDIUM]

**Status:** Open. The spec references "policy engine" as a named concept and step type in several places, but `type: policy` does not appear in any schema.

**From Q27 resolved section:**
> "Any step type (model, script, policy engine) can inject steps"

**From D30:**
> The `InjectedStep.type` field accepts `'model' | 'script' | 'subflow'` only. `user_intervention` is excluded. `policy` is not listed.

**Questions:**
- Should `type: policy` be a first-class step type with dedicated runtime behavior (e.g. receives graph state automatically, has no `prompt` or `command` field)?
- Or is the policy engine purely a usage pattern — a `model` step whose prompt is "act as a policy enforcer" calling `provideSteps`?
- If `type: policy` becomes first-class, what is its input/output contract? Does it receive the full serialized graph, or only `ExecutionContext`?

---

## OQ-4 — Graph inspection tools for policy steps [MEDIUM — v2 scope]

**Status:** Deferred to v2 (D35 lists `getFlowState` as a v2+ tool).

**From D35:**
> v2+ tools: `logMessage`, `setTodo`, `askUser`, `getFlowState`, `getStepOutput`

A policy step that can only inject (not read) is blind — it cannot check whether a required step already exists before injecting a duplicate. This creates a risk of duplicate injection if a policy step is re-run (e.g. after `onFailure.goto`).

**Questions to resolve before `getFlowState` is designed:**
- What subset of graph state does a policy step need? Full step list? Only step IDs and statuses? Step types?
- Should `getFlowState` return live runtime state (step statuses) or structural state (the graph topology)?
- Is there a read-only guarantee — i.e. `getFlowState` never has side effects?

---

## OQ-5 — Policy enforcement ordering relative to other steps [LOW]

**Status:** Open.

If a policy step and a model step both depend on the same predecessor and run in parallel:
- The model step may inject steps before the policy step has had a chance to validate the graph.
- The policy step may inject a step that conflicts with what the model step already injected.

**Questions:**
- Is there a declared ordering guarantee that policy steps run before steps they are meant to govern?
- Should `depends` be the only mechanism for ordering, or should a policy step have a higher-priority queue position?
- Are policy steps expected to be idempotent (safe to re-run if the graph has already been validated)?
