// Re-export union type for all messages
import type { O2WMessage } from './orchestrator-messages.js';
import type { W2OMessage } from './worker-messages.js';

// Orchestrator ↔ Worker protocol and domain types

export * from './protocol.js';
export * from './domain-types.js';
export * from './worker-messages.js';
export * from './orchestrator-messages.js';
export * from './orchestrator-events.js';

export type Message = W2OMessage | O2WMessage;
