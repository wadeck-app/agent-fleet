---
name: prepare-ws
description: From a "workspace-X"/"wsX" branch, keep the branch up to date with "integration"
---

## Standard Process

### From workspace-X / wsX

1. **Merge integration branch** - Run `git merge integration --no-edit` to prepare the merge, resolve conflicts if any.
    - If the branch was already up-to-date, you can skip running the tests in step 3).

2. **Verify build compiles** - Run `npm run build` to ensure the code compiles without errors.
    - Check that all workspaces (shared, backend, frontend) build successfully

**IMPORTANT RULES:**

- Do NOT merge the branch to "integration" yourself. This will be done by the "merge-to-integration" skill from another agent.
