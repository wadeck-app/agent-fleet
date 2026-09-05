 Form Feature

A comprehensive, type-safe form system with specialized field components.

 Architecture

The form system is organized in three layers:

```
framework/features/forms/
 FormContainer.tsx               Layout & submission UI
 FormContainer.test.tsx          Unit + Integration tests
 useFormState.ts                 Form state logic
 useFormState.test.ts            Hook unit tests
 fieldUtils.ts                   Shared utilities and constants
 fields/                         High-level field components (with labels)
   TextField.tsx
   NumberField.tsx
   IntegerField.tsx
   SelectField.tsx
   TextAreaField.tsx
   DateField.tsx
   CheckboxField.tsx
   index.ts
 inputs/                         Low-level input wrappers (without labels)
   TextInput.tsx
   NumberInput.tsx
   SelectInput.tsx
   TextAreaInput.tsx
   DateInput.tsx
   CheckboxInput.tsx
   index.ts
 fields.stories.tsx              Storybook stories
 index.ts                        Barrel exports
 README.md                       This file
```

 Components

 FormContainer

Generic form layout with:

- Title display
- Grid layout for fields

---

_Reference content moved to [docs/reference.md](docs/reference.md)._
