# Dependencies

Source: `packages/flow-cli/package.json`, `packages/flow-cli/tsconfig.json`

## Runtime dependencies

| Package | Version | Origin | Role |
|---|---|---|---|
| `flow-engine` | `*` | Monorepo workspace | `FlowExecutor`, `FlowRegistry`, `FlowValidator`, `FlowCapabilitiesGenerator`, intervention types |
| `shared-common` | `*` | Monorepo workspace | Shared utilities (imported transitively) |
| `commander` | `^12.1.0` | npm | CLI argument parsing and command registration |
| `js-yaml` | `^4.1.1` | npm | YAML parsing for flow files |
| `@wadeck/singleton-daemon-kit` | `^1.0.0` | npm | Daemon lifecycle, client, port file primitives, Go launcher build tooling |

## Dev dependencies

| Package | Version | Role |
|---|---|---|
| `@types/js-yaml` | `^4.0.9` | TypeScript types for js-yaml |
| `typescript` | `^5.3.3` | TypeScript compiler |
| `vitest` | `^4.0.14` | Test runner |
| `tsx` | `^4.7.0` | On-the-fly TypeScript execution (used by `bin/flow.js` and `dev` script) |

## Workspace resolution

`tsconfig.json` maps workspace packages to their source directories for development:

```json
"paths": {
  "flow-engine":    ["../flow-engine/src"],
  "flow-engine/*":  ["../flow-engine/src/*"],
  "shared-common":  ["../shared-common/src"],
  "shared-common/*":["../shared-common/src/*"]
}
```

`tsconfig.references` includes `../flow-engine` and `../shared-common` for TypeScript project references (composite builds).

## flow-engine exports used

| Export | Type | Used by |
|---|---|---|
| `FlowExecutor` | class | `FlowCliRunner` |
| `FlowRegistry` | class | `FlowCliRunner` |
| `FlowValidator` | class | `ValidateCommand` |
| `FlowCapabilitiesGenerator` | class | `DocsCommand` |
| `ValidationIssue` | type | `ValidateCommand` |
| `InterventionHandler` | type | `ThrowInterventionHandler` |
| `InterventionRequest` | type | `ThrowInterventionHandler` |
| `InterventionResponse` | type | `ThrowInterventionHandler` |
| `FlowDefinition` | type | `ShowCommand`, `FlowCliRunner` |
| `FlowStep`, `ModelFlowStep`, `ScriptFlowStep`, `SubFlowStep`, `UserInterventionStep` | types | `ShowCommand` |
| `FlowExecutionResult` | type | `FlowCliRunner` |
