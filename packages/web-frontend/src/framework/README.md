 UI Framework

A comprehensive, reusable UI framework for building modern React applications.

 Overview

This framework provides a well-organized collection of:

- UI Components: Primitives, forms, feedback, loading states, overlays, layouts, tables, etc.
- Features: Forms system, connectivity management, toast notifications, theme management
- Hooks: Custom React hooks for common patterns
- Utilities: Error handling, validation, formatting, export, table helpers
- API: Type-safe API client utilities
- Storage: Storage abstractions (LocalStorage, Cookies)
- Tests: Test utilities for better testing

 Quick Start

```typescript
// Import components directly from their files
import { Button } from '@framework/components/primitives/Button';
import { Card } from '@framework/components/primitives/Card';
import { useAsyncData } from '@framework/hooks/useAsyncData';
```

 Architecture

 Directory Structure

```
framework/
 components/           UI Components
    primitives/       Basic building blocks (Button, Card, Badge, Separator)
    forms/            Form inputs (Input, Select, Switch, RadioGroup, Label)
    feedback/         User feedback (EmptyState, ErrorAlert, Toast, ErrorBoundary)
    loading/          Loading states (LoadingDots, LoadingSpinner)
    overlays/         Overlays (AlertDialog, Dialog, DropdownMenu)
    layout/           Layout components (Page, PageHeader, PageContent)
    table/            Table system with hooks
    pagination/       Pagination components
    search/           Search components
    columns/          Column management
    advanced/         Advanced composites (Field, InputGroup, BulkActionBar)

 features/             Feature-level abstractions

---

_Reference content moved to [docs/reference.md](docs/reference.md)._
