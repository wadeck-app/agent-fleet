# Typed Status Codes — Implementation Plan

## Objective

Add multi-status typed responses to the existing contract system, progressively, without breaking existing routes. Introduce helper bundles for recurring patterns (optimistic lock, bulk operations, nullable lookup).

---

## Phase 1 — Core type infrastructure

### 1.1 Extend `RouteContract` in `route-builder.ts`

Add `responses` as optional alongside the existing `response`:

```ts
type RouteContract = {
	params?: z.ZodTypeAny;
	query?: z.ZodTypeAny;
	body?: z.ZodTypeAny;
	response: z.ZodTypeAny; // existing, unchanged
	responses?: Partial<Record<number, z.ZodTypeAny>>; // new, optional
};
```

Existing routes continue working — `responses` is never required.

### 1.2 Extend type helpers in `types.ts`

Add `RouteStatusResponse<M, P, Status>` that extracts the body type for a given status code:

```ts
type RouteStatusResponse<M extends HttpMethod, P extends string, S extends number> = P extends keyof Routes
	? M extends keyof Routes[P]
		? Routes[P][M] extends { responses: Record<S, infer R> }
			? R extends { parse: (data: any) => infer T }
				? T
				: never
			: never
		: never
	: never;
```

Add `RouteResult<M, P>` — the discriminated union returned when `responses` is present:

```ts
type RouteResult<M, P> = {
	[S in keyof Routes[P][M]['responses']]: {
		status: S;
		body: RouteStatusResponse<M, P, S>;
	};
}[keyof Routes[P][M]['responses']];
```

### 1.3 Update `typedFetch` in `api-base.ts`

When the contract has `responses`, return `{ status, body }` instead of throwing on non-200:

```ts
if (contract.responses) {
  const statusSchema = contract.responses[response.status];
  const body = await response.json();
  const validated = statusSchema
    ? validateWithMode(statusSchema, body, `Response ${response.status}`, validationMode)
    : body;
  return { status: response.status, body: validated } as RouteResponse<M, P, Routes>;
}
// existing behavior for routes without `responses`
```

Routes without `responses` are untouched — no regression possible.

---

## Phase 2 — Pattern helpers (contract side)

New file: `shared-frontend-backend/src/patterns/`

### 2.1 `optimisticLock(config)`

Packages `200` + `409 OptimisticConflictSchema` automatically:

```ts
const OptimisticConflictSchema = z.object({
	code: z.literal('OPTIMISTIC_LOCK_CONFLICT'),
	currentVersion: z.number(),
	yourVersion: z.number(),
});

function optimisticLock<T extends z.ZodTypeAny>(config: { params?: z.ZodTypeAny; body: z.ZodTypeAny; response: T }) {
	return {
		...config,
		responses: {
			200: config.response,
			409: OptimisticConflictSchema,
		},
	};
}
```

Usage in contract:

```ts
'/api/books/:id': {
  PUT: optimisticLock({ params: IdParamSchema, body: UpdateBookSchema, response: BookSchema }),
}
```

### 2.2 `nullableLookup(config)`

Packages `200` + `404` — for endpoints where not-found is a normal flow (not an error):

```ts
function nullableLookup<T extends z.ZodTypeAny>(config: { params?: z.ZodTypeAny; query?: z.ZodTypeAny; response: T }) {
	return {
		...config,
		responses: {
			200: config.response,
			404: z.object({ code: z.literal('NOT_FOUND') }),
		},
	};
}
```

Replaces the `try/catch + 404 check` pattern in `checkISBN`.

### 2.3 `bulkOperation(config)`

Packages `200` (full success) + `207` (partial success):

```ts
function bulkOperation<TSuccess extends z.ZodTypeAny, TFailed extends z.ZodTypeAny>(config: {
	body: z.ZodTypeAny;
	successItem: TSuccess;
	failedItem: TFailed;
}) {
	return {
		body: config.body,
		responses: {
			200: z.object({ success: z.literal(true), items: z.array(config.successItem) }),
			207: z.object({
				success: z.literal(false),
				succeeded: z.array(config.successItem),
				failed: z.array(config.failedItem),
			}),
		},
	};
}
```

---

## Phase 3 — Pattern helpers (backend side)

New file: `web-backend/src/utils/route-patterns.ts`

### 3.1 `withOptimisticLock(handler)`

Catches `OptimisticLockError` thrown by the service and returns `{ status: 409, body }`:

```ts
function withOptimisticLock<T>(handler: RouteHandler<T>) {
	return async ctx => {
		try {
			const result = await handler(ctx);
			return { status: 200 as const, body: result };
		} catch (err) {
			if (err instanceof OptimisticLockError) {
				return {
					status: 409 as const,
					body: {
						code: 'OPTIMISTIC_LOCK_CONFLICT' as const,
						currentVersion: err.currentVersion,
						yourVersion: err.yourVersion,
					},
				};
			}
			throw err;
		}
	};
}
```

Backend usage:

```ts
add(
	'PUT',
	'/api/books/:id',
	withOptimisticLock(async ({ params, body }) => service.update(params.id, body))
);
```

### 3.2 `withNullableLookup(handler)`

Catches `NotFoundException`, returns `{ status: 404 }` instead of throwing:

```ts
function withNullableLookup<T>(handler: RouteHandler<T>) {
	return async ctx => {
		try {
			const result = await handler(ctx);
			return { status: 200 as const, body: result };
		} catch (err) {
			if (err instanceof NotFoundException) {
				return { status: 404 as const, body: { code: 'NOT_FOUND' as const } };
			}
			throw err;
		}
	};
}
```

---

## Phase 4 — Frontend usage update

Only the routes that adopt `responses` need frontend changes. Existing routes untouched.

`checkISBN` before:

```ts
try {
  return await booksService.checkISBN(isbn);
} catch (err) {
  if (err instanceof ApiError && err.status === 404) return null;
  throw err;
}
```

`checkISBN` after:

```ts
const result = await typedFetch('GET', '/api/books/isbn/:isbn', { params: { isbn } });
if (result.status === 404) return null;
return result.body;
```

---

## What this touches

| File                                            | Change                                                      |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `route-builder.ts`                              | Add `responses` to `RouteContract`                          |
| `types.ts`                                      | Add `RouteStatusResponse`, `RouteResult` type helpers       |
| `api-base.ts`                                   | Branch on `contract.responses` in `typedFetch`              |
| `src/patterns/` (new)                           | `optimisticLock`, `nullableLookup`, `bulkOperation` helpers |
| `web-backend/src/utils/route-patterns.ts` (new) | `withOptimisticLock`, `withNullableLookup` wrappers         |
| Existing contracts                              | Opt-in per route — no forced migration                      |

## What this does NOT touch

Everything else. Routes without `responses` compile and run identically.
