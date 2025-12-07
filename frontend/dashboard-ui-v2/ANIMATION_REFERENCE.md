# Animation Reference - Dashboard UI v2

Complete reference guide for all animations in the application.

## Animation Principles

### Timing
- **Fast interactions**: 300ms (clicks, toggles, hovers)
- **Entrance animations**: 400-500ms (cards, sections)
- **Progress animations**: 500ms (bars, gauges)
- **Stagger delay**: 100ms (between list items)

### Easing
- **Default**: Spring physics with natural bounce
- **Progress bars**: ease-out for smooth deceleration
- **Panel transitions**: Default spring

### Performance
- Uses GPU-accelerated properties only (transform, opacity)
- No animations on width/height (except through transform: scale)
- 60fps target on modern devices

## Component Animations

### Button (`src/components/ui/Button/Button.tsx`)

#### Hover Animation
```tsx
whileHover={{ scale: 1.02 }}
```
- Scale up to 102%
- Applied to all button variants
- Spring: stiffness 400, damping 17

#### Tap Animation
```tsx
whileTap={{ scale: 0.98 }}
```
- Scale down to 98%
- Provides tactile feedback
- Same spring physics

**Visual Effect**: Buttons feel responsive and physical

---

### Card (`src/components/ui/Card/Card.tsx`)

#### Entrance Animation
```tsx
initial={{ opacity: 0, y: 20 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.3 }}
```
- Fades in from invisible
- Slides up 20px
- 300ms duration

#### Interactive Hover (when `interactive` prop)
```tsx
whileHover={{ scale: 1.02, y: -4 }}
transition={{ type: 'spring', stiffness: 300, damping: 20 }}
```
- Scales to 102%
- Lifts up 4px
- Spring physics for natural feel

**Visual Effect**: Cards appear gracefully and respond to interaction

---

### Badge (`src/components/ui/Badge/Badge.tsx`)

**No animations** - Static component for performance

---

### Input (`src/components/ui/Input/Input.tsx`)

**No animations** - Maintains focus for form usability

---

## Feature Component Animations

### WorkerCard (`src/components/features/WorkerCard/WorkerCard.tsx`)

#### Current Task Section
```tsx
initial={{ opacity: 0, height: 0 }}
animate={{ opacity: 1, height: 'auto' }}
transition={{ duration: 0.3 }}
```
- Expands smoothly when task assigned
- Collapses when no task

#### Progress Bar
```tsx
initial={{ width: 0 }}
animate={{ width: `${progress}%` }}
transition={{ duration: 0.5, ease: 'easeOut' }}
```
- Fills from 0 to current progress
- Smooth ease-out timing
- 500ms duration

#### Metrics Grid (Container)
```tsx
initial="hidden"
animate="visible"
variants={{
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
}}
```
- Coordinates child animations
- 100ms stagger between metrics

#### Individual Metrics
```tsx
variants={{
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 }
}}
```
- Each metric fades in and slides up
- Orchestrated by parent

**Visual Effect**: Worker cards reveal information progressively

---

## Page Animations

### DashboardPage (`src/pages/DashboardPage/DashboardPage.tsx`)

#### Panel Transitions (Settings/TaskForm)
```tsx
<AnimatePresence mode="wait">
  {showSettings ? (
    <motion.div
      key="settings"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
    >
  ) : /* ... */}
</AnimatePresence>
```
- Entrance: Slides in from right (x: 20)
- Exit: Slides out to left (x: -20)
- Fades in/out simultaneously
- 300ms transition

#### System Health Section
```tsx
initial={{ opacity: 0, y: 20 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.4 }}
```
- First to animate
- Fades in and slides up
- 400ms duration

#### Workers Section
```tsx
initial={{ opacity: 0, y: 20 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.4, delay: 0.1 }}
```
- 100ms delay after System Health
- Same animation pattern

#### Workers Grid (Container)
```tsx
initial="hidden"
animate="visible"
variants={{
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
}}
```
- Coordinates worker card entrances
- 100ms stagger between cards

#### Individual Worker Cards
```tsx
variants={{
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
}}
```
- Each card fades and slides up
- Staggered by parent

#### Tasks & Activity Section
```tsx
initial={{ opacity: 0, y: 20 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.4, delay: 0.2 }}
```
- 200ms delay (last to animate)
- Same animation pattern

**Visual Effect**: Dashboard loads in logical order with staggered appearance

---

## Animation Sequences

