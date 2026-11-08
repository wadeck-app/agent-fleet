# Step requirements instead of `workerType` (design note for flow-owner)

Status: proposal, nothing implemented. Source: plan `2026-10-25_docker-sandbox-worker.md` section 10 and the user's constraints of 2026-11-07/08. Each choice gives pros, cons and a recommendation.

## Constraints (fixed by the user)

1. Model steps always run in the sandbox.
2. Code the agent wrote (tests, build) runs in the sandbox.
3. The sandbox worker runs scripts itself, never through another worker.
4. A flow states requirements (keywords or `key=value`), never a worker type. `workerType` and `exclusive` are removed.
5. Host tools for a model step belong to the separate tool-provision MCP plan: out of scope here.

## Vocabulary

| Term | Meaning |
| --- | --- |
| Requirement | A keyword or `key=value` a step needs from the worker that runs it (extends labels). |
| Guarantee | A requirement a worker advertises it can enforce. |
| Profile | A named set of requirements, defined in configuration, with built-in defaults. |

Guarantees: `fs=confined`, `env=clean`, `ports=private`, `net=filtered`, `fs=readonly`, `clean=run|step`.
Built-in profiles: `agent`, `read-only`, `untrusted-code`, `hermetic-test`.

## Choices

### D1. Requirements as labels with `key=value`

| | |
| --- | --- |
| Pros | Reuses the label matching the daemon has; no new routing concept; a worker's set is a plain list. |
| Cons | Values need comparison rules (`clean=run` satisfies `clean=step`? no: stricter-than is a partial order). |
| Recommendation | Yes. Equality for keywords; for `clean`, an explicit order `step` > `run` (a worker with `clean=step` serves both). Other keys: equality. |

### D2. Profiles in configuration, built-ins as defaults

| | |
| --- | --- |
| Pros | Flows say `profile: untrusted-code`, not five keys; an admin can tighten a profile once. |
| Cons | A flow's meaning depends on configuration; an unknown profile name must fail validation. |
| Recommendation | Yes. Built-ins are code defaults overridable in `config.yml`; the flow definition snapshot (`definitionSnapshot`) stores the RESOLVED requirements so a run is reproducible after a config change. |

### D3. Implicit requirements

| Step | Implicit |
| --- | --- |
| model | profile `agent` |
| script with `shell: cmd` or `pwsh` | the shell as a keyword (`shell=cmd`) |
| injected step | its parent's requirements |
| script that runs agent-written code | explicit `profile: untrusted-code` (the daemon cannot know) |

| | |
| --- | --- |
| Pros | Common cases need no syntax; injected steps cannot escape isolation (today only `exclusive` stops that). |
| Cons | A script that runs agent code without declaring it runs on the host. |
| Recommendation | Yes, plus a validation WARNING when a script step depends on a step that wrote files in a workspace of a model step and declares no profile (cheap lint, not a guarantee). `npm test && git push` in one step stays unsupported. |

### D4. Who runs a script: the sandbox worker itself

| | |
| --- | --- |
| Pros | One process model; no host worker proxying into the VM (a second hop would widen the trust boundary). |
| Cons | A sandbox worker must be able to run any shell the flow needs; some shells exist only on the host. |
| Recommendation | Yes. `shell=cmd` is then unsatisfiable by a Linux sandbox worker: the step fails at validation with "no worker provides shell=cmd", not at run time. |

### D5. Run affinity

| | |
| --- | --- |
| Pros | Steps of one run share a warm sandbox (about 8 s saved per sandbox; files stay). |
| Cons | A hard rule blocks the run when its worker is busy. |
| Recommendation | Best-effort preference: prefer the worker that served the run; any worker meeting the requirements otherwise. A worker without the requirement serves a step only for a run it already serves (unchanged rule). A strategy plugin may come later. |

### D6. Read-only: workspace mode is a ceiling, step `fs=readonly` only narrows

| | |
| --- | --- |
| Pros | One rule; a read-only workspace can never be written by a step. |
| Cons | A read-only STEP inside a read-write run cannot be enforced inside the run's sandbox: mounts are fixed at creation. |
| Recommendation | Whole-run read-only: the provider mounts the workspace `:ro` (only secondary mounts may be read-only: the primary must be read/write, so the pool slot is the secondary and the sandbox needs another primary, see open point O1). Step-level read-only in a read-write run: a SECOND sandbox with the workspace as a `:ro` secondary mount (about +8 s). A provider advertises `fs=readonly` only if it enforces it; "soft" read-only (tool permission mode) is not a guarantee and must not be advertised. A step asking for write on a read-only workspace is a validation error. |

Evidence: the `:ro` mount is enforced by the HOST side (virtiofs). As root in the VM, remount (also bind), a new mount namespace, a second virtiofs mount of the share and `mount(2)` all failed with `Read-only file system` and the host file was unchanged (sbx 0.51.0, one machine; README "Mounts: links and read-only"). Not tested: protocol-level or kernel attacks.

## Core versus plugin

| Core (flow) must provide | Sandbox plugin provides |
| --- | --- |
| Requirement syntax and validation (`key=value`, profiles, unknown names fail) | The list of guarantees its workers can enforce |
| Profile resolution, built-ins and config override, resolved set stored in the definition snapshot | `fs=confined`, `env=clean`, `net=filtered`, `ports=private`: enforcement in the sandbox |
| Matching step requirements to worker guarantees; no match fails at validation or start with the missing key named | `clean=run|step`: sandbox lifetime per run or per step |
| Implicit requirements (model, shell, injected steps inherit) | `fs=readonly`: `:ro` secondary mount, second sandbox for a read-only step |
| Affinity preference in worker selection | Warm-sandbox reuse for a run |
| Removal of `workerType` and `exclusive` (migration below) | Wrapper checks that stay as defence in depth (`SandboxableWorkspace`: pool only, meta outside the workspace) |
| Validation that a sandbox-requiring step has a workspace the plugin accepts (today only the wrapper refuses in-place) | Leftover listing and removal (explicit command), unchanged |

## Migration

1. Core: add requirements and profiles next to labels; keep `workerType` working; both resolve to requirements internally.
2. Plugin: advertise guarantees; keep the worker-type declaration until step 4.
3. Flows: replace `workerType: sandbox` by `profile: agent` (model steps need nothing) or `profile: untrusted-code`; the daemon warns on `workerType`.
4. Remove `workerType` and `exclusive` from schema, daemon and plugin; delete the exclusivity paragraphs of the plugin README.
5. Pin the new routing facts in `SandboxPluginE2e.test.ts` (an unbound flow with a model step must still land in a sandbox).

## Open points

| # | Question | Default if undecided |
| --- | --- | --- |
| O1 | Whole-run read-only needs the workspace as a `:ro` secondary mount, so the sandbox needs another read/write primary mount (the run's `.meta`?) | Use the run's `.meta` as primary; verified only that the primary must be read/write |
| O2 | `clean=step` cost: one sandbox per step is about +8 s each | Accept; document it on the profile |
| O3 | Where the "agent wrote this code" lint lives | Core validation, warning only |
