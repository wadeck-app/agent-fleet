# Threat Model -- Queue CLI

**Version:** 1.0
**Date:** 2026-08-28
**Methodology:** STRIDE

## Scope

Local single-user environment. All processes (queue daemon, producers, subscribers) run as the same OS user. No multi-tenant, no privilege separation, no network exposure beyond localhost.

## Assets

What we are protecting:

| Asset                              | Sensitivity                                                  | Owner      |
| ---------------------------------- | ------------------------------------------------------------ | ---------- |
| Event payloads (WAL, DLQ, logs)    | Medium -- may contain file paths, flow state, ticket content | Local user |
| Subscriber config (commands, URLs) | Low -- no credentials stored                                 | Local user |

## Threat actors

| Actor                               | Motivation                                                          | Capability           |
| ----------------------------------- | ------------------------------------------------------------------- | -------------------- |
| Malicious local process (same user) | Out of scope -- same-user access means full local access regardless | Same as queue daemon |
| Remote attacker                     | No network exposure -- daemon binds to 127.0.0.1 only               | None                 |

## STRIDE analysis

### Spoofing

Local-only. All producers run as same OS user -- no authentication needed (see out-of-scope.md).

### Tampering

WAL and DLQ files are user-owned (D-30: 600 permissions). All writes go through daemon only (D-23). Risk: user-level process can modify WAL files -- accepted per threat model scope (same-user = full access).

### Repudiation

All dispatches logged with full envelope {id, timestamp, event, meta, results} (D-16, D-31). Filter misses logged (D-31). DLQ entries include full attempt history (D-15). Audit trail is present.

### Information Disclosure

WAL, DLQ, logs created with owner-only permissions (D-30). Payloads may contain sensitive data (file paths, flow state, ticket content) -- user accepts this risk as single-user system. No network exposure beyond 127.0.0.1.

### Denial of Service

DLQ bounded by maxDlqSize per subscriber (D-29, default 1000). WAL grows during subscriber downtime -- retries are bounded by maxRetries per subscriber (D-15). Daemon is short-lived (D-7) -- no always-on resource consumption.

### Elevation of Privilege

Daemon binds to 127.0.0.1 only. No credentials stored in queue system itself (D-28: no command interpolation). HTTP subscriber headers may carry tokens -- stored in subscribers.yml with user-only file permissions.

## Mitigations

| ID   | Threat category        | Threat description                          | Mitigation                                 | Status    | Decision # |
| ---- | ---------------------- | ------------------------------------------- | ------------------------------------------ | --------- | ---------- |
| T-01 | Tampering              | WAL/DLQ corruption by concurrent writers    | All writes through daemon only             | Mitigated | D-23       |
| T-02 | Information Disclosure | Payload data exposed in log/WAL files       | Owner-only file permissions (600/user-ACL) | Mitigated | D-30       |
| T-03 | Tampering              | Command injection via payload interpolation | No interpolation -- stdin only             | Mitigated | D-28       |
| T-04 | DoS                    | Unbounded DLQ growth                        | maxDlqSize=1000, oldest pruned with warn   | Mitigated | D-29       |

## Open security questions

<!-- None -- all identified threats mitigated or accepted per scope. -->
