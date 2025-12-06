// @ts-nocheck - Example code, not compiled
// Connection Pooling Pattern
// Demonstrates database connection pool setup

// Database connection pool
import { Pool } from 'pg';

const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

fastify.decorate('db', pool);
fastify.addHook('onClose', async (instance) => {
  await instance.db.end();
});
