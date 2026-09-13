# plugin-file-approval

File-based approval plugin for flow-cli. Implements `ApprovalProvider` ([contract](../extension-points/src/approval/v1.ts)) by writing a request file and waiting for a response file, so a `user_intervention` step can be answered without a TTY -- by a script, a remote human, or another agent.

## Installation

This plugin is a built-in dependency of `flow-cli` and requires no separate installation.

## Configuration

```yaml
# .flow/config.yml
plugins:
    approval:
        instance:
            type: plugins.file-approval.default
```

Directory precedence: `dir` option, then `FLOW_APPROVAL_DIR`, then `<ConfigDir.get('flow')>/approvals`. An explicit non-absolute path is rejected. Defaults: 30 min timeout, 500 ms poll interval (see [FileApprovalProvider.ts](src/FileApprovalProvider.ts)).

## Answering a request

Each request writes `<dir>/<taskId>_<stepId>.request.json`, whose `respondBy` field states exactly what to create. Answer by writing `<dir>/<taskId>_<stepId>.response.json`:

| Request kind | Response body                                  | Resolves to   |
| ------------ | ---------------------------------------------- | ------------- |
| `approval`   | `{"approved": true\|false, "comment"?: "..."}` | the boolean   |
| `input`      | `{"value": "..."}`                             | the string    |
| `choice`     | `{"choiceId": "<offered id>"}`                 | the choice id |

Both files then move to `<dir>/answered/` as an audit trail.

## Failure modes -- all loud

- Malformed JSON, missing/mistyped field, or unknown `choiceId` -> throws naming the file, what was found and what was expected. No default, no auto-approval; the file stays on disk for inspection.
- Timeout -> throws with the request path, the response path to create and the expected shape. Never resolves to `false`, which would look like a real denial.
- A stale response file already present when the request is published -> throws instead of consuming it.
