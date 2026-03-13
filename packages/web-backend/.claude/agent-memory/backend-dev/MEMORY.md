# Backend Dev Agent Memory

## Controller test patterns
- See `patterns.md` for the established controller unit test pattern used in this project.

## Key facts
- `TicketsListResponse.pagination` is **optional** (from `createListResponseSchema` in api-helpers.ts)
- `TicketsService.getTicketById` returns `Promise<Ticket>` (never null) — the service throws NotFoundException internally. The controller has its own null guard that throws a plain `Error`.
- `FlowProposalsService` method: `requestFlowDesign(ticketId, userContext?)` — second param is `userContext`, not `context`
- Controller tests capture handlers via a `routes: Map<string, handler>` built during `controller.configureRoutes(mockAdd)` — see BooksController.test.ts as reference
- `TicketsController` spans two route contracts: `TICKETS_API_ROUTES` + `FLOW_PROPOSALS_API_ROUTES`. The `configureRoutes` parameter is typed to `TICKETS_API_ROUTES` only, and internally casts `add as unknown as RouteWrapperFunc<typeof FLOW_PROPOSALS_API_ROUTES>` for flow proposal routes. In tests, cast mockAdd as `RouteWrapperFunc<any>`.
