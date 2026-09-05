# Reference

_Moved from README -- see [README](../README.md) for the overview._

│   ├── forms/           # Complete form system with field components
│   ├── connectivity/    # Network connectivity & circuit breaker
│   ├── toast/           # Toast notification system
│   └── theme/           # Theme management
│
├── hooks/               # Custom React hooks
│   ├── useMediaQuery    # Responsive design
│   ├── useDocumentTitle # Document title management
│   ├── useAsyncData     # Async data fetching
│   └── useAbortableEffect # Effect with cleanup
│
├── utils/               # Utility functions
│   ├── errors/          # Error handling (AppError, ErrorLogger)
│   ├── validation/      # Validation utilities
│   ├── formatting/      # Formatters (DateFormat)
│   ├── export/          # Export utilities (CSV, JSON)
│   └── table/           # Table utilities
│
├── api/                 # API client utilities
├── storage/             # Storage abstractions
├── tests/               # Test utilities
└── lib/                 # Third-party utilities (cn helper)
```

## Core Concepts

### 1. Dependency Injection

Framework components accept configuration via props, not hard-coded values:

```typescript
// CircuitBreaker example
import { createCircuitBreaker } from '@framework/features/connectivity/CircuitBreakerService';

export const circuitBreakerService = createCircuitBreaker({
	healthCheckEndpoint: `${API_BASE_URL}/health`,
});
```

### 2. Composability

Components are designed to be composed together:

```typescript
import { Card } from '@framework/components/primitives/Card';
import { CardHeader } from '@framework/components/primitives/Card';
import { CardTitle } from '@framework/components/primitives/Card';
import { CardContent } from '@framework/components/primitives/Card';
import { Button } from '@framework/components/primitives/Button';

<Card>
  <CardHeader>
    <CardTitle>My Card</CardTitle>
  </CardHeader>
  <CardContent>
    <Button>Click me</Button>
  </CardContent>
</Card>
```

### 3. Type Safety

Full TypeScript support with comprehensive types:

```typescript
import type { ToastType } from '@framework/features/toast';
import type { ValidationResult, Validator } from '@framework/utils/validation';
```

## Key Features

### Forms System

Complete form system with field components:

```typescript
import { TextField, SelectField, CheckboxField } from '@framework/features/forms';

<TextField
  name="email"
  label="Email"
  validation={[required(), email()]}
/>
```

### Connectivity Management

Network connectivity with circuit breaker pattern:

```typescript
import { ConnectivityProvider, useConnectivity } from '@framework/features/connectivity';

<ConnectivityProvider circuitBreakerService={circuitBreakerService}>
  <App />
</ConnectivityProvider>
```

### Toast Notifications

Centralized toast notification system:

```typescript
import { ToastProvider, useToast } from '@framework/features/toast';

const { showToast } = useToast();
showToast('Success!', 'success');
```

### Theme Management

Dark/light theme support:

```typescript
import { ThemeToggle, useTheme } from '@framework/features/theme';

const { theme, toggleTheme } = useTheme();
```

## Testing

The framework includes test utilities:

```typescript
import { createControllablePromise } from '@framework/tests/createControllablePromise';
import { withMetadata } from '@framework/tests/withMetadata';

const { fn, resolve } = createControllablePromise<[Book], void>();
const book = withMetadata({ title: 'Test', author: 'Author' });
```

## Best Practices

### Import Patterns

```typescript
// ✅ Good - Direct file imports
import { Button } from '@framework/components/primitives/Button';
import { useAsyncData } from '@framework/hooks/useAsyncData';

// ❌ Avoid - Barrel exports are forbidden in this project
// import { Button, useAsyncData } from '@framework';
```

### Component Guidelines

1. **Single Responsibility**: Each component has one clear purpose
2. **Prop-based Configuration**: No hard-coded values
3. **Accessibility**: Follow ARIA guidelines
4. **Responsive**: Mobile-first design
5. **Type Safety**: Full TypeScript types

### Error Handling

```typescript
import { AppError } from '@framework/utils/errors/AppError';
import { createValidationError } from '@framework/utils/errors/AppError';
import { errorLogger } from '@framework/utils/errors/ErrorLogger';

try {
	// ...
} catch (error) {
	errorLogger.logError(error);
	throw createValidationError('Invalid input');
}
```

## Migration Plan

This framework is designed to eventually be extracted into a standalone package for reuse across multiple applications.

For detailed migration planning and phases, see: [Framework Migration Plan](../../../.claude/plans/framework-migration.md)

## Contributing

When contributing to the framework:

1. **Keep it generic**: No app-specific logic
2. **Document thoroughly**: JSDoc for all public APIs
3. **Test comprehensively**: Unit + integration tests
4. **Follow patterns**: Match existing architecture
5. **Update examples**: Keep documentation current

## License

Internal use only. Not for public distribution.
