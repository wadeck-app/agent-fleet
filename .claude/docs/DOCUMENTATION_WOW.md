# Documentation Ways of Working

**Read time:** 2 minutes

---

## 📋 Naming Convention

```
[NUMBER]-[project]-[TYPE].md
```

| Type | Purpose | Example |
|------|---------|---------|
| `PLAN` | Main reference (architecture, all phases) | `01-subflow-PLAN.md` |
| `REPORT` | What was done | `02-subflow-phase1-REPORT.md` |
| `TESTS` | Test coverage | `03-subflow-TESTS.md` |
| `SUMMARY` | Quick overview | `04-subflow-SUMMARY.md` |

**Rules:**
- Number: `01-`, `02-`, `03-`
- Project: `lowercase-with-dashes`
- Type: `UPPERCASE`

---

## 📍 File Locations

- `.claude/temp/` → Work in progress
- `.claude/docs/` → Permanent reference (WOW docs)
- `.claude/kb/` → Lessons learned

---

## ✍️ Writing Guidelines

**Keep it SHORT:**
- Aim for <500 lines per doc
- Use tables, not paragraphs
- Use bullet points
- If you need >1000 lines, split the document

**Be SPECIFIC:**
- Include line numbers: `StepRunner.ts:338`
- Use exact metrics: `81.69%` not "good"
- Link related docs: `See 01-feature-PLAN.md`

**Be ACTIONABLE:**
- Clear TODOs
- Concrete next steps
- No vague recommendations

---

## 🚀 Quick Reference

```bash
# Standard set
01-feature-PLAN.md          # Main reference (start here)
02-feature-REPORT.md        # Implementation details
03-feature-TESTS.md         # Coverage & tests
04-feature-SUMMARY.md       # Quick view

# Special prefixes
RFC-01-topic.md             # Design proposals
ADR-01-decision.md          # Architecture decisions
```

**Status indicators:**
- ✅ Complete
- ⏳ In Progress
- 📋 Planned

---

**Created:** 2025-12-08
**Principle:** If you can't read it in 2-3 minutes, it's too long.
