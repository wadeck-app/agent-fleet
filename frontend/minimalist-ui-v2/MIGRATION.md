# minimalist-ui v2 - shadcn/ui + Framer Motion Migration

## Overview

This document describes the migration from Radix UI primitives to shadcn/ui components with Framer Motion animations while maintaining the minimalist design philosophy.

## What Changed

### Dependencies Added
- **shadcn/ui ecosystem:**
  - `class-variance-authority` - For variant-based component styling
  - `tailwind-merge` - For merging Tailwind classes
  - `lucide-react` - Icon library (shadcn/ui standard)
  - `@radix-ui/react-label` - Label primitive for forms
  - `@radix-ui/react-slot` - Slot primitive for composition

- **Build tools:**
  - `tailwindcss` - Utility-first CSS framework
  - `postcss` - CSS processing
  - `autoprefixer` - CSS vendor prefixing
  - `@types/node` - Node.js types for path resolution

- **Framer Motion** was already present and is now fully integrated

### Dependencies Removed
- `@radix-ui/react-accordion`
- `@radix-ui/react-dropdown-menu`
- `@radix-ui/react-separator`
- `@radix-ui/react-switch`
- `@radix-ui/react-toast`

Note: Dialog and Select primitives from Radix UI are still used as the foundation for shadcn/ui components.

## Component Migrations

### 1. Button Component
**Before:** Custom SCSS with manual variant classes
**After:** shadcn/ui button with CVA (class-variance-authority)

**Key Changes:**
- Integrated Tailwind utility classes
- Added Framer Motion hover/tap animations
- Backward compatibility: `primary` → `default`, `danger` → `destructive`, `md` → `default`
- Added `asChild` prop for polymorphic usage

**Animation:**
```typescript
whileHover={{ scale: 1.02 }}
whileTap={{ scale: 0.98 }}
transition={{ duration: 0.15 }}
```

### 2. Card Component
**Before:** Simple div with SCSS modules
**After:** shadcn/ui card with motion wrapper

**Key Changes:**
- Added Card subcomponents: `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`
- Interactive cards now have subtle Y-axis animation on hover
- Maintains `elevated` and `interactive` props

**Animation:**
```typescript
whileHover={interactive ? { y: -2 } : undefined}
transition={{ duration: 0.2 }}
```

### 3. Badge Component
**Before:** Span with SCSS variant classes
**After:** shadcn/ui badge with entry animations

**Key Changes:**
- CVA-based variants with consistent color palette
- Added `success`, `warning`, `error`, `info` variants matching existing design
- Dot indicator animates separately for staggered effect

**Animations:**
```typescript
// Badge entry
initial={{ scale: 0.8, opacity: 0 }}
animate={{ scale: 1, opacity: 1 }}

// Dot indicator
initial={{ scale: 0 }}
animate={{ scale: 1 }}
transition={{ delay: 0.1 }}
```

### 4. Input Component
**Before:** Custom input with wrapper div
**After:** shadcn/ui input with Tailwind styling

**Key Changes:**
- Removed dependency on SCSS modules
- Integrated form label styling
- Error state styling via `border-destructive`

### 5. Dialog Component (NEW)
**Created:** shadcn/ui Dialog wrapper with Framer Motion

**Features:**
- Animated overlay and content
- Auto-positioning close button
- `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription` subcomponents

**Animation:**
```typescript
initial={{ opacity: 0, scale: 0.95, y: 10 }}
animate={{ opacity: 1, scale: 1, y: 0 }}
exit={{ opacity: 0, scale: 0.95, y: 10 }}
transition={{ duration: 0.2 }}
```

### 6. Select Component (NEW)
**Created:** shadcn/ui Select wrapper with animations

**Features:**
- Animated dropdown content
- Check icon for selected items
- Scroll buttons for long lists

### 7. NewTaskDialog
**Before:** Radix UI Dialog with native select elements
**After:** shadcn/ui Dialog with Select components

**Key Changes:**
- Form fields animate in sequence
- Priority and Flow dropdowns use shadcn Select
- Staggered animation for better UX

**Animation Sequence:**
1. Description input (delay: 0.1s)
2. Priority/Flow selects (delay: 0.15s)
3. Action buttons (delay: 0.2s)

### 8. TaskList & WorkerList
**Before:** Static list rendering
**After:** AnimatePresence with staggered entry/exit

**Key Changes:**
- Each card animates in with staggered delay
- Internal elements (badges, metadata) have sub-animations
- Exit animations for removed items
- Layout animations for reordering