### Page Load Sequence
```
1. System Health (0ms delay)
   └─ Fade in + slide up (400ms)

2. Workers Section (100ms delay)
   └─ Fade in + slide up (400ms)
   └─ Worker Card 1 (stagger: 0ms)
       └─ Fade in + slide up
       └─ Metrics stagger (100ms each)
   └─ Worker Card 2 (stagger: 100ms)
       └─ Fade in + slide up
       └─ Metrics stagger (100ms each)
   └─ Worker Card N...

3. Tasks & Activity (200ms delay)
   └─ Fade in + slide up (400ms)

Total: ~1.5-2s for complete page entrance
```

### Panel Switch Sequence
```
Settings Button Click
└─ Dashboard exits left (300ms)
└─ Settings enters right (300ms)
    └─ AnimatePresence manages transition

Settings Close
└─ Settings exits left (300ms)
└─ Dashboard enters (300ms)
    └─ All sections re-animate
```

---

## Animation Variants Library

### Common Patterns

#### Fade In + Slide Up
```tsx
{
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 }
}
```
Used for: Cards, sections, major UI elements

#### Slide In from Right
```tsx
{
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.3 }
}
```
Used for: Panel entrances

#### Slide Out to Left
```tsx
{
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.3 }
}
```
Used for: Panel exits

#### Stagger Container
```tsx
{
  initial: "hidden",
  animate: "visible",
  variants: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }
}
```
Used for: Lists, grids

#### Stagger Child
```tsx
{
  variants: {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  }
}
```
Used for: List items, grid items

#### Scale on Hover
```tsx
{
  whileHover: { scale: 1.02 },
  transition: { type: 'spring', stiffness: 400, damping: 17 }
}
```
Used for: Interactive elements

#### Scale on Tap
```tsx
{
  whileTap: { scale: 0.98 },
  transition: { type: 'spring', stiffness: 400, damping: 17 }
}
```
Used for: Buttons, clickable items

---

## Spring Physics Reference

### Fast & Snappy (Buttons)
```tsx
{
  type: 'spring',
  stiffness: 400,
  damping: 17
}
```
- Quick response
- Minimal overshoot
- Feels immediate

### Smooth & Natural (Cards)
```tsx
{
  type: 'spring',
  stiffness: 300,
  damping: 20
}
```
- More relaxed
- Slight bounce
- Feels organic

---

## Performance Guidelines

### DO ✓
- Use `transform` for movement (translateX, translateY, scale)
- Use `opacity` for fading
- Animate on GPU-accelerated properties
- Use `will-change: transform` sparingly

### DON'T ✗
- Animate `width` or `height` directly
- Animate `top`, `left`, `right`, `bottom`
- Animate `margin` or `padding`
- Chain too many sequential animations

### Optimization Tips
1. Use `transform: translateX()` instead of `left`
2. Use `transform: scale()` instead of `width`/`height`
3. Keep stagger delays reasonable (<200ms)
4. Limit animated elements per view (<50)

---

## Accessibility Considerations

### Reduced Motion
Consider adding:
```tsx
import { useReducedMotion } from 'framer-motion';

const shouldReduceMotion = useReducedMotion();
const transition = shouldReduceMotion ? { duration: 0 } : { duration: 0.3 };
```

### Focus Management
- Animations don't interfere with focus states
- Keyboard navigation works during animations
- Screen readers announce state changes

---

## Debugging Animations

### Chrome DevTools
1. Open Performance tab
2. Record while animating
3. Look for 60fps green bars
4. Check for layout shifts (red)

### Framer Motion DevTools
```tsx
// Add to component for debugging
<motion.div debug>
  {children}
</motion.div>
```

### Console Logging
```tsx
<motion.div
  animate={{ opacity: 1 }}
  onAnimationStart={() => console.log('Animation started')}
  onAnimationComplete={() => console.log('Animation completed')}
>
```

---

## Custom Animation Examples

### Bounce Effect
```tsx
<motion.div
  animate={{ y: [0, -10, 0] }}
  transition={{
    duration: 0.5,
    times: [0, 0.5, 1],
    repeat: Infinity,
    repeatDelay: 1
  }}
>
  Bouncing!
</motion.div>
```

### Rotate on Hover
```tsx
<motion.div
  whileHover={{ rotate: 180 }}
  transition={{ duration: 0.3 }}
>
  Rotates!
</motion.div>
```

### Pulse Effect
```tsx
<motion.div
  animate={{ scale: [1, 1.05, 1] }}
  transition={{
    duration: 2,
    repeat: Infinity
  }}
>
  Pulsing!
</motion.div>
```

---

## Summary

- **Total animated components**: 4 UI + 2 Feature + 1 Page
- **Total animation variants**: ~12 distinct patterns
- **Performance target**: 60fps
- **Accessibility**: Keyboard & screen reader friendly
- **Browser support**: Modern browsers with ES2020

All animations follow consistent timing and easing for cohesive UX.
