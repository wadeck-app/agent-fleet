# Linting

Run `node scripts/check-eslint.js` (also step "ESLint" of `npm run check`). It lints every package declaring a `lint` script, two at a time, and writes failures to `eslint-errors.log`. One package: `cd packages/<name> && npm run lint`.

## Why TypeScript 6 side by side

The root `typescript` is 7.x (build, `tsc`, vitest). `typescript-eslint` (latest 8.72.0) declares peer `typescript <6.1.0` and refuses to load TS 7, so the linter needs the 6.x compiler API.

- `package.json` aliases it: `"typescript-6": "npm:typescript@^6"`.
- `scripts/setup-eslint-ts6.cjs` links `node_modules/typescript-6` as `node_modules/typescript` inside `typescript-eslint`, `ts-api-utils` and every `@typescript-eslint/*` package, so only the linter's tree resolves TS 6.
- It runs on `postinstall` and at the start of `check-eslint.js` (idempotent, fails with an actionable message). After `npm ci --ignore-scripts` or a reinstall, run it by hand.

Rejected: a newer typescript-eslint (8.72.0 and canary 8.72.1 keep the `<6.1.0` peer range); a `--require` resolution hook (links are simpler and also work for IDE and direct `eslint` runs).

## Type-aware rules

`typeAwareConfig(__dirname)` in the root `eslint.config.mjs` enables `no-floating-promises`, `no-misused-promises` and `await-thenable` on production sources (tests are outside the package tsconfig). Each package config appends it; new packages must do the same.

## Removing the workaround

When `typescript-eslint` supports TS 7: bump it, delete `typescript-6`, `scripts/setup-eslint-ts6.cjs`, the `postinstall` entry and `ensureTypescriptSixSideBySide` in `scripts/check-eslint.js`, then run `npm install` and `node scripts/check-eslint.js`.
