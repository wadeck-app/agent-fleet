# plugin-worktree

Git worktree workspace plugin for flow-cli. Creates an isolated git worktree per task, enforces path safety (no traversal, no system dirs, no nested worktrees), and cleans up on release.

Requires: a git repository, a writable `baseDir` outside the project root.

## Installation

This plugin is a built-in dependency of `flow-cli` and requires no separate installation.

## Configuration

```yaml
# ~/.flow/config.yml
plugins:
    instances:
        my-worktree:
            type: plugins.worktree.default
            options:
                baseDir: ~/workspaces       # required: absolute or ~ path, outside project root
                branchPrefix: flow/         # optional: prefix for created branches

# .flow/config.yml
plugins:
    workspace:
        use: my-worktree
        options:
            branchPrefix: myproject/        # optional project-level override
```
