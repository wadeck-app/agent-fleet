# Radix Nova Style Guide

**Last Updated:** 2025-12-15
**Status:** Active - All new components MUST follow these guidelines

## Overview

This project uses **Radix Nova**, the latest shadcn/ui design system based on Radix UI primitives. Radix Nova provides a modern, cohesive design language with:

- **OKLCH color space** for perceptually uniform colors
- **Tailwind CSS 4.x** with `@theme` inline configuration
- **CVA (class-variance-authority)** for type-safe component variants
- **Consistent spacing and sizing patterns**
- **Modern component primitives** from Radix UI 1.4.3

## Core Principles

### 1. Use shadcn/ui Components First

**Always prefer shadcn components over custom implementations:**

```typescript
// ❌ BAD: Manual button
<button className="rounded-md bg-primary px-4 py-2">Click</button>

// ✅ GOOD: shadcn Button
import { Button } from '@/components/ui/Button';
<Button>Click</Button>
```

**Available shadcn components:** Button, Badge, Card, Input, Textarea, Select, Combobox, Label, Separator, AlertDialog, DropdownMenu, Field system, InputGroup

### 2. OKLCH Color Space

All colors use OKLCH (Oklab color space with lightness, chroma, hue):

```css
/* Radix Nova color format */
--color-primary: oklch(0.51 0.23 277);
--color-destructive: oklch(0.67 0.22 16);
```

**Benefits:**

- Perceptually uniform (equal numeric changes = equal visual changes)
- Better hue preservation when adjusting lightness
- More predictable color mixing

**Theme Colors (defined in `packages/frontend/src/index.css`):**

- `background`, `foreground`
- `primary`, `primary-foreground`
- `secondary`, `secondary-foreground`
- `destructive`, `destructive-foreground`
- `muted`, `muted-foreground`
- `accent`, `accent-foreground`
- `card`, `card-foreground`
- `border`, `input`, `ring`

### 3. Explicit Sizing with Tailwind 4

Radix Nova uses explicit heights and asymmetric padding:

```typescript
// ❌ BAD: Uniform padding
<div className="p-4">

// ✅ GOOD: Explicit height + asymmetric padding
<div className="h-12 px-4 py-2.5">
```

**Common Patterns:**

- **Buttons:** `h-8` (default), `h-7` (sm), `h-9` (lg), `h-9` (icon)
- **Inputs:** `h-9` with `px-3 py-1`
- **Table rows:** `h-12` with `px-4 py-2.5`
- **Table headers:** `h-12` with `px-4 py-3` (slightly more vertical for hierarchy)
- **Cards:** `p-6` for card content, `p-3` for compact variants

**More horizontal than vertical padding** creates modern, breathable layouts.

### 4. CVA for Component Variants

Use `class-variance-authority` for type-safe variants:

```typescript
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const componentVariants = cva(
  // Base styles (always applied)
  "inline-flex items-center justify-center rounded-md font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-input hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

type ComponentProps = VariantProps<typeof componentVariants> & {
  className?: string;
};

export function Component({ variant, size, className, ...props }: ComponentProps) {
  return (
    <div className={cn(componentVariants({ variant, size }), className)} {...props} />
  );
}
```

**Benefits:**

- Type-safe variants (autocomplete in IDE)
- Consistent variant naming across components
- Easy to maintain and extend

### 5. Utility: `cn()` for Class Merging

**Always use `cn()` from `@/lib/utils` to merge Tailwind classes:**

```typescript
import { cn } from '@/lib/utils';

// ❌ BAD: Manual string concatenation
<div className={`base-class ${condition ? 'conditional' : ''} ${className}`}>

// ✅ GOOD: cn() utility
<div className={cn("base-class", condition && "conditional", className)}>
```

**What `cn()` does:**

- Uses `clsx` to handle conditional classes
- Uses `tailwind-merge` to resolve conflicts (e.g., `p-4 p-2` → `p-2`)

### 6. Lucide Icons (Not Inline SVG)

Use `lucide-react` for all icons:

```typescript
// ❌ BAD: Inline SVG
<svg className="size-5" fill="none" stroke="currentColor">
  <path d="M6 18L18 6M6 6l12 12" />
</svg>

// ✅ GOOD: Lucide icon
import { X, AlertCircle, Check } from 'lucide-react';
<X className="size-5" />
```

**Benefits:**

- Consistent icon style across the app
- Easier to maintain (just import, no SVG paths)
- Better tree-shaking (only imports used icons)

