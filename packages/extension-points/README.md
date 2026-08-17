# extension-points

Typed interface contracts for the flow-cli plugin system. Defines the provider interfaces that plugins must implement.

Exports `WorkspaceProvider`, `WorkspaceRequest`, `WorkspaceHandle` (workspace/v1) and `ApprovalProvider`, `InputRequest`, `ChoiceRequest`, `ApprovalRequest` (approval/v1).

Also exports `PluginManifest`, `PluginImplementation`, `SENSITIVE_FIELDS`, path validators (`validateBaseDir`, `validateWorkspacePath`, `validateTaskIdForBranchName`, `validateBranchNamePrefix`), and the `releaseWorkspace` helper.

Used by: flow-engine, flow-cli, and all plugin packages.

## Plugin resolution

Built-in plugins (`plugin-none`, `plugin-worktree`, `plugin-cli-approval`) are npm dependencies of `flow-cli` and require no separate installation. The CLI resolves them automatically via Node.js module resolution.

For custom plugins not distributed via npm, declare `pluginsDir` (absolute path) on the instance in your config:

```yaml
# ~/.flow/config.yml
plugins:
    instances:
        my-custom:
            type: plugins.custom.default
            pluginsDir: /opt/flow-plugins # must contain plugin-custom/plugin.config.js
            options:
                someOption: value
```

`pluginsDir` must be an absolute path - relative paths are a hard error at startup.
