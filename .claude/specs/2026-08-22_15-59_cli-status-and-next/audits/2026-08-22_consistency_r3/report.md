# Consistency Audit Round 3 — CLI Status and Next Steps

**Date:** 2026-08-22
**Scope:** All 10 spec files — `_index.md`, `guiding-principles.md`, `out-of-scope.md`, `threat-model.md`, `config-dir.md`, `shared-cli.md`, `sdk-xdg.md`, `violations-migration.md`, `wdrive-migration.md`, `scrapers.md`
**R2 fixes confirmed:** F-01/R-01, F-02/R-02, F-03/R-03, N-01/N-02/N-03 — all verified resolved.

---

## FINDINGS

### R3-F-01 — HIGH — `_index.md` header: question count wrong and Q-10 still open

**Location:** `_index.md` line 5
**Observed:** `Status: In Review -- v0.2 -- 12/12 questions resolved; 8 audits complete`
**Issues (two):**

1. The Open Questions table lists Q-1 through Q-11 = **11 questions**, not 12. There is no Q-12 anywhere.
2. Q-10 (`Should CLIs warn when running as root/admin?`) has `Status: Open` in the table. The header claims all questions are resolved.

**Correct count:** 10/11 resolved (Q-10 open). Header must be updated to reflect this.

---

### R3-F-02 — MEDIUM — `shared-cli.md` Security section references Q-11 as unresolved

**Location:** `shared-cli.md` line 57
**Observed:** `Blast radius of a compromised version depends on consumer pinning strategy (Q-11).`
**Issue:** Q-11 is marked `Resolved by D-19` in `_index.md`. The reference in `shared-cli.md` treats it as an open concern rather than a resolved decision. Should read: `resolved by D-19 (caret range accepted; see threat-model.md T-06)`.

---

### R3-F-03 — MEDIUM — `config-dir.md` "Per-CLI target paths" table omits scrapers

**Location:** `config-dir.md` lines 41–48
**Observed:** Table lists flow, task, wdrive, violations only.
**Issue:** Scrapers (assurance-scrapper, whatsapp-scrapper, chatgpt-scrapper) adopt `ConfigDir` per D-16 and are documented in `scrapers.md`. The table covers all tools using ConfigDir but silently omits all three scraper entries.
**Expected:** Add rows: `~/.config/assurance-scrapper`, `~/.config/whatsapp-scrapper`, `~/.config/chatgpt-scrapper`.

---

### R3-F-04 — MEDIUM — `wdrive-migration.md` decisions table broken by blockquote

**Location:** `wdrive-migration.md` lines 15–21
**Observed:** A `> Note (D-13 / SEC-03)` blockquote with a blank line before it sits between D-13 and D-17 table rows.
**Issue:** A Markdown table breaks at a blank line. The blockquote after D-13 terminates the table. D-17, D-18, and D-7 rows appear after the blockquote and render as bare pipe-delimited text, not a table.
**Fix:** Move the note below the full table, or embed it inline in the D-13 row without a blank line separator.

---

### R3-F-05 — INFO — `threat-model.md` T-05 "Decision #" column contains Q-10

**Location:** `threat-model.md` Mitigations table, T-05 row
**Observed:** `| T-05 | ... | Open | Q-10 |`
**Issue:** Column header is "Decision #" but T-05 uses Q-10 (a question ID). Because Q-10 is still open, there is no decision to reference — this is intentional tracking of the gate condition. The semantic mismatch is minor; if Q-10 is resolved by a new D-xx, this row needs updating.

---

## CLEAN

- `guiding-principles.md` — no D/Q/T references; internally consistent.
- `out-of-scope.md` — T9 lists T5+T7+T8 (R1 fix confirmed); D-7 valid.
- `sdk-xdg.md` — D-10/D-17/D-18 correct (R2 fix confirmed); no dangling references.
- `violations-migration.md` — D-11/D-12/D-5 valid; T-01/T-04 correct.
- `scrapers.md` — D-6/D-14/D-15/D-16 valid; Q-10 correctly open; T-01/T-06/T-08 valid.
- `threat-model.md` T-06 references D-19 (R2 fix confirmed).
- `config-dir.md` T-02 reference valid; no dangling refs beyond F-03.

---

## Summary

| ID      | Severity | File                  | Issue                                                             |
| ------- | -------- | --------------------- | ----------------------------------------------------------------- |
| R3-F-01 | HIGH     | `_index.md`           | Header claims 12/12 resolved; 11 questions exist and Q-10 is open |
| R3-F-02 | MEDIUM   | `shared-cli.md`       | Q-11 referenced as open; resolved by D-19                         |
| R3-F-03 | MEDIUM   | `config-dir.md`       | Scrapers omitted from Per-CLI target paths table                  |
| R3-F-04 | MEDIUM   | `wdrive-migration.md` | Blockquote breaks Markdown table; D-17/D-18/D-7 rows unreachable  |
| R3-F-05 | INFO     | `threat-model.md`     | T-05 Decision# column contains Q-10 (question, not decision)      |