**Size Classes:** Use `size-{n}` for square icons (e.g., `size-4`, `size-5`)

### 7. Field System for Forms

Use shadcn's Field system for all form inputs:

```typescript
// ❌ BAD: Manual labels and error messages
<div>
  <label htmlFor="email">{label}</label>
  <input id="email" {...props} />
  {error && <span className="text-red-500">{error}</span>}
</div>

// ✅ GOOD: Field system
import { Field, FieldLabel, FieldError } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

<Field>
  <FieldLabel htmlFor="email">Email</FieldLabel>
  <Input id="email" {...props} />
  {error && <FieldError>{error}</FieldError>}
</Field>
```

**Benefits:**

- Consistent spacing and styling
- Accessibility built-in (ARIA attributes)
- Easy to extend with hints, descriptions, etc.

### 8. Dark Mode with `@custom-variant`

Tailwind 4 uses `@custom-variant` for dark mode:

```css
@custom-variant dark (&:is(.dark *));

.dark {
	--background: oklch(0.141 0.005 285.823);
	--foreground: oklch(0.976 0.001 286.375);
	/* ... other dark mode colors */
}
```

**Usage in components:**

```typescript
// Classes automatically work with dark mode via theme variables
<div className="bg-background text-foreground border-border">
```

No need for `dark:` prefix when using theme variables!

## Component Patterns

### Button

**Use shadcn Button with variants:**

```typescript
import { Button } from '@/components/ui/Button';

// Variants
<Button variant="default">Default</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Delete</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon className="size-4" /></Button>
```

**Don't create custom buttons unless absolutely necessary.**

### Cards

**Use shadcn Card for containers:**

```typescript
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    Content goes here
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

### Empty States

**Pattern for empty states:**

```typescript
import { Button } from '@/components/ui/Button';
import { FileText } from 'lucide-react';

<div className="flex flex-col items-center justify-center p-12 text-center">
  <FileText className="mb-4 size-12 text-muted-foreground" />
  <h3 className="mb-2 text-lg font-semibold">No items found</h3>
  <p className="mb-6 max-w-md text-sm text-muted-foreground">
    Get started by creating your first item.
  </p>
  <Button>Create Item</Button>
</div>
```

### Loading States

**Pattern for loading spinners:**

```typescript
import { Loader2 } from 'lucide-react';

// Inline spinner
<Loader2 className="animate-spin size-4" />

// Centered spinner with message
<div className="flex flex-col items-center justify-center p-8">
  <Loader2 className="mb-4 animate-spin size-8 text-primary" />
  <p className="text-sm text-muted-foreground">Loading...</p>
</div>
```

**Use `Loader2` from lucide-react, not custom spinners.**

### Alerts/Errors

**Pattern for error displays:**

```typescript
import { AlertCircle } from 'lucide-react';

<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
  <div className="flex items-start gap-3">
    <AlertCircle className="size-5 shrink-0 text-destructive" />
    <div className="flex-1">
      <p className="text-sm font-medium text-destructive">
        {errorMessage}
      </p>
    </div>
  </div>
</div>
```

**For dialogs, use AlertDialog component from shadcn.**

### Tables

**Table spacing (as of commit 8715d02):**

```typescript
// Header cells
<th className="h-12 px-4 py-3 text-left text-sm font-medium">

