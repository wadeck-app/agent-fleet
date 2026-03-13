# Controller Unit Test Patterns

## Established pattern (from BooksController.test.ts, TasksController.test.ts)

### Route capture approach
```ts
let routes: Map<string, (...args: any[]) => Promise<any>>;

beforeEach(() => {
    // ... build mocks ...
    routes = new Map();
    const mockAdd: RouteWrapperFunc<typeof MY_ROUTES> = (method, path, handler) => {
        routes.set(`${method} ${path}`, handler);
    };
    controller.configureRoutes(mockAdd);
});
```

### Handler invocation
```ts
const handler = routes.get('GET /api/resource/');
const result = await handler!({ query: { filter: 'value' } });
```

### When controller spans multiple route contracts (e.g. TicketsController)
Cast mockAdd as `RouteWrapperFunc<any>` since the controller internally re-casts `add` for the second contract.

### Test structure per route
1. Happy path: mock returns value, verify service call args, verify result
2. Error path: mock rejects with NotFoundException/ConflictException, verify it propagates

### Factory functions over shared consts
Prefer `const makeSampleTicket = (): Ticket => ({...})` over a shared `const sampleTicket` — avoids mutation leaks between tests.
