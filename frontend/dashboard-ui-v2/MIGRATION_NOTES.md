# Dashboard UI v2 - Migration to shadcn/ui + Framer Motion

## Overview
This version of dashboard-ui replaces direct Radix UI usage with shadcn/ui patterns while adding Framer Motion animations throughout the application.

## Key Changes

### 1. Dependencies Added
- `@radix-ui/react-label` - For accessible form labels
- `@radix-ui/react-slot` - For composition patterns
- `class-variance-authority` - For type-safe variant management
- `tailwind-merge` - For merging class names (used with SCSS modules)
- `lucide-react` - Icon library (recommended for shadcn/ui)

### 2. Component Migrations

#### Button (`src/components/ui/Button/Button.tsx`)
- Added `class-variance-authority` for type-safe variants
- Integrated Framer Motion with hover/tap animations
- Added `asChild` prop for composition via Radix Slot
- Animations: Scale on hover (1.02x), scale on tap (0.98x)

#### Card (`src/components/ui/Card/Card.tsx`)
- Converted to `forwardRef` for better ref handling
- Added entrance animation (fade + slide up)
- Interactive cards have hover animation (scale + lift)
- Uses CVA for variant management

#### Badge (`src/components/ui/Badge/Badge.tsx`)
- Migrated to shadcn/ui pattern with CVA
- Converted to `forwardRef`
- Maintains all existing variants and dot feature

#### Input (`src/components/ui/Input/Input.tsx`)
- Integrated Radix UI Label for accessibility
- Added proper ARIA attributes (aria-invalid, aria-describedby)
- Auto-generates IDs if not provided
- Error messages have role="alert" for screen readers

### 3. Feature Component Enhancements

#### WorkerCard (`src/components/features/WorkerCard/WorkerCard.tsx`)
- Current task section animates in/out
- Progress bar fills with smooth animation
- Metrics grid uses staggered children animation
- Each metric card fades in sequentially

#### DashboardPage (`src/pages/DashboardPage/DashboardPage.tsx`)
- Added AnimatePresence for smooth panel transitions
- Settings/TaskForm panels slide in from right, exit to left
- Dashboard sections have staggered entrance animations
- Workers grid items animate in sequentially
- System Health section fades in first
- Tasks/Activity sections follow with delay

### 4. New Utilities

#### `src/lib/utils.ts`
- `cn()` function combines clsx and tailwind-merge
- Works seamlessly with SCSS modules
- Type-safe class name merging

### 5. Configuration

#### `components.json`
- shadcn/ui configuration file
- Points to SCSS global styles
- Configures path aliases (@/components, @/lib/utils)

## Animation Details

### Timing Strategy
- Fast interactions: 0.3s (panel switches)
- Card entrances: 0.4-0.5s
- Stagger delay: 0.1s between children
- Progress bars: 0.5s ease-out

### Spring Physics
- Buttons: stiffness 400, damping 17
- Cards: stiffness 300, damping 20

### Motion Patterns
1. **Entrance**: opacity 0→1, y: 20→0
2. **Exit**: opacity 1→0, x: 0→-20
3. **Hover**: scale 1.02, y: -4
4. **Tap**: scale 0.98

## Architecture Compliance

All changes maintain the established architecture:
- UI components remain pure presentation
- No business logic in UI layer
- Props-based communication
- SCSS modules for styling
- Type-safe variants with CVA

## Breaking Changes

None - all components maintain API compatibility with v1.

## Testing Recommendations

1. Test all button variants and sizes
2. Verify card hover states
3. Check input label associations
4. Validate animations don't impact performance
5. Test accessibility (screen readers, keyboard nav)
6. Verify responsive behavior unchanged

## Build Instructions

```bash
# Install new dependencies
npm install

# Build the project
npm run build

# Run dev server
npm run dev
```

## Future Enhancements

Potential additions for future versions:
1. Add more shadcn/ui components (Dialog, DropdownMenu, Select)
2. Create animation presets library
3. Add reduced-motion support
4. Implement skeleton loaders with animations
5. Add page transition animations
