// @ts-nocheck - Example code, not compiled
// Input Sanitization Pattern
// Demonstrates HTML sanitization for user content

// JSON Schema validators prevent most attacks
// Additional sanitization for HTML
import DOMPurify from 'isomorphic-dompurify';

fastify.post('/comments', async (request, reply) => {
  const sanitized = DOMPurify.sanitize(request.body.content);
  // Store sanitized content
});
