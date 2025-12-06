// @ts-nocheck - Example code, not compiled
// Rate Limiting Configuration
// Demonstrates rate limiting setup

import rateLimit from '@fastify/rate-limit';

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '15 minutes',
  cache: 10000, // Store rate limit info for N IPs
  allowList: ['127.0.0.1'], // Whitelist
  redis: redisClient // For distributed rate limiting
});
