# Quick Start - Dashboard UI v2

## Installation

```bash
# Navigate to the dashboard-ui directory
cd frontend/dashboard-ui

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:3000`

## What's Different in v2?

### Immediate Visual Changes
- **Smoother animations** throughout the interface
- **Button interactions** with hover and tap effects
- **Card animations** that fade in and lift on hover
- **Panel transitions** that slide in/out smoothly
- **Staggered loading** for worker cards and metrics

### Developer Changes
- New `cn()` utility for class merging
- Components use `class-variance-authority` for variants
- Button has `asChild` prop for composition
- Input has better accessibility with Radix Label

## Testing the New Features

### 1. Test Button Animations
- Hover over any button → should scale to 102%
- Click any button → should scale to 98% during tap
- All variants should animate (primary, secondary, ghost, danger)

### 2. Test Card Animations
- Cards fade in when the page loads
- Hover over worker cards → should lift and scale
- Watch for smooth entrance animations

### 3. Test Panel Transitions
- Click "Settings" button → panel slides in from right
- Click "Add Task" button → panel slides in from right
- Close panels → should slide out to left

### 4. Test Worker Grid
- Workers should appear one-by-one with stagger effect
- Each worker card's metrics should animate in sequentially
- Progress bars should fill smoothly

### 5. Test Accessibility
- Tab through form inputs
- Screen readers should announce labels correctly
- Error messages should be announced
- All interactive elements should be keyboard accessible

## Build for Production

```bash
# Run TypeScript check and build
npm run build

# Preview production build
npm run preview
```

## Common Issues

### TypeScript Errors
If you see TypeScript errors, ensure all dependencies are installed:
```bash
npm install
```

### Missing Animations
If animations don't work:
1. Check browser console for errors
2. Verify Framer Motion is installed: `npm list framer-motion`
3. Clear browser cache

### Style Issues
If styles look broken:
1. Ensure SASS is installed: `npm list sass`
2. Check that SCSS modules are compiling
3. Verify theme variables in `src/styles/theme.scss`

## File Structure Quick Reference

```
src/
├── components/
│   ├── ui/              ← Generic components with animations
│   ├── features/        ← Feature components with animations
│   └── layout/          ← Layout components
├── pages/               ← Page-level animations here
├── lib/
│   ├── utils.ts         ← NEW: cn() utility
│   └── api/             ← Data layer (unchanged)
└── styles/              ← Global styles (unchanged)
```

## Key New Files

- `src/lib/utils.ts` - Utility functions (cn)
- `components.json` - shadcn/ui configuration
- `MIGRATION_NOTES.md` - Technical details
- `USAGE_EXAMPLES.md` - Code examples
- `CHANGELOG_V2.md` - What changed

## Performance Check

Open browser DevTools:
1. Go to Performance tab
2. Record while interacting with UI
3. Check for 60fps during animations
4. Verify no layout thrashing

## Compatibility

Tested on:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Need Help?

1. Check `USAGE_EXAMPLES.md` for component examples
2. See `MIGRATION_NOTES.md` for technical details
3. Review `CHANGELOG_V2.md` for all changes
4. Read `README_V2.md` for comprehensive guide

## Quick Commands

```bash
# Development
npm run dev          # Start dev server

# Production
npm run build        # Build for production
npm run preview      # Preview build

# Code Quality
npm run lint         # Run ESLint
```

## Environment

- Node.js 18+ recommended
- npm 9+ or equivalent
- Modern browser with ES2020 support

## Next Steps

After confirming everything works:

1. Explore component examples in `USAGE_EXAMPLES.md`
2. Customize animations if needed
3. Add new features using established patterns
4. Consider adding tests

## Status Indicators

✓ Dependencies installed
✓ TypeScript compiles
✓ Dev server runs
✓ Animations work
✓ Build succeeds

If all above are ✓, you're ready to go!
