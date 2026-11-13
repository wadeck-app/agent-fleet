# Model CLI command resolution with a sandbox launcher

Decision: when `launcher.isolatesEnvironment === true`, the codex, opencode and claude commands come only from `launcher.lookupExecutable('which <tool>')`. A failed or empty answer throws; nothing is probed on the host.

Found by flow-sbx: on a Windows host, codex and opencode ran `where.exe <tool>.cmd` (a Windows command, sent to a POSIX VM) and `fs.existsSync` on the host, then fell back to the bare name with `shell: true`.

| Item | State |
| --- | --- |
| Changed | `SandboxExecutableLookup.ts` (`runsElsewhere`, `whichInSandboxOrThrow`); used by `CodexModelProvider.findCodexCommand`, `resolveOpenCodeCommand`, `ClaudeLauncher.findClaudePath` |
| Error | `<tool> not found in the sandbox launcher (lookup 'which <tool>' failed: <reason>). Install <tool> in the sandbox image.` |
| Unchanged | Default launcher: same lookups, same fallbacks, same messages (pinned by `CodexModelProvider.commandResolution.test.ts` and the existing resolver and launcher tests) |
| Unchanged | `CODEX_MOCK_PATH`, `OPENCODE_MOCK_PATH`, `CLAUDE_MOCK_PATH` still win first, also with a sandbox launcher |
| Claude | Different shape, same defect: `where claude` sent to the VM and a bare-name fallback with a warning. No host `fs` probe. Fixed with the same call |
| Not done | Windows-only `process.platform` use elsewhere in `ClaudeLauncher` (`cmd.exe /c` for `.cmd`, SystemRoot/USERPROFILE env): not reached with a VM path, left alone |
| Not done | `LauncherShellLookup` (bash/pwsh) not merged with the new helper: it lives in `executor/shell` and `processing` must not import from `executor` |
| Not done | No POSIX or real-CLI run; no check that the sandbox launcher's `lookupExecutable` answers `which` as expected beyond the fake |

Reopen if: a sandbox image needs a tool name that differs from the CLI name, a tool is found by a path other than `which` (a per-user install not on PATH), or a non-POSIX sandbox is added (the `which` assumption is in `whichInSandboxOrThrow`).
