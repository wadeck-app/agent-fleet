// @ts-nocheck - Example code, not compiled
// Responsive Design with Tailwind
// Mobile-first approach with breakpoint prefixes

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Tailwind Breakpoints:
 * - Mobile: < 640px (default, no prefix)
 * - sm: >= 640px
 * - md: >= 768px
 * - lg: >= 1024px
 * - xl: >= 1280px
 * - 2xl: >= 1536px
 *
 * Mobile baseline: Pixel 9a (393px × 851px)
 */

/**
 * Example 1: Responsive Grid Layout
 * - 1 column on mobile
 * - 2 columns on tablet (md)
 * - 3 columns on desktop (lg)
 */
export function ResponsiveGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {children}
    </div>
  );
}

/**
 * Example 2: Responsive Navigation
 * - Vertical stack on mobile
 * - Horizontal row on desktop
 */
export function ResponsiveNav() {
  return (
    <nav className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-6">
      <a href="/" className="text-sm font-medium hover:text-primary">Home</a>
      <a href="/about" className="text-sm font-medium hover:text-primary">About</a>
      <a href="/contact" className="text-sm font-medium hover:text-primary">Contact</a>
    </nav>
  );
}

/**
 * Example 3: Responsive Sidebar Layout
 * - Full width on mobile
 * - Fixed sidebar on desktop
 */
export function ResponsiveSidebarLayout({
  sidebar,
  children
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Sidebar: full width on mobile, fixed width on desktop */}
      <aside className="w-full lg:w-64 xl:w-80">
        <div className="rounded-lg border bg-card p-4">
          {sidebar}
        </div>
      </aside>

      {/* Main content: flexible */}
      <main className="min-w-0 flex-1">
        {children}
      </main>
    </div>
  );
}

/**
 * Example 4: Responsive Typography
 * - Smaller text on mobile
 * - Larger text on desktop
 */
export function ResponsiveHeading({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-2xl font-bold md:text-3xl lg:text-4xl">
      {children}
    </h1>
  );
}

/**
 * Example 5: Responsive Card
 * - Vertical layout on mobile
 * - Horizontal layout on tablet+
 */
export function ResponsiveCard({
  image,
  title,
  description
}: {
  image: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-card md:flex-row">
      {/* Image: full width on mobile, 1/3 width on desktop */}
      <div className="h-48 md:h-auto md:w-1/3">
        <img src={image} alt={title} className="h-full w-full object-cover" />
      </div>

      {/* Content: stacked */}
      <div className="flex-1 p-4 md:p-6">
        <h3 className="text-lg font-semibold md:text-xl">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">{description}</p>
      </div>
    </div>
  );
}

/**
 * Example 6: Responsive Padding
 * - Less padding on mobile
 * - More padding on desktop
 */
export function ResponsiveContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-screen-xl px-4 py-6 sm:px-6 lg:px-8 lg:py-12">
      {children}
    </div>
  );
}

/**
 * Example 7: Responsive Visibility
 * - Hide on mobile, show on desktop
 * - Show on mobile, hide on desktop
 */
export function ResponsiveVisibility() {
  return (
    <div>
      {/* Desktop only */}
      <div className="hidden lg:block">
        <p>Visible on desktop only</p>
      </div>

      {/* Mobile only */}
      <div className="block lg:hidden">
        <p>Visible on mobile only</p>
      </div>
    </div>
  );
}

/**
 * Example 8: Responsive Button Group
 * - Vertical stack on mobile
 * - Horizontal row on desktop
 */
export function ResponsiveButtonGroup() {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <button className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground sm:w-auto">
        Primary Action
      </button>
      <button className="w-full rounded-md border border-input px-4 py-2 sm:w-auto">
        Secondary Action
      </button>
    </div>
  );
}

/**
 * Example 9: Complex Responsive Layout
 * - 1 column on mobile
 * - 2 columns on tablet
 * - 4 columns on desktop
 * - Different gap sizes per breakpoint
 */
export function ComplexResponsiveGrid({ items }: { items: any[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4 lg:gap-8">
      {items.map((item, index) => (
        <div key={index} className="rounded-lg border bg-card p-4">
          {item}
        </div>
      ))}
    </div>
  );
}

/**
 * Common Patterns Summary:
 *
 * ✅ DO:
 * - Use mobile-first approach (base styles, then breakpoint prefixes)
 * - Test on Pixel 9a dimensions (393px × 851px) as mobile baseline
 * - Use flex/grid with responsive direction changes
 * - Hide/show elements with display utilities
 * - Adjust padding/spacing per breakpoint
 *
 * ❌ AVOID:
 * - Fixed widths that break on mobile
 * - Desktop-first approach (requires more code)
 * - Assuming all mobiles are 375px (test on 393px)
 * - Hardcoded breakpoint values in JavaScript
 */
