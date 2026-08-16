# plugin-worktree

Git worktree workspace plugin for flow-cli. Creates an isolated git worktree per task, enforces path safety (no traversal, no system dirs, no nested worktrees), and cleans up on release.

Requires: a git repository, a writable `baseDir` outside the project root.
