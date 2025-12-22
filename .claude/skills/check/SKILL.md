---
name: check
description: Check TypeScript/ESLint errors across the monorepo (backend, frontend, shared). Use when verifying type safety, before commits/PRs, or after code changes. Outputs few lines on success, logs errors to file on failure.
allowed-tools:
    - Bash
    - Read
---

# Check Agent Skill

Run TypeScript/ESLint type checking across all monorepo packages with minimal console output to reduce context pollution for LLM agents.

## When to Use

Use this skill whenever you need to:

- ✅ Verify TypeScript or ESLint errors before saying you're done with your task
- ✅ Check type safety after code changes
- ✅ Validate refactoring or type definitions

**ALWAYS prefer this approach over running the `tsc` or `eslint` manually** in individual packages.

## Basic Usage

```bash
npm run check
```
