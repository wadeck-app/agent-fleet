# Dashboard UI v2 - Usage Examples

## Component Usage Guide

### Button Component

#### Basic Usage
```tsx
import { Button } from '@/components/ui/Button/Button';

// Primary button (default)
<Button onClick={handleClick}>
  Click Me
</Button>

// Different variants
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="danger">Delete</Button>

// Different sizes
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>

// Full width
<Button fullWidth>Full Width Button</Button>
```

#### Composition with asChild
```tsx
import { Button } from '@/components/ui/Button/Button';
import { Link } from 'react-router-dom';

// Button as a link (Slot pattern)
<Button asChild variant="primary">
  <Link to="/dashboard">Go to Dashboard</Link>
</Button>

// Button as anchor
<Button asChild variant="secondary">
  <a href="https://example.com" target="_blank">
    External Link
  </a>
</Button>
```

#### With Icons (using lucide-react)
```tsx
import { Button } from '@/components/ui/Button/Button';
import { Plus, Settings, Trash2 } from 'lucide-react';

<Button>
  <Plus size={16} />
  <span>Add Item</span>
</Button>

<Button variant="ghost">
  <Settings size={16} />
  <span>Settings</span>
</Button>

<Button variant="danger">
  <Trash2 size={16} />
  <span>Delete</span>
</Button>
```

### Card Component

#### Basic Usage
```tsx
import { Card } from '@/components/ui/Card/Card';

// Basic card (auto-animates on mount)
<Card>
  <h3>Card Title</h3>
  <p>Card content goes here</p>
</Card>

// Elevated card with shadow
<Card elevated>
  <h3>Elevated Card</h3>
  <p>Has a subtle shadow</p>
</Card>

// Interactive card (hover effects)
<Card interactive onClick={handleClick}>
  <h3>Clickable Card</h3>
  <p>Hover and click me!</p>
</Card>

// Combined
<Card elevated interactive onClick={handleCardClick}>
  <h3>Premium Card</h3>
  <p>Elevated and interactive</p>
</Card>
```

#### Custom Animation Override
```tsx
import { Card } from '@/components/ui/Card/Card';

// Card with custom initial animation
<Card
  initial={{ opacity: 0, scale: 0.9 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ duration: 0.5 }}
>
  <p>Custom animation</p>
</Card>
```

### Badge Component

#### Basic Usage
```tsx
import { Badge } from '@/components/ui/Badge/Badge';

// Default badge
<Badge>Default</Badge>

// Different variants
<Badge variant="success">Active</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="error">Failed</Badge>
<Badge variant="info">Info</Badge>

// With dot indicator
<Badge variant="success" dot>
  Online
</Badge>
```

#### In Context
```tsx
// Status badge in a card header
<div style={{ display: 'flex', justifyContent: 'space-between' }}>
  <h3>Worker Status</h3>
  <Badge variant="success" dot>Active</Badge>
</div>

// Multiple badges
<div style={{ display: 'flex', gap: '0.5rem' }}>
  <Badge variant="info">TypeScript</Badge>
  <Badge variant="info">React</Badge>
  <Badge variant="success">Production</Badge>
</div>
```

### Input Component

#### Basic Usage
```tsx
import { Input } from '@/components/ui/Input/Input';

// Simple input
<Input placeholder="Enter text..." />

// With label
<Input
  label="Username"
  placeholder="Enter username"
/>

// With error
<Input
  label="Email"
  error="Invalid email address"
  placeholder="user@example.com"
/>

// Full width
<Input
  label="Description"
  fullWidth
  placeholder="Enter description..."
/>
```

#### Controlled Input
```tsx
import { useState } from 'react';
import { Input } from '@/components/ui/Input/Input';

function MyForm() {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    if (e.target.value.length < 3) {
      setError('Must be at least 3 characters');
    } else {
      setError('');
    }
  };

  return (
    <Input
      label="Name"
      value={value}
      onChange={handleChange}
      error={error}
      placeholder="Enter your name"
    />
  );
}
```

## Animation Patterns

### Custom Framer Motion Variants

#### List Items with Stagger
```tsx
import { motion } from 'framer-motion';

const listVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 },
};

function MyList({ items }) {
  return (
    <motion.ul
      initial="hidden"
      animate="visible"
      variants={listVariants}
    >
      {items.map((item) => (
        <motion.li key={item.id} variants={itemVariants}>
          {item.name}
        </motion.li>
      ))}
    </motion.ul>
  );
}
```

#### Modal/Panel with AnimatePresence
```tsx
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/Card/Card';

function Modal({ isOpen, onClose, children }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="modal"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <Card>{children}</Card>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

#### Progress Bar Animation
```tsx
import { motion } from 'framer-motion';

function ProgressBar({ progress }) {
  return (
    <div className="progress-container">
      <motion.div
        className="progress-fill"
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
      <span className="progress-text">{progress}%</span>
    </div>
  );
}
```

## Form Example with Multiple Components

```tsx
import { useState } from 'react';
import { Card } from '@/components/ui/Card/Card';
import { Input } from '@/components/ui/Input/Input';
import { Button } from '@/components/ui/Button/Button';
import { Badge } from '@/components/ui/Badge/Badge';

function UserForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'user',
  });
  const [errors, setErrors] = useState({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate and submit
    console.log('Form data:', formData);
  };

  return (
    <Card elevated>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
        <h2>User Information</h2>
        <Badge variant="info">{formData.role}</Badge>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Input
            label="Full Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={errors.name}
            placeholder="John Doe"
            fullWidth
          />

          <Input
            label="Email Address"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            error={errors.email}
            placeholder="john@example.com"
            fullWidth
          />

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button type="submit" variant="primary">
              Save Changes
            </Button>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
```

## Dashboard Grid with Animations

```tsx
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card/Card';
import { Badge } from '@/components/ui/Badge/Badge';

const gridVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

function Dashboard({ items }) {
  return (
    <motion.div
      className="grid"
      initial="hidden"
      animate="visible"
      variants={gridVariants}
    >
      {items.map((item) => (
        <motion.div key={item.id} variants={cardVariants}>
          <Card interactive elevated>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3>{item.title}</h3>
              <Badge variant={item.status === 'active' ? 'success' : 'default'}>
                {item.status}
              </Badge>
            </div>
            <p>{item.description}</p>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}
```

## Tips and Best Practices

1. **Use AnimatePresence for conditional rendering**
   ```tsx
   <AnimatePresence mode="wait">
     {showA ? <ComponentA key="a" /> : <ComponentB key="b" />}
   </AnimatePresence>
   ```

2. **Disable animations for reduced motion**
   ```tsx
   import { useReducedMotion } from 'framer-motion';

   const shouldReduceMotion = useReducedMotion();
   const transition = shouldReduceMotion ? { duration: 0 } : { duration: 0.3 };
   ```

3. **Layout animations for size changes**
   ```tsx
   <motion.div layout>
     {/* Content that changes size */}
   </motion.div>
   ```

4. **Optimize with layoutId for shared element transitions**
   ```tsx
   <motion.div layoutId="shared-element">
     {/* Smoothly morphs between views */}
   </motion.div>
   ```

5. **Use whileHover and whileTap for micro-interactions**
   ```tsx
   <motion.button
     whileHover={{ scale: 1.05 }}
     whileTap={{ scale: 0.95 }}
   >
     Interactive
   </motion.button>
   ```
