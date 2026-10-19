// violations-suppress: ts/no-barrel-index entry of the `flow-core/testing` package export: the one place the modules and flow-cli get test fixtures and doubles from; never imported by production code
export { FlowConfigFixture } from './FlowConfigFixture.js';
export { asReply, callRoute, collectRoutes, fakeReply, fakeReq, replied } from './HttpDoubles.js';
export type { FakeReply } from './HttpDoubles.js';
export { makeExec } from './makeExec.js';
