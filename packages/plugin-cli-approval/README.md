# plugin-cli-approval

Terminal approval plugin for flow-cli. Implements `ApprovalProvider` using readline to prompt the user for free-text input, multiple-choice selection, and yes/no approvals directly in the terminal.

## Installation

This plugin is a built-in dependency of `flow-cli` and requires no separate installation.

## Configuration

```yaml
# .flow/config.yml
plugins:
    approval:
        instance:
            type: plugins.cli-approval.default
```