**TaskList Animation Pattern:**
```typescript
// Card container
initial={{ opacity: 0, y: 20 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, scale: 0.95 }}
transition={{ delay: index * 0.05 }}

// Badges
initial={{ opacity: 0, x: -10 }}
animate={{ opacity: 1, x: 0 }}
transition={{ delay: index * 0.05 + 0.2 }}
```

**WorkerList Animation Pattern:**
```typescript
// Card container
initial={{ opacity: 0, x: -20 }}
animate={{ opacity: 1, x: 0 }}
transition={{ delay: index * 0.08 }}

// Active task indicator (conditional)
initial={{ opacity: 0, height: 0 }}
animate={{ opacity: 1, height: 'auto' }}
```

### 9. Spinner Component
**Before:** SCSS keyframe animation
**After:** Tailwind `animate-spin` utility

**Key Changes:**
- Simplified to border-based spinner
- Fade-in animation on mount
- Size variants via Tailwind classes

## Styling Architecture

### Theme System
The existing SCSS theme variables are preserved and extended with shadcn/ui HSL color tokens:

```scss
// Original theme variables (unchanged)
--color-bg-primary: #ffffff;
--color-text-primary: #0f172a;
// ... etc

// Added shadcn/ui tokens
--background: 0 0% 100%;
--foreground: 222.2 84% 4.9%;
--primary: 262.1 83.3% 57.8%;
// ... etc
```

### Tailwind + SCSS Coexistence
- **Tailwind** for component utilities and shadcn/ui integration
- **SCSS modules** preserved for feature-specific styling (TaskList, WorkerList layout)
- Global SCSS for theme variables and design tokens

## Animation Philosophy

All animations follow minimalist principles:

1. **Subtle & Fast:** Durations between 0.15s - 0.3s
2. **Purpose-Driven:** Animations provide feedback or guide attention
3. **Staggered Delays:** Create natural flow without overwhelming
4. **Conditional:** Interactive elements only animate when appropriate
5. **Performance:** Use transform/opacity for GPU acceleration

## Backward Compatibility

### Maintained Props
All original component props are supported:
- Button: `variant`, `size`, `fullWidth`
- Card: `elevated`, `interactive`
- Badge: `variant`, `dot`
- Input: `label`, `error`, `fullWidth`

### Variant Aliases
- `primary` → `default` (Button)
- `danger` → `destructive` (Button)
- `md` → `default` (Button size)

## Build Configuration

### New Files
- `tailwind.config.js` - Tailwind configuration with shadcn/ui tokens
- `postcss.config.js` - PostCSS setup for Tailwind processing
- `components.json` - shadcn/ui CLI configuration
- `src/lib/utils.ts` - `cn()` utility for class merging

### Updated Files
- `tsconfig.json` - Added `types: ["node"]` for path resolution
- `src/styles/globals.scss` - Added Tailwind directives
- `src/styles/theme.scss` - Added shadcn/ui HSL color tokens

## Testing Checklist

- [ ] Button variants render correctly
- [ ] Card hover animations work
- [ ] Badge variants display proper colors
- [ ] Input focus states work
- [ ] Dialog opens/closes smoothly
- [ ] Select dropdowns animate properly
- [ ] TaskList cards stagger on render
- [ ] WorkerList animations work
- [ ] Spinner displays during loading
- [ ] Dark mode still functions (if implemented)
- [ ] Mobile responsive layouts intact

## Performance Notes

### Animation Performance
- All animations use `transform` and `opacity` (GPU-accelerated)
- `AnimatePresence` with `mode="popLayout"` prevents layout thrashing
- Stagger delays are minimal (50-80ms) to avoid perceived lag

### Bundle Size Impact
- Added: ~100KB (Tailwind base + shadcn components)
- Removed: ~50KB (old Radix primitives)
- Framer Motion: Already present
- Net increase: ~50KB gzipped

## Migration Commands

```bash
# Install new dependencies
cd frontend/minimalist-ui
npm install

# Build the project
npm run build

# Run development server
npm run dev

# Type check
npm run type-check
```

## Future Enhancements

Potential improvements while maintaining minimalism:

1. **Accessibility:** Add focus-visible states to all interactive elements
2. **Reduced Motion:** Respect `prefers-reduced-motion` media query
3. **Toast Notifications:** Add shadcn/ui Toast component
4. **Loading States:** Skeleton components for better perceived performance
5. **Micro-interactions:** Subtle scale/rotate on icon buttons

## Resources

- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [Framer Motion API](https://www.framer.com/motion/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Class Variance Authority](https://cva.style/)
