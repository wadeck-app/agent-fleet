# Frontend Development Memory

## Form State Management

### Boolean Fields with useFormState

The `useFormState` hook only supports `string | number` types for `updateField`. When working with boolean fields (e.g., CheckboxField):

- Handle boolean state separately using `useState`
- Wrap the `onSubmit` callback to merge the boolean field with form data
- See `ProductForm.tsx` for implementation pattern

Example:

```tsx
const [featured, setFeatured] = useState(initialData?.featured ?? false);
const handleSubmitWithFeatured = async data => {
	await onSubmit({ ...data, featured });
};
// Use handleSubmitWithFeatured in useFormState config
```

## Project Structure

### Lego Framework Location

- Framework types: `packages/web-frontend/src/framework/lego/`
- Shared components: `packages/web-frontend/src/app/pages/_lego/_shared/`
- Pattern: Barrel exports at both levels for clean imports

### API Layer Pattern

Follow this structure for new entities:

1. `{entity}.api.ts` - Typed API client using `createApiClient` and `createTypedFetch`
2. `{Entity}Service.ts` - Business logic singleton with validation
3. `{Entity}Dialog.tsx` - Wraps EntityDialog with entity-specific form
4. `{Entity}Form.tsx` - Pure form component using useFormState
5. `index.ts` - Barrel export for the entity

## Tickets Feature Patterns

### WS-aware tab count hooks
- `useTicketCommentsCount(ticketId)` — fetches + subscribes to `B2F_TICKET_COMMENT_ADDED`
- `useTriggeredTasksCount(ticketId)` — fetches + subscribes to `B2F_TASKS_UPDATED`
- Use these instead of inline `useEffect` in layout components

### SelectWithSpinner
- Located: `packages/web-frontend/src/framework/components/forms/SelectWithSpinner.tsx`
- Spinner is a flex sibling OUTSIDE the Select, not absolutely positioned inside
- Wrapper uses `flex min-w-[120px]` to prevent narrow selects when value is empty

### SelectValue fallback for status selects
- When `useProjectStatusConfig` is loading, `SelectValue` renders empty
- Fix: `<SelectValue placeholder={localStatus} />` — shows raw status string as fallback
- Applied to all TicketDetailLayout[A-G].tsx components

## Validation

### Available Validators

From `@framework/utils/validation/validation`:

- `required(fieldName)` - Non-empty validation
- `maxLength(max, fieldName)` - String length validation
- `nonNegative(fieldName)` - Number >= 0
- `positive(fieldName)` - Number > 0
- `range(min, max, fieldName)` - Inclusive range validation
- `combine(...validators)` - Chain multiple validators
- `optional(validator)` - Make validator optional
