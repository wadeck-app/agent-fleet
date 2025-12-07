# Inventory UI

A modern, responsive inventory management application built with React 19, TypeScript, and Radix UI.

## Features

- **Complete CRUD Operations**: Create, Read, Update, and Delete inventory items
- **Advanced Filtering**: Search by name/description, filter by delivery type, and price range
- **Sortable Columns**: Click column headers to sort by name, quantity, price, or delivery type
- **Multi-Select Operations**: Select multiple items and perform batch delete operations
- **Responsive Design**: Mobile-first design optimized for Pixel 9a (393px) and desktop
- **Dark/Light Themes**: Toggle between dark and light themes with smooth transitions
- **Accessible Components**: All UI components built on Radix UI primitives for accessibility

## Tech Stack

- **React 19** - UI library with modern hooks
- **TypeScript 5.3+** - Type-safe development
- **Radix UI** - Accessible primitive components
- **SCSS Modules** - Component-scoped styling
- **Vite** - Fast build tool and dev server

## Architecture

This application follows the FRONTEND_WOW.md architectural guidelines:

### Component Hierarchy

1. **Generic Components** (`src/components/ui/`)
   - Pure UI components based on Radix UI
   - Zero business logic
   - Components: Button, Input, Table, Dialog, Checkbox, Select

2. **Feature Components** (`src/components/features/`)
   - Domain-specific components
   - Compose generic components
   - Components: InventoryTable, InventoryFilters, InventoryForm, InventoryActionBar

3. **Page Components** (`src/pages/`)
   - Purely compositional
   - Minimal styling (0-5 lines CSS)
   - Component: InventoryPage

4. **Layout Components** (`src/layouts/`)
   - Handle structural positioning
   - Manage responsive behavior
   - Component: MainLayout

### Data Flow

```
InventoryRepository → InventoryService → useInventory hook → Components
```

- **Repository**: Mock data access layer (simulates API calls)
- **Service**: Business logic and data transformation
- **Hook**: Exposes service functionality to components
- **Components**: Pure presentation consuming hooks via props

### State Management

- State managed at page level (InventoryPage)
- Props-based communication between components
- No global state or context (not needed for <4 components)

## Setup Instructions

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Navigate to the project directory:
   ```bash
   cd frontend/inventory-ui
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to the URL shown in the terminal (typically `http://localhost:5173`)

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
frontend/inventory-ui/
├── src/
│   ├── components/
│   │   ├── ui/                          # Generic components (Radix-based)
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Dialog.tsx
│   │   │   ├── Checkbox.tsx
│   │   │   ├── Select.tsx
│   │   │   └── icons/
│   │   └── features/                    # Feature components
│   │       ├── InventoryTable/
│   │       ├── InventoryFilters/
│   │       ├── InventoryForm/
│   │       └── InventoryActionBar/
│   ├── pages/
│   │   └── InventoryPage.tsx           # Main page component
│   ├── layouts/
│   │   └── MainLayout.tsx              # Layout with header and theme toggle
│   ├── hooks/
│   │   └── useInventory.ts             # Custom hook for inventory logic
│   ├── services/
│   │   └── InventoryService.ts         # Business logic
│   ├── repositories/
│   │   └── InventoryRepository.ts      # Data access with mock data
│   ├── types/
│   │   └── inventory.ts                # TypeScript interfaces
│   ├── styles/
│   │   └── theme.scss                  # Global theme variables
│   └── main.tsx                        # Entry point
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

## Usage

### Adding Items

1. Click the "+ Add Item" button in the top right
2. Fill in the form fields:
   - Name (required)
   - Description (required)
   - Quantity (0 or greater)
   - Price (greater than 0)
   - Delivery Type (Air or Land)
3. Click "Add Item" to save

### Filtering Items

- **Search**: Type in the search bar to filter by name or description
- **Delivery Type**: Use the dropdown to filter by Air, Land, or All Types
- **Price Range**: Set min and max price values to filter by price

### Sorting Items

Click on any sortable column header (Name, Quantity, Price, Delivery Type) to sort:
- First click: Sort ascending
- Second click: Sort descending
- Third click: Return to default

### Deleting Items

- **Single Delete**: Click the trash icon on any row
- **Batch Delete**:
  1. Select items using checkboxes
  2. Click "Delete Selected" in the action bar at the bottom
  3. Use the checkbox in the header to select/deselect all items

### Theme Toggle

Click the theme button (🌙/☀️) in the header to switch between dark and light modes.

## Mock Data

The application includes 18 pre-populated inventory items with varied:
- Names and descriptions
- Quantities (0-100)
- Prices ($14.99-$1,299.99)
- Delivery types (Air/Land)

All data is stored in-memory and resets on page refresh.

## Responsive Breakpoints

- **Mobile**: < 768px (default, optimized for Pixel 9a at 393px)
- **Desktop**: >= 768px
- **Large Desktop**: >= 1200px

## Key Design Decisions

1. **No Tests**: Intentionally excluded as this is a mockup/prototype
2. **Mock Data**: No backend integration - repository uses in-memory data
3. **Radix UI**: All generic components built on Radix primitives for accessibility
4. **SCSS Modules**: Component-scoped styling with CSS custom properties for theming
5. **Mobile-First**: Design starts with mobile (393px Pixel 9a) and scales up
6. **Props Over Context**: State passed via props since we have <4 components needing state
7. **Zero Page Styling**: Page component has minimal CSS, delegates to layout and components

## Browser Support

Modern browsers with ES2020 support:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## License

MIT
