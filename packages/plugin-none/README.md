# plugin-none

Trivial workspace plugin for flow-cli. Implements `WorkspaceProvider` by returning `process.cwd()` as the workspace path. No isolation, no cleanup. Useful for local development and testing.

## Installation

This plugin is a built-in dependency of `flow-cli` and requires no separate installation.

## Configuration

```yaml
# .flow/config.yml
plugins:
    workspace:
        instance:
            type: plugins.none.default
```
