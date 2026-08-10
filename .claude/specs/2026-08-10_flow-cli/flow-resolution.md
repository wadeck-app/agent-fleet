# Flow Resolution

Source: `packages/flow-cli/src/FlowCliRunner.ts` — `run()` method

## Resolution order in `flow run <flowRef>`

1. **Load project flows** — `registry.loadProjectFlows()` is called first, unconditionally. This loads flows from:
   - `.agent-fleet/flows.yml`
   - `.agent-fleet/flows-custom.yml`
   Both paths are relative to the project root passed to `FlowRegistry`.

2. **Resolve `flowRef` to an absolute path:**
   ```ts
   path.isAbsolute(flowRef) ? flowRef : path.resolve(cwd, flowRef)
   ```
   `cwd` comes from `--cwd` (default: `process.cwd()`).

3. **File path branch** — if `fs.existsSync(resolvedPath)`:
   - Parse the YAML file via `js-yaml`
   - Assert `raw` is a non-null object: throw `Flow file must contain a valid object: <path>`
   - Assert `raw.id` is a non-empty string: throw `Flow file must have a string 'id' field: <path>`
   - Call `registry.registerFlow(raw)` — throws wrapped as `Invalid flow in <basename>: <message>` on validation failure
   - Return `raw.id` as `flowId`

4. **Registry ID branch** — if the resolved path does not exist:
   - Use `flowRef` directly as `flowId`

5. **Lookup** — `registry.getFlow(flowId)` is called. If it returns `undefined`:
   - Throw `Flow not found: '<flowId>'. Check the ID or provide a YAML file path.`

## Notes

- A file registered from a direct path is added to the registry; if its `id` matches a project flow, it will override it (registry semantics determine precedence).
- The `flowsFile` option in `RunOptions` exists but is NOT used — `loadProjectFlows()` always uses the fixed `.agent-fleet/` paths.
- Relative `flowRef` paths are resolved against `cwd`, not `process.cwd()` — they can differ when `--cwd` is specified.
