# Backend Dev Agent Memory

## Project: agent-fleet

### Key Architecture Patterns

**Route Registration (lazy-controller-plugin)**

- Each base URL maps to exactly ONE controller in `routes.ts`
- `ROUTES_BY_BASE_URL` computed from `__baseUrl` of each contract (longest common path prefix)
- When a new contract has routes spanning multiple base URLs (e.g. `/api/tickets/...` AND `/api/flows/...`), its `__baseUrl` becomes `/api` — cannot register a controller at that level
- Solution: Add the sub-routes directly to the existing contracts (`TICKETS_API_ROUTES`, `FLOWS_API_ROUTES`) and handle via the existing controllers, passing the new service as a constructor dependency
- See `lazy-controller-plugin.ts` for the FIXME switch statement that maps baseUrl → service injection

**BaseRepository requires BaseEntity**

- `BaseRepository<T extends BaseEntity>` where `BaseEntity = { id, version, createdAt, updatedAt }`
- Contract types that don't extend BaseEntity (e.g. `FlowFeedback`) need an internal stored type: `type StoredX = X & BaseEntity`
- In DataStoreFactory, use `BaseRepository<any>` when the stored type is internal to the repository class

**Status Config Pattern (project-level config)**

- Store optional fields directly on the entity (e.g. `statusConfig?: ProjectStatusConfig` on `Project`)
- Define schemas that entity depends on BEFORE the entity schema in the contract file
- Repository methods `getStatusConfig`/`saveStatusConfig` delegate to `findById`/`update`
- Service validates references (fail-fast) before persisting

**Controller Extension Pattern**

- To add routes to an existing controller, inject additional service as constructor param
- Update `lazy-controller-plugin.ts` switch case to pass the extra service
- Register new routes in `configureRoutes` using the injected service

### Key Files

- Route injection: `packages/web-backend/src/utils/lazy-controller-plugin.ts` (line ~160 switch statement)
- Route registration: `packages/web-backend/src/routes.ts`
- Route discovery: `packages/shared-frontend-backend/src/types.ts` (`ROUTES_BY_BASE_URL`)
- Factory: `packages/web-backend/src/factories/DataStoreFactory.ts`

### Testing Patterns

- Stub repositories as plain objects with `vi.fn()` methods, cast to the type with `as unknown as T`
- Service tests: inject repo stubs directly, no I/O needed
- `vitest.config.ts` has `globals: true` but explicit imports work too
