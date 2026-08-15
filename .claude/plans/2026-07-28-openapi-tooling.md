# OpenAPI Tooling — Implementation Plan

## Objective

Generate a valid `openapi.json` from existing Zod contracts with a dev watcher. No changes to validation logic, no impact on frontend/backend runtime.

---

## Phase 1 — Dependencies

In `packages/shared-frontend-backend/package.json`:

```json
{
	"devDependencies": {
		"@asteasolutions/zod-to-openapi": "^7.x",
		"chokidar-cli": "^3.x",
		"tsx": "^4.x"
	}
}
```

`@asteasolutions/zod-to-openapi` is the only runtime-adjacent dependency — it wraps Zod schemas non-destructively. The rest is dev tooling only.

---

## Phase 2 — Zod schema annotations

### 2.1 Bootstrap

One call at package entry point (`src/index.ts` or a dedicated `src/openapi/setup.ts`):

```ts
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);
```

This adds `.openapi()` to all Zod schemas. No behavioral change.

### 2.2 Annotate schemas

Annotations are **optional and progressive** — the generator works without them, annotations just improve the output quality.

Priority order:

1. `BaseEntitySchema` — used everywhere, annotations propagate to all derived schemas
2. `BookSchema`, `CreateBookSchema` — first real-world test
3. Error schemas (`OptimisticConflictSchema`, `DeleteResponseSchema`, etc.)
4. Other resource schemas as needed

Example:

```ts
const BookFields = z.object({
	title: sanitizedString(1, 500).openapi({ description: 'Book title', example: 'The Pragmatic Programmer' }),
	author: sanitizedString(1, 255).openapi({ description: 'Author full name', example: 'David Thomas' }),
	isbn: isbnSchema().optional().openapi({ example: '978-0135957059' }),
	publishedYear: yearSchema().optional().openapi({ example: 2019 }),
});
```

Cost: ~1 line per field annotated. Fields without `.openapi()` still appear in the output, just without descriptions/examples.

---

## Phase 3 — Generator script

New file: `packages/shared-frontend-backend/src/openapi/generate.ts`

```ts
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { writeFileSync } from 'fs';

import { ALL_API_ROUTES } from '../types';

const registry = new OpenAPIRegistry();

// Register all routes from ALL_API_ROUTES
for (const [path, methods] of Object.entries(ALL_API_ROUTES)) {
	for (const [method, contract] of Object.entries(methods)) {
		if (method === '__baseUrl') continue;
		registry.registerPath({
			method: method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete',
			path: path.replace(/:(\w+)/g, '{$1}'), // :id → {id}
			request: {
				params: contract.params,
				query: contract.query,
				body: contract.body ? { content: { 'application/json': { schema: contract.body } } } : undefined,
			},
			responses: contract.responses
				? Object.fromEntries(
						Object.entries(contract.responses).map(([status, schema]) => [
							status,
							{ content: { 'application/json': { schema } } },
						])
					)
				: {
						200: { content: { 'application/json': { schema: contract.response } } },
					},
		});
	}
}

const generator = new OpenApiGeneratorV3(registry.definitions);
const document = generator.generateDocument({
	openapi: '3.0.0',
	info: { title: 'API', version: '1.0.0' },
	servers: [{ url: '/api' }],
});

writeFileSync('./openapi.json', JSON.stringify(document, null, 2));
console.log('openapi.json generated');
```

---

## Phase 4 — npm scripts

In `packages/shared-frontend-backend/package.json`:

```json
{
	"scripts": {
		"openapi:generate": "tsx src/openapi/generate.ts",
		"openapi:watch": "chokidar 'src/api/**/*.contract.ts' 'src/common/**/*.ts' --command 'npm run openapi:generate' --initial",
		"openapi:check": "npm run openapi:generate && git diff --exit-code openapi.json"
	}
}
```

- `openapi:generate` — one-shot, used in CI
- `openapi:watch` — dev mode, reruns on any contract change, also runs once on start (`--initial`)
- `openapi:check` — CI guard: fails if committed `openapi.json` is out of sync with contracts

Expected latency: < 300ms per regeneration (tsx + no bundling).

---

## Phase 5 — CI integration

Add to the CI pipeline after build:

```yaml
- name: Check OpenAPI is up to date
  run: npm run openapi:check --workspace=packages/shared-frontend-backend
```

This ensures `openapi.json` is never stale in the repo.

---

## Output location

```
packages/shared-frontend-backend/
  openapi.json    ← committed to repo (serves as snapshot + diff target for CI check)
```

Committing it (vs gitignoring) gives free visual diffs on contract changes in PRs.

---

## What this touches

| File                                     | Change                                                     |
| ---------------------------------------- | ---------------------------------------------------------- |
| `shared-frontend-backend/package.json`   | 3 dev dependencies, 3 scripts                              |
| `src/index.ts` or `src/openapi/setup.ts` | `extendZodWithOpenApi(z)` call                             |
| Existing Zod schemas                     | `.openapi()` annotations — optional, additive, progressive |
| `src/openapi/generate.ts` (new)          | Generator script, isolated                                 |
| `openapi.json` (new)                     | Generated output, committed                                |

## What this does NOT touch

- `route-builder.ts`, `types.ts`, `api-base.ts`
- All contracts — no structural changes
- Backend and frontend — zero impact
