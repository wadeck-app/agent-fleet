# Inventory UI Modern

A modern, fully-featured inventory management application built with React 19, TypeScript, Tailwind CSS, ShadcnUI, and Framer Motion. This project demonstrates best practices for frontend architecture following the FRONTEND_WOW.md guidelines with modern tooling.

## Features

### Core Functionality
- **CRUD Operations**: Complete Create, Read, Update, Delete operations for inventory items
- **Advanced Filtering**: Search by name/description with debounce, multi-option delivery type filter, price range filtering
- **Sorting**: Sortable columns (Name, Quantity, Price, Delivery Type) with ascending/descending order
- **Batch Operations**: Multi-select with checkbox, batch delete, "Select All" functionality
- **Real-time Updates**: Instant UI updates with optimistic loading states

### User Experience
- **Smooth Animations**: Framer Motion animations for all interactions
  - Page transitions with fade-in
  - Table row animations (staggered entrance)
  - Modal entrance/exit animations
  - Slide-up action bar when items selected
  - Fade-out on delete
  - Filter panel expansion/collapse
- **Responsive Design**: Mobile-first approach with Tailwind breakpoints
  - Works seamlessly on mobile (393px) to large desktop (1920px+)
  - Adaptive layouts for different screen sizes
  - Hidden columns on mobile for better UX
- **Dark/Light Theme**: Complete theme system with localStorage persistence
  - System preference detection
  - Smooth theme transitions
  - All components themed consistently
- **Toast Notifications**: User feedback for all actions (success/error states)
- **Loading States**: Skeleton screens and spinners for better perceived performance
- **Form Validation**: Client-side validation with helpful error messages

## Tech Stack

### Core
- **React 19** - Latest React with improved performance
- **TypeScript 5.6+** - Type-safe development with strict mode
- **Vite 5** - Lightning-fast build tool and dev server

### Styling & UI
- **Tailwind CSS 3.4** - Utility-first CSS framework
- **ShadcnUI** - High-quality component library built on Radix UI
- **Radix UI** - Accessible, unstyled primitive components
- **Framer Motion 11** - Production-ready animation library
- **Lucide React** - Beautiful, consistent icon set
- **class-variance-authority** - Variant-based component API

### Architecture & Patterns
- **Layered Architecture**: Repository → Service → Hook → Component
- **Component Hierarchy**: Generic → Feature → Page → Layout
- **Type Safety**: Full TypeScript coverage with strict mode
- **No Tests**: Intentionally excluded for mockup purposes (as specified)

## Project Structure

```
frontend/inventory-ui-modern/
├── src/
│   ├── components/
│   │   ├── ui/                      # Generic ShadcnUI components
│   │   │   ├── Button/
│   │   │   ├── Input/
│   │   │   ├── Table/
│   │   │   ├── Dialog/
│   │   │   ├── Checkbox/
│   │   │   ├── Badge/
│   │   │   ├── Select/
│   │   │   ├── Label/
│   │   │   └── Toast/
│   │   ├── features/                # Feature-specific components
│   │   │   ├── InventoryTable/
│   │   │   ├── InventoryFilters/
│   │   │   ├── InventoryForm/
│   │   │   ├── InventoryActionBar/
│   │   │   ├── DeleteConfirmDialog/
│   │   │   └── ThemeToggle/
│   │   └── layout/                  # Layout components
│   │       └── MainLayout/
│   ├── pages/
│   │   └── InventoryPage.tsx        # Main page (compositional)
│   ├── hooks/
│   │   ├── useInventory.ts          # Inventory state management
│   │   ├── useTheme.ts              # Theme management
│   │   └── useToast.ts              # Toast notifications
│   ├── services/
│   │   └── InventoryService.ts      # Business logic layer
│   ├── repositories/
│   │   └── InventoryRepository.ts   # Data access layer (mock)
│   ├── types/
│   │   └── inventory.ts             # TypeScript interfaces
│   ├── lib/
│   │   └── utils.ts                 # Utility functions
│   ├── index.css                    # Global styles & theme variables
│   ├── main.tsx                     # Application entry point
│   └── vite-env.d.ts               # Vite type definitions
├── public/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

## Architecture Decisions

### Following FRONTEND_WOW.md with Modern Adaptations

#### 1. Component Hierarchy (Strictly Followed)
- **Generic Components**: Built on Radix UI primitives, zero business logic
  - Button, Input, Table, Dialog, Checkbox, Badge, Select, Toast, Label
  - Pure presentation, fully reusable
  - Styled with Tailwind CSS (instead of SCSS Modules)
- **Feature Components**: Domain-specific, compose generic components
  - InventoryTable, InventoryFilters, InventoryForm, InventoryActionBar
  - Receive data via props (no direct API calls)
- **Page Components**: Purely compositional, minimal styling
  - InventoryPage manages state and coordinates feature components
  - Zero direct styling, delegates to layout
- **Layout Components**: Handle structural positioning
  - MainLayout manages responsive behavior with Tailwind

#### 2. Data Flow Architecture (Strictly Followed)
```
InventoryRepository (mock API calls)
    ↓
InventoryService (business logic & transformations)
    ↓
useInventory hook (state management, loading/error states)
    ↓
InventoryPage (state coordination)
    ↓
