---
name: prepare-merge
description: From a "workspace-X" branch, prepare the branch to be integrated back to "integration"
---

## Standard Process

### From workspace-X

1) **Ensure ALL tests/checks pass** - If there are failures, correct them.
   - **CRITICAL**: ALL 6 test suites MUST pass (Backend, Frontend, Shared, E2E App, E2E Components, Visual)
   - **NO EXCEPTIONS**: A branch is NOT ready if any test suite fails or is skipped

2) **Merge integration branch** - Run `git merge integration --no-edit` to prepare the merge, resolve conflicts if any.
   - If the branch was already up-to-date, you can skip running the tests in step 3).

3) **Verify ALL tests/checks still pass** - Use the skill "run-test" again after merge. If there are failures, correct them.
   - Integration branch is expected to always have a green build
   - Test failures after merge typically come from conflict resolution issues
   - **CRITICAL**: Fix ALL failures before proceeding

4) **Verify build compiles** - Run `npm run build` to ensure the code compiles without errors.
   - Check that all workspaces (shared, backend, frontend) build successfully

5) **Handle port conflicts** - If tests fail due to port conflicts (e.g., "port 6100 is already used"):
   - Identify the process: `netstat -ano | findstr ":<PORT>"`
   - Request the user to kill the leftover test process
   - Rerun tests to verify all pass

6) **Branch ready** - Only when ALL tests pass and build succeeds, the branch is considered ready.
   - Provide a concise summary of changes for the merge commit message (and commit it! all the changes must be commited)

**IMPORTANT RULES:**
- Do NOT merge the branch to "integration" yourself. This will be done by the "merge-to-integration" skill from another agent.
- Do NOT consider the branch ready if ANY test suite fails, is totally skipped, or shows errors
- All test suites MUST pass. It's a strong requirement.
- It's not acceptable to have a test suite that is not running. If you are not able to manage that by yourself, escalate the user.