// Data cells
<td className="h-12 px-4 py-2.5">
```

**Key points:**

- Explicit height: `h-12` (48px rows)
- Horizontal padding: `px-4` (16px sides)
- Vertical padding: `py-2.5` (10px) for rows, `py-3` (12px) for headers
- Creates modern, compact tables

## Spacing Scale

**Radix Nova preferred spacing:**

| Class  | Size | Usage                             |
| ------ | ---- | --------------------------------- |
| `p-1`  | 4px  | Icon padding, tight spacing       |
| `p-2`  | 8px  | Compact elements                  |
| `p-3`  | 12px | Small cards, list items           |
| `p-4`  | 16px | Default spacing, medium cards     |
| `p-6`  | 24px | Card content, modal padding       |
| `p-8`  | 32px | Large containers                  |
| `p-12` | 48px | Extra large padding, empty states |

**Gaps:**

| Class   | Size | Usage                       |
| ------- | ---- | --------------------------- |
| `gap-2` | 8px  | Icon + text, tight elements |
| `gap-3` | 12px | Form fields, list items     |
| `gap-4` | 16px | Default gap, card sections  |
| `gap-6` | 24px | Large sections              |

## Typography

**Font Family:** Inter Variable (loaded from `@fontsource-variable/inter`)

**Text Sizes:**

| Class       | Size | Usage                  |
| ----------- | ---- | ---------------------- |
| `text-xs`   | 12px | Small labels, captions |
| `text-sm`   | 14px | Body text, form labels |
| `text-base` | 16px | Default body text      |
| `text-lg`   | 18px | Section headings       |
| `text-xl`   | 20px | Page headings          |
| `text-2xl`  | 24px | Large headings         |

**Font Weights:**

| Class           | Weight | Usage              |
| --------------- | ------ | ------------------ |
| `font-normal`   | 400    | Body text          |
| `font-medium`   | 500    | Labels, buttons    |
| `font-semibold` | 600    | Headings, emphasis |

## Border Radius

**Radix Nova uses consistent border radius:**

| Class          | Size | Usage                            |
| -------------- | ---- | -------------------------------- |
| `rounded-md`   | 6px  | Default (buttons, inputs, cards) |
| `rounded-lg`   | 8px  | Large elements, modals           |
| `rounded-full` | 50%  | Pills, avatars, icon buttons     |

## Shadows

**Use Tailwind's default shadow scale:**

| Class       | Usage                           |
| ----------- | ------------------------------- |
| `shadow-sm` | Subtle elevation                |
| `shadow`    | Default shadow (buttons, cards) |
| `shadow-md` | Medium elevation                |
| `shadow-lg` | Dropdowns, modals               |
| `shadow-xl` | High elevation (tooltips)       |

## Animations

**Use `tw-animate-css` for animations:**

```css
@import 'tw-animate-css';
```

**Common animations:**

- `animate-spin` - Loading spinners
- `animate-pulse` - Loading placeholders
- Custom animations defined in `index.css` (e.g., `toast-slide-in`)

## Accessibility

**All Radix Nova components include:**

- Proper ARIA attributes
- Keyboard navigation
- Focus-visible styles (ring)
- Screen reader support

**Focus ring pattern:**

```typescript
className={cn(
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-ring",
  "focus-visible:ring-offset-2"
)}
```

## Migration Checklist

When refactoring components to Radix Nova:

- [ ] Replace custom buttons with `<Button>` from shadcn
- [ ] Replace inline SVG icons with lucide-react icons
- [ ] Use `cn()` for all className merging
- [ ] Adopt CVA for components with variants
- [ ] Use theme colors (e.g., `text-primary`) instead of hardcoded colors
- [ ] Use Field system for form inputs
- [ ] Apply explicit sizing (`h-{n}`) with asymmetric padding
- [ ] Ensure focus-visible styles for keyboard navigation
- [ ] Use `size-{n}` for icon sizing
- [ ] Replace custom animations with tw-animate-css or Tailwind defaults

## Examples

### Before & After: Custom Button

**Before:**

```typescript
<button
  onClick={action.onClick}
  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
>
  {action.label}
</button>
```

**After:**

```typescript
import { Button } from '@/components/ui/Button';

<Button onClick={action.onClick} size="default">
  {action.label}
</Button>
```

### Before & After: Error Display

**Before:**

```typescript
<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
  <div className="flex items-start gap-3">
    <svg className="size-5 text-destructive" fill="none" stroke="currentColor">
      <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <p className="text-sm font-medium text-destructive">{message}</p>
  </div>
</div>
```

**After:**

```typescript
import { AlertCircle } from 'lucide-react';

<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
  <div className="flex items-start gap-3">
    <AlertCircle className="size-5 shrink-0 text-destructive" />
    <p className="text-sm font-medium text-destructive">{message}</p>
  </div>
</div>
```

## References

- **shadcn/ui Documentation:** https://ui.shadcn.com
- **Radix UI Primitives:** https://www.radix-ui.com
- **OKLCH Color Picker:** https://oklch.com
- **Lucide Icons:** https://lucide.dev
- **CVA Documentation:** https://cva.style
- **Tailwind CSS 4:** https://tailwindcss.com/docs

## Questions?

If you're unsure whether a component follows Radix Nova patterns, ask:

1. Does it use shadcn components where available?
2. Does it use theme colors (not hardcoded)?
3. Does it use lucide-react icons (not inline SVG)?
4. Does it use CVA for variants?
5. Does it use explicit sizing with asymmetric padding?

If the answer to any is "no", refactor it!
