# Out of Scope -- Plugin System for flow/task CLI

Items listed here are **explicitly excluded**.
Raising an excluded item as a requirement is a change-of-scope conversation, not a design question.

## Excluded items

### CI/hosted global config file as a first-class feature (v2)

**Reason:** FLOW_CONFIG/TASK_CONFIG already supports pointing to any file path, so CI use is mechanically possible in v1. But a dedicated `flow config validate` command, `flow config init --ci` scaffold, and documentation for this pattern are v2 work.
**Covered by:** plugin-architecture.md > v2 TODO > Cloud B: CI/hosted global config file

### Remote config download (v3)

**Reason:** v1 and v2 support only local files. Remote URL fetching, caching, and the associated threat surface (Spoofing/Tampering of remote config) are deferred.
**Covered by:** plugin-architecture.md > v2 TODO > Remote config download

### Plugin input/placeholder schema (v3)

**Reason:** The idea of global config declaring required "inputs" that projects must fill in is a useful future pattern but adds significant design and validation complexity not needed in v1 or v2.
**Covered by:** plugin-architecture.md > v2 TODO > Plugin input/placeholder schema

### Subprocess / process-level plugin isolation (v2)

**Reason:** All plugins are developer-written in v1; isolation adds IPC complexity with no security benefit at this stage. The TypeScript interface contract is designed to allow wrapping later.
**Covered by:** guiding-principles.md > P-1

## How to challenge scope

If you believe an item should be in scope, open a new discussion with the rationale.
Do not modify this file silently -- scope changes must be acknowledged as a versioned decision.
