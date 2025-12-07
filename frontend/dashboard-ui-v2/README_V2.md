# Agent Fleet Dashboard UI - Version 2.0

> Modern dashboard interface powered by shadcn/ui and Framer Motion

## What's New in v2.0

This version brings significant improvements to the dashboard UI:

- **shadcn/ui Integration**: Component architecture based on shadcn/ui patterns
- **Framer Motion Animations**: Smooth, performant animations throughout
- **Enhanced Accessibility**: Better ARIA support and keyboard navigation
- **Type-Safe Variants**: Using class-variance-authority for type safety
- **Improved DX**: Better developer experience with composition patterns

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Architecture

### Component Hierarchy

```
src/
├── components/
│   ├── ui/              # Generic reusable components
│   │   ├── Button/      # shadcn/ui + Framer Motion
│   │   ├── Card/        # shadcn/ui + Framer Motion
│   │   ├── Badge/       # shadcn/ui patterns
│   │   └── Input/       # Radix Label + accessibility
│   ├── features/        # Feature-specific components
│   │   ├── WorkerCard/  # With animations
│   │   ├── TaskQueue/
│   │   ├── TaskForm/
│   │   ├── SystemHealth/
│   │   ├── ActivityLog/
│   │   └── Settings/
│   └── layout/          # Layout components
│       └── DashboardLayout/
├── pages/               # Page compositions
│   └── DashboardPage/   # With page-level animations
├── lib/
│   ├── api/             # API layer (client → repository → service → hook)
│   ├── hooks/           # Custom React hooks
│   └── utils.ts         # Utility functions (cn)
├── styles/              # Global styles and themes
└── types/               # TypeScript type definitions
```

### Key Patterns

#### shadcn/ui Component Pattern
```tsx
// Example: Button component
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(baseClass, {
  variants: { /* ... */ },
  defaultVariants: { /* ... */ }
});

export const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  // Component implementation
});
```

#### Framer Motion Integration
```tsx
// Entrance animations
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
>
  {children}
</motion.div>

// Staggered children
<motion.div variants={containerVariants}>
  {items.map(item => (
    <motion.div key={item.id} variants={itemVariants}>
      {item.content}
    </motion.div>
  ))}
</motion.div>
```

## Tech Stack

### Core
- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **SCSS Modules** - Styling

### UI Framework
- **shadcn/ui patterns** - Component architecture
- **Radix UI** - Accessible primitives
- **Framer Motion** - Animations
- **class-variance-authority** - Type-safe variants
- **lucide-react** - Icons

### State & Data
- Custom hooks for state management
- Repository pattern for data access
- Service layer for business logic

## Component Usage

### Button
```tsx
import { Button } from '@/components/ui/Button/Button';

<Button variant="primary" size="md">
  Click Me
</Button>

// With composition
<Button asChild>
  <Link to="/dashboard">Go</Link>
</Button>
```

### Card
```tsx
import { Card } from '@/components/ui/Card/Card';

<Card interactive elevated>
  {/* Auto-animates on mount */}
  <h3>Card Title</h3>
  <p>Content</p>
</Card>
```

### Badge
```tsx
import { Badge } from '@/components/ui/Badge/Badge';

<Badge variant="success" dot>
  Active
</Badge>
```

### Input
```tsx
import { Input } from '@/components/ui/Input/Input';

<Input
  label="Email"
  error={errors.email}
  placeholder="user@example.com"
  fullWidth
/>
```

See [USAGE_EXAMPLES.md](./USAGE_EXAMPLES.md) for comprehensive examples.

## Animation Guidelines

### Timing
- **Fast interactions**: 300ms (clicks, toggles)
- **Entrances**: 400-500ms (cards, sections)
- **Stagger delay**: 100ms (list items)

### Spring Physics
- **Buttons**: `{ stiffness: 400, damping: 17 }`
- **Cards**: `{ stiffness: 300, damping: 20 }`

### Common Patterns
- **Entrance**: `opacity: 0→1, y: 20→0`
- **Exit**: `opacity: 1→0, x: 0→-20`
- **Hover**: `scale: 1.02, y: -4`
- **Tap**: `scale: 0.98`

## File Structure

```
dashboard-ui/
├── src/
│   ├── components/
│   │   ├── ui/                    # Generic components
│   │   ├── features/              # Feature components
│   │   └── layout/                # Layout components
│   ├── pages/                     # Page compositions
│   ├── lib/
│   │   ├── api/
│   │   │   ├── apiClient.ts       # HTTP client
│   │   │   ├── repositories/      # Data access
│   │   │   ├── services/          # Business logic
│   │   │   └── hooks/             # React hooks
│   │   └── utils.ts               # Utilities
│   ├── styles/
│   │   ├── global.scss            # Global styles
│   │   └── theme.scss             # Theme variables
│   └── types/
│       └── index.ts               # Type definitions
├── components.json                # shadcn/ui config
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README_V2.md                   # This file
```

## Development

### Code Style
- Use functional components with hooks
- Prefer composition over inheritance
- Keep components small and focused
- Follow the separation of concerns

### Component Guidelines
- **UI components**: Pure presentation, zero business logic
- **Feature components**: Compose UI components with domain logic
- **Pages**: Pure composition, minimal styling
- **Hooks**: Encapsulate data fetching and state logic

### Testing
```bash
# Run tests (when available)
npm test

# Type check
npm run build  # Runs tsc before build
```

## Configuration

### Path Aliases
```json
{
  "@/*": ["./src/*"]
}
```

### shadcn/ui Config
See `components.json` for shadcn/ui configuration.

### Theme Variables
See `src/styles/theme.scss` for CSS custom properties.

## Browser Support

- Modern browsers with ES2020 support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Performance

### Optimizations
- GPU-accelerated transforms
- Optimized re-renders with React.memo
- Code splitting (when routes added)
- SCSS modules for scoped styles

### Animation Performance
- Uses transform and opacity (GPU-accelerated)
- Avoids layout thrashing
- Smooth 60fps on modern devices

## Migration from v1

No breaking changes! All component APIs remain compatible.

New features:
- `asChild` prop on Button for composition
- Auto-generated IDs on Input
- Enhanced accessibility attributes

See [MIGRATION_NOTES.md](./MIGRATION_NOTES.md) for details.

## Documentation

- [CHANGELOG_V2.md](./CHANGELOG_V2.md) - What changed in v2
- [MIGRATION_NOTES.md](./MIGRATION_NOTES.md) - Technical migration details
- [USAGE_EXAMPLES.md](./USAGE_EXAMPLES.md) - Component usage examples

## Contributing

1. Follow the established architecture patterns
2. Maintain component purity (UI = no business logic)
3. Add proper TypeScript types
4. Keep animations smooth (60fps)
5. Test accessibility

## License

Part of the Agent Fleet project.

## Credits

- [shadcn/ui](https://ui.shadcn.com/) - Component patterns
- [Framer Motion](https://www.framer.com/motion/) - Animations
- [Radix UI](https://www.radix-ui.com/) - Accessible primitives
- [Lucide](https://lucide.dev/) - Icons
