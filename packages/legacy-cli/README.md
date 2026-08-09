# legacy-cli

Thin CLI binary (`fleet-task`) for submitting tasks to the orchestrator from the command line.

## Purpose

Provides a minimal command-line interface for sending tasks to a running orchestrator via its REST API.

## Responsibility

- Parsing command-line arguments
- Submitting task requests to the orchestrator REST API (port 3737)
- Reporting submission results to stdout

## Does NOT own

- Task execution — that's worker
- Orchestrator logic — that's orchestrator
- Flow definitions — that's flow-engine

## Dependencies on local packages

- orchestrator (REST API target)
- shared-common
- shared-orch-worker

## Consumers

None — end-user binary, invoked directly from a terminal.

## Entry point type

CLI binary (`fleet-task`).

## Key files

- `src/entry-point.ts` — single-file implementation: argument parsing, HTTP call, output
