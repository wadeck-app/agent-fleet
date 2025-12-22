# Radix UI Examples

Comprehensive examples for Radix UI composition, styling with Tailwind, and building accessible components in this project.

## Files Overview

### Core Patterns

- **wrapper-pattern.tsx** - Creating component wrappers in `components/ui/`
- **composition.tsx** - Assembling Radix parts into complete components
- **styling.tsx** - Tailwind styling patterns with data attributes
- **as-child.tsx** - asChild pattern for controlling rendered elements
- **accessibility.tsx** - Accessibility best practices

### Component Examples

- **dialog.tsx** - Dialog/Modal component patterns
- **select.tsx** - Select/Dropdown component patterns
- **popover.tsx** - Popover component patterns

### Quick Reference

- **antipatterns.tsx** - Common mistakes with side-by-side fixes

## Key Principles

### Wrapper Pattern

**Always wrap Radix primitives** in `components/ui/`:

- Apply project styling
- Set default props
- Export clean API
- Never use primitives directly in features

### Composition

**Assemble Radix parts:**

- Root (state container)
- Trigger (activation element)
- Portal (render outside DOM hierarchy)
- Overlay (background)
- Content (main content)

### Styling with Tailwind

**Use data attributes:**

- `data-state="open"` / `data-state="closed"`
- `data-disabled`
- `data-highlighted`

**Example:**

```tsx
className = 'data-[state=open]:rotate-180';
```

### asChild Pattern

**Control rendered element:**

```tsx
<Dialog.Trigger asChild>
	<button>Custom button</button>
</Dialog.Trigger>
```

Merges props into child element.

### Accessibility

**Built-in by Radix:**

- ARIA attributes
- Focus management
- Keyboard navigation

**Your responsibility:**

- Provide labels (Title, Description)
- Semantic HTML
- Visible focus states

## Integration with Main Documentation

These examples are referenced from `../RADIX_WOW.md`. The main doc provides conceptual guidance, these files provide runnable code.

## Usage

Copy patterns into your code, adapt to your project styling, always maintain accessibility.