Feature Components (props-based communication)
```

#### 3. State Management Strategy
- **Props Communication**: Components communicate via props only
- **Lifted State**: Shared state managed in InventoryPage
- **No Context**: <4 components sharing state, props are sufficient
- **Custom Hooks**: useInventory, useTheme, useToast for specific concerns

#### 4. Styling with Tailwind (Adapted from SCSS Modules)
- **CSS Variables**: Theme values defined in index.css (like SCSS variables)
- **Utility Classes**: Tailwind utilities for rapid styling
- **Component Variants**: class-variance-authority for variant patterns
- **Dark/Light Theme**: CSS custom properties with .dark class toggle
- **Mobile-First**: All components use responsive Tailwind breakpoints

#### 5. Animations with Framer Motion (New Addition)
- **Page Transitions**: Fade-in on mount
- **List Animations**: Staggered entrance for table rows
- **Modal Animations**: Scale + fade for dialogs
- **Action Bar**: Slide-up from bottom with spring physics
- **Filter Panel**: Height expansion with smooth easing
- **Hover Effects**: Scale transformations on buttons

### Key Architectural Principles Applied

1. **Single Responsibility**: Each component/service has one clear purpose
2. **Dependency Injection**: Services receive repository via constructor
3. **Separation of Concerns**:
   - Repository = Data access only
   - Service = Business logic only
   - Hook = State management only
   - Components = Presentation only
4. **Type Safety**: Full TypeScript coverage with strict mode
5. **No Business Logic in Generic Components**: All generic components are pure UI
6. **Page Components Are Compositional**: InventoryPage has zero styling code

## Setup Instructions

### Prerequisites
- Node.js 18+
- npm 9+ or yarn 1.22+

### Installation

1. Navigate to the project directory:
```bash
cd frontend/inventory-ui-modern
```

2. Install dependencies:
```bash
npm install
```

### Running the Application

#### Development Mode
```bash
npm run dev
```
The application will be available at `http://localhost:3001`

#### Build for Production
```bash
npm run build
```
Built files will be in the `dist/` directory

#### Preview Production Build
```bash
npm run preview
```

#### Type Checking
```bash
npm run type-check
```

#### Linting
```bash
npm run lint
```

## Usage Guide

### Basic Operations

1. **View Inventory**: All items displayed in table on page load
2. **Search**: Type in search bar to filter by name/description (300ms debounce)
3. **Filter by Delivery**: Use dropdown to filter by Air/Land/All
4. **Advanced Filters**: Click "Filters" button to set price range
5. **Sort**: Click column headers to sort (toggle asc/desc)
6. **Add Item**: Click "Add Item" button, fill form, submit
7. **Delete Single**: Click trash icon on row, confirm deletion
8. **Multi-Select**: Check checkboxes, use action bar to batch delete
9. **Toggle Theme**: Click sun/moon icon in header

### Animations to Look For

- Page fade-in on load
- Table rows animate in with stagger effect
- Hover effects on buttons (scale up)
- Click effects on buttons (scale down)
- Modal slide-in from center with scale
- Action bar slides up from bottom when items selected
- Filter panel expands/collapses smoothly
- Rows fade out when deleted
- Toast notifications slide in from corner

### Responsive Breakpoints

- **Mobile** (<768px): Compact layout, hidden description column
- **Tablet** (768px-1024px): Balanced layout
- **Desktop** (1024px+): Full layout with all columns

## Mock Data

The application includes 18 pre-populated inventory items with varied:
- Delivery types (Air/Land)
- Prices ($12.99 - $1299.99)
- Quantities (28 - 500)
- Categories (electronics, furniture, office supplies)

All data is stored in-memory (resets on page refresh).

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Performance Considerations

- **Debounced Search**: 300ms delay prevents excessive filtering
- **Optimistic UI**: Immediate feedback before API response
- **Framer Motion**: GPU-accelerated animations
- **Tailwind CSS**: Optimized utility classes, minimal CSS bundle
- **Vite HMR**: Instant updates during development

## Future Enhancements (Not Implemented)

- Backend API integration
- Pagination for large datasets
- Advanced sorting (multi-column)
- Export to CSV/Excel
- Import from CSV
- Image uploads for items
- Audit log/history
- User authentication
- Role-based permissions
- Unit tests
- Integration tests
- E2E tests with Playwright
- Storybook for component development

## License

This is a demonstration project for the Agent Fleet codebase.

## Architecture Summary

This project demonstrates how to adapt FRONTEND_WOW.md guidelines for modern tooling:

### What We Kept
- ✅ Component hierarchy (Generic → Feature → Page → Layout)
- ✅ Data flow architecture (Repository → Service → Hook → Component)
- ✅ State management with props (no context for small apps)
- ✅ Zero business logic in generic components
- ✅ Purely compositional page components
- ✅ Layout components for responsive behavior
- ✅ Type-safe TypeScript with strict mode

### What We Adapted
- 🔄 SCSS Modules → Tailwind CSS (utility-first approach)
- 🔄 No animations → Framer Motion (modern animation library)
- 🔄 Basic UI → ShadcnUI (high-quality component library)
- 🔄 CSS variables in SCSS → CSS custom properties in Tailwind
- 🔄 Vitest → No tests (mockup-only requirement)

### Modern Enhancements Added
- ✨ Framer Motion animations throughout
- ✨ Dark/light theme with system preference detection
- ✨ Toast notifications for user feedback
- ✨ Advanced filtering with debounce
- ✨ Batch operations with animated action bar
- ✨ Responsive design with mobile-first approach
- ✨ Loading states and error handling
- ✨ Form validation with helpful messages

The result is a modern, production-ready frontend that adheres to architectural best practices while leveraging the latest tooling and design patterns.
