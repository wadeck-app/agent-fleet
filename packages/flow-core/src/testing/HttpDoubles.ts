import { vi } from 'vitest';

// Test doubles for the app-core route API (ModuleContext.registerRoute, handlers taking (req, reply)). flow-core
// knows no SDK: the module tests name the real types through the type parameters, e.g.
// `collectRoutes<ModuleContext>()` and `asReply<Parameters<ModuleRouteHandler>[1]>(reply)`.

type RouteHandlerDouble = (req: unknown, reply: unknown) => unknown;

/** Handlers read only params/query: a real FastifyRequest has 25+ other properties nobody needs to fake here. */
export function fakeReq<TRequest>(partial: Record<string, unknown> = {}): TRequest {
	return partial as unknown as TRequest;
}

export interface FakeReply {
	code: ReturnType<typeof vi.fn>;
	send: ReturnType<typeof vi.fn>;
}

/** Records `reply.code(n).send(body)`. */
export function fakeReply(): FakeReply {
	const send = vi.fn((body: unknown) => body);
	const code = vi.fn((_status: number) => ({ send }));
	return { code, send };
}

export function asReply<TReply>(reply: FakeReply): TReply {
	return reply as unknown as TReply;
}

/** The status and body a handler replied with. Fails loudly when it replied nothing. */
export function replied(reply: FakeReply): { status: number; body: unknown } {
	if (reply.code.mock.calls.length !== 1 || reply.send.mock.calls.length !== 1) {
		throw new Error(
			`Expected exactly one reply.code(n).send(body), got ${reply.code.mock.calls.length} code() and ${reply.send.mock.calls.length} send() calls.`
		);
	}
	return { status: reply.code.mock.calls[0]![0] as number, body: reply.send.mock.calls[0]![0] };
}

/** A ModuleContext whose registerRoute records the handlers by "METHOD /subPath". */
export function collectRoutes<TContext>(): { routes: Map<string, RouteHandlerDouble>; ctx: TContext } {
	const routes = new Map<string, RouteHandlerDouble>();
	const ctx = {
		dataDir: '/unused/data-dir',
		setInterval: vi.fn(),
		setTimeout: vi.fn(),
		clearInterval: vi.fn(),
		clearTimeout: vi.fn(),
		on: vi.fn(),
		off: vi.fn(),
		emit: vi.fn(),
		registerRoute: (method: string, subPath: string, handler: RouteHandlerDouble) =>
			routes.set(`${method} ${subPath}`, handler),
		dispose: vi.fn(),
	};
	return { routes, ctx: ctx as unknown as TContext };
}

/** Runs the registered handler of `route` ("GET /executions") and returns what it replied. */
export async function callRoute(
	routes: Map<string, RouteHandlerDouble>,
	route: string,
	request: Record<string, unknown> = {}
): Promise<{ status: number; body: unknown }> {
	const handler = routes.get(route);
	if (!handler) throw new Error(`No route registered for '${route}'. Registered: ${[...routes.keys()].join(', ')}`);
	const reply = fakeReply();
	await handler(request, reply);
	return replied(reply);
}
