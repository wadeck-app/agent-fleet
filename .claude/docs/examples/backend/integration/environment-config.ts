// @ts-nocheck - Example code, not compiled
// Environment Configuration Pattern
// Demonstrates type-safe environment variables with Zod

// config.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  JWT_SECRET: z.string().min(32)
});

export const config = envSchema.parse(process.env);

// Usage (fully typed)
console.log(config.PORT); // number
console.log(config.NODE_ENV); // 'development' | 'production' | 'test'
