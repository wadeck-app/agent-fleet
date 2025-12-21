import { z } from 'zod';

/**
 * Schema for orchestrator stats response from GET /stats endpoint
 * This represents the raw data structure returned by the orchestrator API
 */
export const OrchestratorStatsSchema = z.object({
  restPort: z.number(),
  wsPort: z.number(),
  uptime: z.number(), // milliseconds since orchestrator start
  workers: z.number(),
  workersList: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      taskId: z.string().nullable(), // Can be null when worker is idle
      connectedAt: z.string(), // ISO 8601 timestamp
    })
  ),
  tasks: z.object({
    total: z.number(),
    byStatus: z.record(z.string(), z.number()),
  }),
});

// Type inferred from schema
export type OrchestratorStats = z.output<typeof OrchestratorStatsSchema>;
