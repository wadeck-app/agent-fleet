---
name: merge-to-integration
description: From "integration" branch, merge a "workspace-x" branch
disable-model-invocation: true
context: fork
---

The arguments $ARGUMENTS[0] is the branch we want to integrate, called "target branch" in the rest of this doc.

## Standard Process

### From integration

1. Ensure all the tests are passing in the current version (they should from the previous run).
   If there are failures, warn the user and wait for input, that's not expected.
   That's either the signal of a flaky test or the process to not have been followed.

2. Check if the "target branch" is ready to be merged without conflict.
   The "target branch" worker is expected to prepare it that way before saying it's ready.
   Do a merge --no-commit --no-ff, if there are conflicts, abort the merge and inform the user that the branch is not ready. Stop there.
   If there is no conflicts, continue.

3. Again ensure all the tests are passing in the current version.
   If there are failures, revert the merge and inform the user that the branch was not ready. Stop there.
4. If all the tests are passing, the merge is considered complete. You can provide a concise summary of the changes made in the branch to be included in the merge commit message.

Do NOT resolve conflicts yourself, it's expected to be done by the "prepare-merge" skill used by another agent or by the user.
Always ensure that the code is compiling without errors.
All test suites must pass. It's a strong requirement.
It's not acceptable to have a test suite that is not running. If you are not able to manage that by yourself, escalate the user.
