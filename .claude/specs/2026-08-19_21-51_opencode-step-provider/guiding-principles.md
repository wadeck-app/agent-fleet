# Guiding Principles -- OpenCode Step Provider

These principles take priority in every design decision.
Any option that conflicts with a principle must be raised as an open question -- never silently accepted.

## Principles

### P-1: Start small, plan for growth
Ship the minimal correct abstraction (thin interface) today; defer the registry until a third provider makes it necessary.
**Why:** Over-engineering for two known cases creates maintenance cost with no current benefit; but the abstraction boundary must be drawn correctly so v2 is a natural extension, not a rewrite.

<!-- Format for each:
### P-N: <Name>
<One sentence: the rule.>
**Why:** <The motivation -- a past incident, a constraint, a non-negotiable requirement.>
-->
