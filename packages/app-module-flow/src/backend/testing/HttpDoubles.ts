import type { ModuleContext, ModuleRouteHandler } from '@wadeck-app/app-core-sdk';
import { vi } from 'vitest';

// Handlers read only params/query and call reply.code(n).send(body): a real FastifyRequest has 25+ other
// properties nobody needs to fake here.
export function fakeReq(partial: Record<string, unknown> = {}): Parameters<ModuleRouteHandler>[0] {
	return partial as unknown as Parameters<ModuleRouteHandler>[0];
}

export interface FakeReply {
	code: ReturnType<typeof vi.fn>;
	send: ReturnType<typeof vi.fn>;
}

export function fakeReply(): FakeReply {
	const send = vi.fn((body: unknown) => body);
	const code = vi.fn((_status: number) => ({ send }));
	return { code, send };
}

export function asReply(reply: FakeReply): Parameters<ModuleRouteHandler>[1] {
	return reply as unknown as Parameters<ModuleRouteHandler>[1];
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

export function collectRoutes(): { routes: Map<string, ModuleRouteHandler>; ctx: ModuleContext } {
	const routes = new Map<string, ModuleRouteHandler>();
	const ctx: ModuleContext = {
		dataDir: '/unused/data-dir',
		setInterval: vi.fn(),
		setTimeout: vi.fn(),
		clearInterval: vi.fn(),
		clearTimeout: vi.fn(),
		on: vi.fn(),
		off: vi.fn(),
		emit: vi.fn(),
		registerRoute: (method, subPath, handler) => routes.set(`${method} ${subPath}`, handler),
		dispose: vi.fn(),
	};
	return { routes, ctx };
}

/** Runs the registered handler of `route` ("GET /executions") and returns what it replied. */
export async function callRoute(
	routes: Map<string, ModuleRouteHandler>,
	route: string,
	request: Record<string, unknown> = {}
): Promise<{ status: number; body: unknown }> {
	const handler = routes.get(route);
	if (!handler) throw new Error(`No route registered for '${route}'. Registered: ${[...routes.keys()].join(', ')}`);
	const reply = fakeReply();
	await handler(fakeReq(request), asReply(reply));
	return replied(reply);
}
