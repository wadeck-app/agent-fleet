# Deployment Guide

## Table of Contents

1. [Environment Variables](#environment-variables)
2. [Production Configuration](#production-configuration)
3. [HTTPS Requirements](#https-requirements)
4. [CORS Configuration](#cors-configuration)
5. [Scaling Considerations](#scaling-considerations)
6. [Monitoring and Alerting](#monitoring-and-alerting)
7. [Troubleshooting](#troubleshooting)
8. [Deployment Checklist](#deployment-checklist)

---

## Environment Variables

### Required Variables

These variables MUST be set in production:

```bash
# JWT Authentication
JWT_SECRET=your-very-strong-secret-key-minimum-32-characters
COOKIE_SECRET=your-cookie-secret-different-from-jwt-secret

# Environment
NODE_ENV=production

# Server
PORT=3000
HOST=0.0.0.0

# Frontend URL (for CORS)
FRONTEND_URL=https://yourdomain.com

# Database (if applicable)
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

### Optional Variables

```bash
# WebSocket Configuration
WS_HEARTBEAT_INTERVAL=30000      # Heartbeat interval (ms)
SESSION_CLEANUP_INTERVAL=60000   # Session cleanup interval (ms)

# Token Configuration
TOKEN_EXPIRY=300                 # Access token expiry (seconds, 5 min)
REFRESH_TOKEN_EXPIRY=604800      # Refresh token expiry (seconds, 7 days)

# Logging
LOG_LEVEL=info                   # Log level (error, warn, info, debug)

# Rate Limiting
RATE_LIMIT_MAX=100               # Max requests per window
RATE_LIMIT_WINDOW=60000          # Time window (ms)

# HTTPS
FORCE_HTTPS=true                 # Force HTTPS in production
```

### Generating Secrets

**CRITICAL:** Never use weak or default secrets in production!

```bash
# Generate JWT secret (32+ characters)
openssl rand -base64 32

# Generate cookie secret (different from JWT)
openssl rand -base64 32
```

**Best Practices:**

- Use different secrets for JWT and cookies
- Rotate secrets every 90 days
- Store secrets in environment variables or secret management service
- Never commit secrets to version control
- Use strong random values (32+ characters)

---

## Production Configuration

### Server Configuration

```typescript
// server.ts
import Fastify from 'fastify';

const fastify = Fastify({
	logger: {
		level: process.env.LOG_LEVEL || 'info',
		// Use structured logging in production
		serializers: {
			req: req => ({
				method: req.method,
				url: req.url,
				headers: req.headers,
				remoteAddress: req.ip,
			}),
		},
	},
	// Trust proxy for correct IP addresses
	trustProxy: true,
	// Disable powered-by header
	disableRequestLogging: false,
});

// Register plugins
await fastify.register(require('@fastify/helmet'), {
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'self'"],
			styleSrc: ["'self'", "'unsafe-inline'"],
			scriptSrc: ["'self'"],
			imgSrc: ["'self'", 'data:', 'https:'],
			connectSrc: ["'self'", 'ws:', 'wss:'],
		},
	},
});

await fastify.register(require('@fastify/cors'), {
	origin: process.env.FRONTEND_URL,
	credentials: true,
});

// Start server
const port = parseInt(process.env.PORT || '3000', 10);
const host = process.env.HOST || '0.0.0.0';

await fastify.listen({ port, host });
console.log(`Server listening on ${host}:${port}`);
```

### Cookie Configuration

Production cookies MUST have secure flags:

```typescript
const isProduction = process.env.NODE_ENV === 'production';

reply.setCookie('access_token', token, {
	httpOnly: true, // Cannot be accessed via JavaScript
	secure: isProduction, // HTTPS only in production
	sameSite: 'strict', // CSRF protection
	path: '/',
	maxAge: 300, // 5 minutes
});
```

### Database Connection

Use connection pooling in production:

```typescript
import { Pool } from 'pg';

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	max: 20, // Maximum pool size
	idleTimeoutMillis: 30000, // Close idle connections
	connectionTimeoutMillis: 2000,
});
```

---

## HTTPS Requirements

### Why HTTPS is Required

1. Cookies with `secure` flag only sent over HTTPS
2. WebSocket upgrades require secure connections (wss://)
3. Prevents man-in-the-middle attacks
4. Required for modern browser features

### Certificate Setup

**Option 1: Let's Encrypt (Free)**

```bash
# Install certbot
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone -d yourdomain.com

# Certificate files:
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/yourdomain.com/privkey.pem
```

**Option 2: Commercial Certificate**

Purchase from certificate authority (CA) and follow their instructions.

### Fastify HTTPS Configuration

```typescript
import Fastify from 'fastify';
import fs from 'fs';

const fastify = Fastify({
	https: {
		key: fs.readFileSync('/path/to/privkey.pem'),
		cert: fs.readFileSync('/path/to/fullchain.pem'),
	},
});
```

### Reverse Proxy (Nginx)

**Recommended:** Use Nginx as reverse proxy for HTTPS termination.

```nginx
# /etc/nginx/sites-available/yourdomain.com

server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # WebSocket upgrade support
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeout
        proxy_read_timeout 86400;
    }

    # API endpoints
    location /api {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend (if serving from same domain)
    location / {
        root /var/www/yourdomain.com;
        try_files $uri $uri/ /index.html;
    }
}
```

**Enable configuration:**

```bash
sudo ln -s /etc/nginx/sites-available/yourdomain.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## CORS Configuration

### Same-Origin Deployment

**Recommended:** Deploy frontend and backend on same domain.

```
Frontend: https://yourdomain.com
Backend:  https://yourdomain.com/api
WebSocket: wss://yourdomain.com/ws
```

**CORS Configuration:**

```typescript
await fastify.register(require('@fastify/cors'), {
	origin: true, // Allow same origin
	credentials: true,
});
```

### Cross-Origin Deployment

If frontend and backend on different domains:

```
Frontend: https://app.yourdomain.com
Backend:  https://api.yourdomain.com
```

**CORS Configuration:**

```typescript
await fastify.register(require('@fastify/cors'), {
	origin: process.env.FRONTEND_URL || 'https://app.yourdomain.com',
	credentials: true, // CRITICAL: Allow cookies
	methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
	allowedHeaders: ['Content-Type', 'Authorization'],
	exposedHeaders: ['Content-Range', 'X-Content-Range'],
	maxAge: 86400, // Cache preflight requests for 24h
});
```

**Cookie SameSite Configuration:**

For cross-origin, cookies must use `sameSite: 'none'`:

```typescript
reply.setCookie('access_token', token, {
	httpOnly: true,
	secure: true, // REQUIRED with sameSite: 'none'
	sameSite: 'none', // Allow cross-origin
	path: '/',
	maxAge: 300,
});
```

**WARNING:** `sameSite: 'none'` reduces CSRF protection. Consider using `sameSite: 'lax'` or deploy on same domain.

---

## Scaling Considerations

### Single Instance

Simplest deployment, suitable for small to medium traffic:

```
┌──────────────┐
│   Nginx      │
│  (HTTPS)     │
└──────┬───────┘
       │
┌──────▼───────┐
│   Node.js    │
│  (Fastify)   │
└──────────────┘
```

### Multiple Instances

For higher traffic, use multiple instances behind load balancer:

```
                ┌──────────────┐
                │ Load Balancer│
                │   (Nginx)    │
                └──────┬───────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
    ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
    │ Node.js │   │ Node.js │   │ Node.js │
    │ (Port   │   │ (Port   │   │ (Port   │
    │  3000)  │   │  3001)  │   │  3002)  │
    └─────────┘   └─────────┘   └─────────┘
```

**Load Balancer Configuration (Nginx):**

```nginx
upstream backend {
    # IP hash ensures same user goes to same server
    # Important for WebSocket sticky sessions
    ip_hash;

    server localhost:3000;
    server localhost:3001;
    server localhost:3002;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # ... SSL configuration ...

    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Scaling Challenges

**Problem 1: WebSocket sessions not shared**

Each Node.js instance has its own in-memory sessions. User on instance 1 won't receive events from instance 2.

**Solution: Redis-backed session storage**

```typescript
// TODO: Implement Redis-backed WebSocketSessionManager
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Store sessions in Redis instead of Map
// All instances share same session data
```

**Problem 2: Event broadcasting only within instance**

Events broadcast on instance 1 won't reach clients on instance 2.

**Solution: Redis pub/sub for event broadcasting**

```typescript
// TODO: Implement Redis pub/sub for events
const redis = new Redis(process.env.REDIS_URL);

// Instance 1: Publish event
redis.publish(
	'events',
	JSON.stringify({
		type: 'task:created',
		data: task,
	})
);

// Instance 2: Subscribe and broadcast locally
redis.subscribe('events');
redis.on('message', (channel, message) => {
	const event = JSON.parse(message);
	this.transportServer.broadcast(event.type, event.data);
});
```

### Process Manager (PM2)

Use PM2 to manage multiple instances:

```bash
# Install PM2
npm install -g pm2

# Start with multiple instances
pm2 start dist/server.js -i 4  # 4 instances

# Or use ecosystem file
pm2 start ecosystem.config.js
```

**ecosystem.config.js:**

```javascript
module.exports = {
	apps: [
		{
			name: 'api-server',
			script: './dist/server',
			instances: 4, // Number of instances
			exec_mode: 'cluster', // Cluster mode
			env: {
				NODE_ENV: 'production',
				PORT: 3000,
			},
		},
	],
};
```

**PM2 Commands:**

```bash
# List processes
pm2 list

# Monitor
pm2 monit

# Logs
pm2 logs

# Restart
pm2 restart api-server

# Stop
pm2 stop api-server

# Delete
pm2 delete api-server
```

---

## Monitoring and Alerting

### Health Checks

**Endpoint:** `GET /api/monitoring/transport/health`

```bash
# Basic health check
curl https://yourdomain.com/api/monitoring/transport/health
```

**Response:**

```json
{
	"transport": "ok",
	"auth": "ok",
	"connectedClients": 42,
	"uptime": 3600000,
	"timestamp": 1234567890000
}
```

**Load Balancer Integration:**

```nginx
upstream backend {
    server localhost:3000;
    server localhost:3001;
    server localhost:3002;

    # Health check
    check interval=10000 rise=2 fall=3 timeout=5000;
    check_http_send "GET /api/monitoring/transport/health HTTP/1.0\r\n\r\n";
    check_http_expect_alive http_2xx http_3xx;
}
```

### Metrics Collection

**Endpoint:** `GET /api/monitoring/transport/stats`

**Recommended Tools:**

- Prometheus + Grafana
- DataDog
- New Relic
- Custom monitoring script

**Example Monitoring Script:**

```bash
#!/bin/bash

# Monitor script - run every minute via cron
HEALTH_URL="https://yourdomain.com/api/monitoring/transport/health"
STATS_URL="https://yourdomain.com/api/monitoring/transport/stats"

# Check health
HEALTH=$(curl -s $HEALTH_URL | jq -r '.transport')

if [ "$HEALTH" != "ok" ]; then
    echo "ALERT: Transport health check failed"
    # Send alert (email, Slack, PagerDuty, etc.)
fi

# Check connected clients
CLIENTS=$(curl -s $STATS_URL | jq -r '.connectedClients')

if [ $CLIENTS -gt 1000 ]; then
    echo "WARNING: High number of connected clients: $CLIENTS"
fi

# Check sessions per user
AVG_SESSIONS=$(curl -s $STATS_URL | jq -r '.avgSessionsPerUser')

if (( $(echo "$AVG_SESSIONS > 5" | bc -l) )); then
    echo "WARNING: High average sessions per user: $AVG_SESSIONS"
    echo "Possible bot activity or session leak"
fi
```

### Logging

**Structured Logging with Pino:**

```typescript
const logger = pino({
	level: process.env.LOG_LEVEL || 'info',
	formatters: {
		level: label => ({ level: label }),
	},
	timestamp: pino.stdTimeFunctions.isoTime,
});

// Log with context
logger.info({ userId, action: 'login' }, 'User logged in');
logger.error({ error, taskId }, 'Failed to create task');
```

**Log Aggregation:**

Use centralized logging:

- ELK Stack (Elasticsearch, Logstash, Kibana)
- Splunk
- CloudWatch Logs (AWS)
- Google Cloud Logging

### Alerts

Set up alerts for:

| Metric                    | Threshold              | Action                                |
| ------------------------- | ---------------------- | ------------------------------------- |
| Health check failing      | 2 consecutive failures | Page on-call engineer                 |
| Connected clients         | >1000                  | Investigate, prepare to scale         |
| CPU usage                 | >80% for 5min          | Scale up instances                    |
| Memory usage              | >85%                   | Investigate memory leak               |
| Failed logins             | >10 per minute         | Possible attack, enable rate limiting |
| Average sessions per user | >5                     | Possible bot or session leak          |

---

## Troubleshooting

### Problem: WebSocket connections failing

**Symptoms:**

- "Authentication failed" errors
- Connections immediately close

**Check:**

```bash
# 1. Verify cookies are set
curl -c cookies.txt https://yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# 2. Check cookies
cat cookies.txt

# 3. Test WebSocket with cookies
wscat -c wss://yourdomain.com/ws --header "Cookie: access_token=..."
```

**Common Causes:**

- CORS not allowing credentials
- Secure flag but not using HTTPS
- Cookie path incorrect
- Proxy not forwarding cookies

---

### Problem: High memory usage

**Symptoms:**

- Memory usage grows over time
- Out of memory errors

**Check:**

```bash
# 1. Check session count
curl https://yourdomain.com/api/monitoring/transport/stats | jq

# 2. Heap snapshot
node --inspect dist/server.js
# Chrome DevTools → Memory → Take snapshot
```

**Common Causes:**

- Expired sessions not cleaned up
- Event listener memory leaks
- Unsubscribed event handlers
- Large objects in session storage

**Fix:**

- Verify cleanup interval running
- Check session expiration logic
- Profile with Chrome DevTools
- Review event handler cleanup

---

### Problem: Events not received

**Symptoms:**

- Frontend not updating in real-time
- Some clients receive events, others don't

**Check:**

```bash
# 1. Check subscriptions
curl https://yourdomain.com/api/monitoring/transport/sessions \
  --cookie "access_token=..." | jq

# 2. Check broadcast code
grep "eventBroadcaster.broadcast" src/**/*.ts
```

**Common Causes:**

- Client not subscribed to event type
- Event type mismatch (typo)
- Subscription filtering too strict
- Multi-instance without Redis pub/sub

---

### Problem: Token expired immediately

**Symptoms:**

- Login succeeds but token expires instantly
- "Access token expired" errors

**Check:**

```bash
# 1. Check system time
date

# 2. Check token expiration
curl https://yourdomain.com/api/auth/session \
  --cookie "access_token=..." | jq '.expiresAt'

# 3. Compare timestamps
echo "Server time: $(date +%s)000"
echo "Token expires: <expiresAt from above>"
```

**Common Causes:**

- Clock skew between frontend/backend
- Incorrect timezone
- Wrong exp claim in JWT
- Cookie maxAge vs JWT exp mismatch

---

## Deployment Checklist

### Pre-Deployment

- [ ] All environment variables set
- [ ] Secrets generated and stored securely
- [ ] Database migrations run
- [ ] HTTPS certificate configured
- [ ] CORS settings configured
- [ ] Build successful (`npm run build`)
- [ ] Tests passing (`npm test`)
- [ ] Security audit passed (`npm audit`)

### Deployment

- [ ] Code deployed to server
- [ ] Dependencies installed (`npm ci --production`)
- [ ] Environment variables configured
- [ ] Database connected
- [ ] Server started
- [ ] Health check passing
- [ ] WebSocket connections working

### Post-Deployment

- [ ] Monitor logs for errors
- [ ] Check metrics (CPU, memory, connections)
- [ ] Test authentication flow
- [ ] Test real-time events
- [ ] Verify HTTPS certificate
- [ ] Test from different devices
- [ ] Check browser console for errors
- [ ] Monitor for 24 hours

### Rollback Plan

If deployment fails:

1. Stop new server
2. Revert to previous version
3. Restart old server
4. Verify functionality
5. Investigate issue
6. Fix and redeploy

---

## Docker Deployment

**Dockerfile:**

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy built files
COPY dist ./dist

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3000/api/monitoring/transport/health',(r)=>{process.exit(r.statusCode===200?0:1)})"

# Start server
CMD ["node", "dist/server.js"]
```

**docker-compose.yml:**

```yaml
version: '3.8'

services:
    api:
        build: .
        ports:
            - '3000:3000'
        environment:
            - NODE_ENV=production
            - JWT_SECRET=${JWT_SECRET}
            - COOKIE_SECRET=${COOKIE_SECRET}
            - DATABASE_URL=${DATABASE_URL}
        restart: unless-stopped
        healthcheck:
            test: ['CMD', 'curl', '-f', 'http://localhost:3000/api/monitoring/transport/health']
            interval: 30s
            timeout: 3s
            retries: 3

    nginx:
        image: nginx:alpine
        ports:
            - '80:80'
            - '443:443'
        volumes:
            - ./nginx.conf:/etc/nginx/nginx.conf:ro
            - /etc/letsencrypt:/etc/letsencrypt:ro
        depends_on:
            - api
        restart: unless-stopped
```

---

## References

- [Security Guide](./SECURITY.md)
- [Transport Layer Documentation](./TRANSPORT_LAYER.md)
- [API Reference](../../shared-frontend-backend/docs/API_REFERENCE.md)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [PM2 Documentation](https://pm2.keymetrics.io/)
- [Docker Documentation](https://docs.docker.com/)
