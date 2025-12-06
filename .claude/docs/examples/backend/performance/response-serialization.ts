// @ts-nocheck - Example code, not compiled
// Response Serialization Optimization
// Demonstrates schema-based serialization for performance

// Define schema = Fast serialization
const schema = {
  response: {
    200: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' }
        }
      }
    }
  }
};

// 2-3x faster than JSON.stringify for large responses
