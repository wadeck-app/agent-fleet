# Plan: Refactoring Architectural EditableListField

## STATUS: PLANNING - Corrections Architecturales

Ce plan adresse 15 problèmes architecturaux identifiés dans l'implémentation EditableListField, pour aligner le code avec les conventions du projet.

---

## Contexte

L'implémentation EditableListField (complétée précédemment) présente des incohérences avec les conventions architecturales du projet. Ce plan couvre les corrections nécessaires pour:

- Respecter les patterns établis (contracts, exports, organisation)
- Améliorer la réutilisabilité (extraction de features communes)
- Corriger les erreurs TypeScript dans flow-editor
- Améliorer l'UX (exemples de patterns, guidance)

---

## Corrections Identifiées (15 items)

### 1. \***\*test-imports**.ts Non Conforme\*\* ⚠️ CRITIQUE

**Problème**: Le fichier ne suit pas les conventions de test du projet
**Convention**: Tests nommés `[FileName].test.ts`, helpers dans `framework/test-utils/`
**Action**: Supprimer ou renommer selon usage réel

---

### 2. **useEffect avec Dépendances Dangereuses** ⚠️ CRITIQUE

**Problème**: Risques de boucles infinies
**Fichiers à vérifier**:

- `FlowSettingsDialog.tsx:36-38` - State update HORS useEffect (CRITIQUE)
- `FlowEditorPropertiesPanel.tsx:231-244, 257-278` - Array deps avec comparaison (OK mais à documenter)
  **Action**: Corriger FlowSettingsDialog, valider autres useEffect

---

### 3. **if/return Inline** ⚠️ STYLE

**Problème**: `if (cond) return;` sur une ligne
**Convention**: Multi-lignes toujours

```typescript
// ❌ Actuel
if (items.length === 0) return null;

// ✅ Attendu
if (items.length === 0) {
  return null;
}
```

**Fichiers**: `useListItems.ts`, possiblement autres

---

### 4. **FeatureContract Mal Utilisé** ⚠️ ARCHITECTURE

**Problème**: `useListItems` retourne `FeatureContract` mais n'a pas de `fillQuery` pertinent (local state seulement)
**Convention découverte**: `FeatureContract` = features pour backend queries (pagination, sorting, caching)
**Solution**: Créer nouveau contrat:

```typescript
// FeatureFormContract.ts (NOUVEAU)
export interface FeatureFormContract<TState> {
	fstate: TState;
	actions: Record<string, Function>;
	// Pas de fillQuery - c'est pour les forms
}

// FeatureDataContract.ts (alias de FeatureContract)
export type FeatureDataContract<TState> = FeatureContract<TState>;
```

**Action**:

- Créer `FeatureFormContract` pour hooks form (useListItems, futurs)
- Aliaser `FeatureDataContract` pour clarifier usage backend
- Refactorer `useListItems` pour utiliser `FeatureFormContract`

---

### 5. **UseSyncedListItemsOptions Non Héritant** ⚠️ ARCHITECTURE

**Problème**: Options dupliquent celles de `UseListItemsOptions`
**Solution**:

```typescript
// ❌ Actuel
export interface UseSyncedListItemsOptions<T, R = T[]> {
	initialItems?: T[];
	minItems?: number;
	maxItems?: number;
	createDefault?: () => T;
	transform: (items: T[]) => R;
	onSync: (transformed: R) => void;
	filter?: (item: T) => boolean;
}

// ✅ Attendu
export interface UseSyncedListItemsOptions<T, R = T[]> extends UseListItemsOptions<T> {
	// Aspects spécifiques au syncing
	transform: (items: T[]) => R;
	onSync: (transformed: R) => void;
	filter?: (item: T) => boolean;
}
```

---

### 6. **Refactoring hooks2/ - Pas de Subfolders** ⚠️ ORGANISATION

**Problème**: Tous les hooks dans un seul dossier plat
**Convention découverte**: `components2/` a des subfolders (`form/`, `data-view/`)
**Solution**: Créer structure similaire

```
framework/hooks2/
  ├── form/               (NOUVEAU)
  │   ├── useListItems.ts
  │   ├── useSyncedListItems.ts
  │   └── [futurs hooks form]
  ├── data/               (NOUVEAU)
  │   ├── usePagination2.ts
  │   ├── useSorting2.ts
  │   ├── useCacheControl2.ts
  │   └── [autres hooks data]
  └── utility/            (NOUVEAU - optionnel)
      ├── useDebounce.ts
      └── useInfinitePagination.ts
```

**Action**: Migrer tous les hooks existants

---

### 7. **index.ts qui Font Seulement Import/Export** ⚠️ ANTI-PATTERN

**Problème**: Fichiers barrel inutiles
**Fichiers concernés**:

- `framework/components2/list/index.ts`
- `framework/components2/list/renderers/index.ts`
- `framework/hooks2/index.ts` (si existe)
  **Action**: Supprimer ces fichiers, importer directement depuis les sources

---

### 8. **GripVertical Dupliqué** ⚠️ RÉUTILISABILITÉ

**Problème**: `SortableItem` implémente GripVertical avec classes, pattern réutilisable ailleurs
**Observation**: Même pattern pourrait être dans DataView, autres listes
**Solution**: Extraire composant

```typescript
// framework/components2/primitives/DragHandle.tsx (NOUVEAU)
export function DragHandle({
  disabled = false,
  className,
  ...props
}: DragHandleProps) {
  return (
    <button
      type="button"
      className={cn(
        "cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
      disabled={disabled}
      {...props}
    >
      <GripVertical className="size-4" />
    </button>
  );
}
```

**Action**: Créer `DragHandle.tsx`, utiliser dans `SortableItem`

---

### 9. **EditableListField Isolé - Devrait Faire Partie d'une Famille Form** ⚠️ ARCHITECTURE

**Problème**: EditableListField seul, pas de pattern commun avec autres form fields
**Observation**: Autres form fields (`Input`, `Select`, `Checkbox`) partagent patterns:

- Tous supportent `className`, `...props`
- Tous utilisent `cn()` pour merge classes
- Tous exportent via `export { Component }`
  **Solution**: Créer interface commune

```typescript
// framework/types/FormFieldProps.ts (NOUVEAU ou extension)
export interface BaseFormFieldProps {
	label?: string;
	description?: string;
	error?: string;
	className?: string;
	disabled?: boolean;
}

// EditableListField devrait étendre:
export interface EditableListFieldProps<T> extends BaseFormFieldProps {
	items: ListItemsContract<T>;
	// ... autres props
}
```

**Action**: Standardiser props EditableListField avec autres form fields

---

### 10. **sensors/handleDragEnd dans EditableListField - Pas Lean** ⚠️ ARCHITECTURE

**Problème**: Code DnD directement dans composant (10+ lignes), complexifie testing
**Solution**: Extraire en hook feature

```typescript
// framework/hooks2/form/useDragAndDrop.ts (NOUVEAU)
export function useDragAndDrop<T>(options: {
	items: T[];
	onReorder: (fromIndex: number, toIndex: number) => void;
	getItemId: (item: T, index: number) => string | number;
	disabled?: boolean;
}) {
	const sensors = useSensors(useSensor(PointerSensor, { ...config }), useSensor(KeyboardSensor, { ...config }));

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			// ... logic extraction
		},
		[options.items, options.onReorder]
	);

	return {
		sensors,
		handleDragEnd,
		sortableIds: options.items.map((item, i) => options.getItemId(item, i)),
	};
}
```

**Bénéfice**: EditableListField devient +50% plus court, testable séparément

---

### 11. **Add Button avec Trop de Classes CSS** ⚠️ RÉUTILISABILITÉ

**Problème**: Bouton "Add" inline avec multiples classes Tailwind

```typescript
// ❌ Actuel
<Button
  variant="outline"
  size="sm"
  onClick={() => actions.add(createDefault())}
  disabled={!fstate.canAdd}
  className="mt-3 w-full justify-center gap-2 border-dashed"
>
  <Plus className="size-4" />
  {addButtonLabel}
</Button>
```

**Convention découverte**: Button.tsx a déjà variants (icon, icon-sm, etc.)
**Solution**: Créer variant ou composant spécialisé

```typescript
// Option 1: Nouveau variant dans Button.tsx
const buttonVariants = cva('...', {
  variants: {
    variant: {
      ...,
      'add': 'mt-3 w-full justify-center gap-2 border-dashed border-border ...'
    }
  }
});

// Option 2: Composant dédié
export function AddButton({ children, onClick, disabled }: AddButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="mt-3 w-full justify-center gap-2 border-dashed"
      onClick={onClick}
      disabled={disabled}
    >
      <Plus className="size-4" />
      {children}
    </Button>
  );
}
```

**Préférence**: Option 2 (composant) pour réutilisabilité

---

### 12. **Composants framework/components/forms - Exports Non Conformes** ⚠️ CODE EXISTANT

**Problème**: Certains composants n'utilisent pas `export function`, juste `export { }` à la fin
**Convention correcte** (découverte):

```typescript
// ✅ Pattern établi
function Input({ ...props }) {
  return <input ... />;
}
export { Input };
```

**Action**: Audit des composants forms pour cohérence (PAS de changement si déjà conforme)

---

### 13. **OutputItemRenderer - Manque d'Exemples UX** ⚠️ UX

**Problème**: Champ "Extraction Pattern" sans guidance, difficile pour utilisateur
**Solution**: Ajouter exemples inline

```typescript
<TextField
  label="Extraction Pattern (optional)"
  value={item.pattern || ''}
  onChange={(e) => actions.update({ pattern: e.target.value })}
  placeholder="Result: (.*)"
  description={
    <div className="space-y-1">
      <p>Regex pattern to extract value from output</p>
      <div className="text-xs space-y-0.5">
        <p><code>Result: (.*)</code> - Extract after "Result: "</p>
        <p><code>(\d+) items</code> - Extract number before " items"</p>
        <p><code>{"Status: (\\w+)"}</code> - Extract word after "Status: "</p>
      </div>
    </div>
  }
/>
```

**Action**: Enrichir description avec 3-4 exemples concrets

---

### 14. **Remove Button Dupliqué dans Renderers** ⚠️ RÉUTILISABILITÉ

**Problème**: Même bouton "Remove" répété dans 3 renderers

```typescript
// KeyValueItemRenderer.tsx:78
<Button variant="ghost" size="sm" onClick={actions.remove} title="Remove">
  <Trash2 className="size-4" />
</Button>

// OutputItemRenderer.tsx:88
<Button variant="ghost" size="sm" onClick={actions.remove} title="Remove">
  <Trash2 className="size-4" />
</Button>

// InputDefinitionRenderer.tsx:97
<Button variant="ghost" size="sm" onClick={actions.remove} title="Remove">
  <Trash2 className="size-4" />
</Button>
```

**Solution**: Extraire composant ou feature

```typescript
// framework/components2/list/RemoveItemButton.tsx (NOUVEAU)
export interface RemoveItemButtonProps {
  onRemove: () => void;
  disabled?: boolean;
  className?: string;
}

export function RemoveItemButton({
  onRemove,
  disabled = false,
  className
}: RemoveItemButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onRemove}
      disabled={disabled}
      title="Remove item"
      className={cn("shrink-0", className)}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
```

**Usage dans renderers**:

```typescript
<RemoveItemButton onRemove={actions.remove} />
```

---

### 15. **Erreurs TypeScript dans flows/flow-editor** ⚠️ CRITIQUE

**Fichiers avec erreurs**:

1. **FlowSettingsDialog.tsx:36-38** (CRITICAL)
    - State update HORS useEffect
    - Fix: Wrapper dans useEffect avec deps `[flowDefinition.id, flowDefinition.version]`

2. **FlowEditorPage.tsx:103-109** (HIGH)
    - 6x `as any` assertions
    - Fix: Corriger types dans `useFlowEditor` hook

3. **FlowEditorPropertiesPanel.tsx:118, 141, 173** (MEDIUM)
    - Double cast `as unknown as`
    - Fix: Créer interfaces propres pour ConstantNodeData

4. **FlowEditorRightPanel.tsx:75** (LOW)
    - Variable `_yamlError` non utilisée
    - Fix: Supprimer ou utiliser

---

## Plan d'Implémentation

### Phase 1: Architecture Critique (Contracts & Organisation)

**Priorité: CRITIQUE - Fondations**

#### 1.1 Créer Nouveaux Contracts

**Fichiers**:

- `framework/types/contracts/FeatureFormContract.ts` (NOUVEAU)
- `framework/types/contracts/FeatureDataContract.ts` (NOUVEAU - alias)

**Contenu FeatureFormContract**:

```typescript
/**
 * Contract for form-related feature hooks (local state management).
 * Unlike FeatureDataContract, does not include fillQuery as form hooks
 * do not interact with backend queries.
 */
export interface FeatureFormContract<TState> {
	/** Frozen state (memoized) - stable reference for useEffect dependencies */
	fstate: TState;

	/** State-modifying actions - all memoized */
	actions: Record<string, Function>;
}
```

**Contenu FeatureDataContract**:

```typescript
/**
 * Contract for data-fetching feature hooks (backend integration).
 * Includes fillQuery for populating backend query objects.
 *
 * This is an alias of FeatureContract for clarity.
 */
export type FeatureDataContract<TState> = FeatureContract<TState>;
```

#### 1.2 Refactorer useListItems

**Fichier**: `framework/hooks2/useListItems.ts`
**Changements**:

- Changer type de retour: `FeatureContract` → `FeatureFormContract`
- Supprimer `fillQuery: () => {}` (inutile)
- Corriger inline if/return

**Avant**:

```typescript
export type ListItemsContract<T> = FeatureContract<ListItemsState<T>>;

export function useListItems<T>(...): ListItemsContract<T> {
  // ...
  return {
    fstate,
    actions,
    fillQuery: () => {}, // ❌ Inutile
  };
}
```

**Après**:

```typescript
export type ListItemsContract<T> = FeatureFormContract<ListItemsState<T>>;

export function useListItems<T>(...): ListItemsContract<T> {
  // ...
  if (items.length === 0) {
    return null; // ❌ inline
  }

  // Corriger:
  if (items.length === 0) {
    return null;
  }

  return {
    fstate,
    actions,
    // fillQuery supprimé ✓
  };
}
```

#### 1.3 Organiser hooks2/ en Subfolders

**Structure cible**:

```
framework/hooks2/
  ├── form/
  │   ├── useListItems.ts          (DÉPLACÉ)
  │   ├── useListItems.test.ts     (DÉPLACÉ)
  │   ├── useSyncedListItems.ts    (DÉPLACÉ)
  │   └── useSyncedListItems.test.ts
  ├── data/
  │   ├── usePagination2.ts        (DÉPLACÉ)
  │   ├── usePagination2.test.ts
  │   ├── useSorting2.ts
  │   ├── useSorting2.test.ts
  │   ├── useCacheControl2.ts
  │   ├── useCacheControl2.test.ts
  │   ├── useCategoryFilter2.ts
  │   ├── useSearchInput2.ts
  │   └── useMultiSelect2.ts
  └── utility/
      ├── useDebounce.ts           (DÉPLACÉ)
      ├── useDataAccumulator.ts
      ├── useDataFetch.ts
      └── useInfinitePagination.ts
```

**Migration Steps**:

1. Créer subfolders `form/`, `data/`, `utility/`
2. Déplacer fichiers (git mv pour préserver historique)
3. Mettre à jour tous les imports dans le codebase
4. Supprimer les index.ts barrels si présents

**Estimation**: ~30 fichiers à déplacer + ~100 imports à corriger

---

### Phase 2: Extraction de Composants Réutilisables

**Priorité: HAUTE - Amélioration Architecture**

#### 2.1 Extraire DragHandle

**Fichier**: `framework/components2/primitives/DragHandle.tsx` (NOUVEAU)
**Tests**: `framework/components2/primitives/DragHandle.test.tsx` (NOUVEAU)

**Implémentation**:

```typescript
import { GripVertical } from 'lucide-react';
import { cn } from '@framework/lib/utils';

export interface DragHandleProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  disabled?: boolean;
}

export function DragHandle({
  disabled = false,
  className,
  ...props
}: DragHandleProps) {
  return (
    <button
      type="button"
      className={cn(
        'cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
      disabled={disabled}
      {...props}
    >
      <GripVertical className="size-4" />
    </button>
  );
}
```

**Refactorer SortableItem.tsx**:

```typescript
import { DragHandle } from '@framework/components2/primitives/DragHandle';

export function SortableItem({ id, disabled = false, children }: SortableItemProps) {
  // ... useSortable logic
  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div className="flex items-start gap-2">
        {!disabled && (
          <DragHandle {...attributes} {...listeners} className="mt-2" />
        )}
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
```

**Estimation**: 50 lignes (composant) + 80 lignes (tests)

#### 2.2 Extraire RemoveItemButton

**Fichier**: `framework/components2/list/RemoveItemButton.tsx` (NOUVEAU)
**Tests**: `framework/components2/list/RemoveItemButton.test.tsx` (NOUVEAU)

**Implémentation**:

```typescript
import { Trash2 } from 'lucide-react';
import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';

export interface RemoveItemButtonProps {
  onRemove: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}

export function RemoveItemButton({
  onRemove,
  disabled = false,
  className,
  title = 'Remove item',
}: RemoveItemButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onRemove}
      disabled={disabled}
      title={title}
      className={cn('shrink-0', className)}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
```

**Refactorer 3 renderers**:

```typescript
// KeyValueItemRenderer.tsx
import { RemoveItemButton } from '@framework/components2/list/RemoveItemButton';

export function KeyValueItemRenderer({ item, actions }: KeyValueItemRendererProps) {
  return (
    <div className="flex gap-2 rounded border p-2">
      {/* ... inputs ... */}
      <RemoveItemButton onRemove={actions.remove} />
    </div>
  );
}

// Même pattern pour OutputItemRenderer et InputDefinitionRenderer
```

**Estimation**: 40 lignes (composant) + 60 lignes (tests) + 30 lignes (refactors)

#### 2.3 Créer AddButton Composant

**Fichier**: `framework/components2/list/AddButton.tsx` (NOUVEAU)
**Tests**: `framework/components2/list/AddButton.test.tsx` (NOUVEAU)

**Implémentation**:

```typescript
import { Plus } from 'lucide-react';
import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';

export interface AddButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export function AddButton({
  children,
  onClick,
  disabled = false,
  className,
}: AddButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'mt-3 w-full justify-center gap-2 border-dashed',
        className
      )}
    >
      <Plus className="size-4" />
      {children}
    </Button>
  );
}
```

**Refactorer EditableListField.tsx**:

```typescript
import { AddButton } from './AddButton';

export function EditableListField<T>({ ... }) {
  return (
    <Field label={label} description={description} error={error}>
      {/* ... liste items ... */}
      <AddButton onClick={() => actions.add(createDefault())} disabled={!fstate.canAdd}>
        {addButtonLabel}
      </AddButton>
    </Field>
  );
}
```

**Estimation**: 45 lignes (composant) + 70 lignes (tests)

---

### Phase 3: Extraction de Feature Hook (DnD)

**Priorité: HAUTE - Simplification Composant**

#### 3.1 Créer useDragAndDrop Hook

**Fichier**: `framework/hooks2/form/useDragAndDrop.ts` (NOUVEAU)
**Tests**: `framework/hooks2/form/useDragAndDrop.test.ts` (NOUVEAU)

**Interface**:

```typescript
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';

export interface UseDragAndDropOptions<T> {
	items: T[];
	getItemId: (item: T, index: number) => string | number;
	onReorder: (fromIndex: number, toIndex: number) => void;
	disabled?: boolean;
	activationConstraint?: {
		distance?: number;
		delay?: number;
		tolerance?: number;
	};
}

export interface UseDragAndDropReturn {
	sensors: any[]; // SensorDescriptor[] from dnd-kit
	handleDragEnd: (event: DragEndEvent) => void;
	sortableIds: (string | number)[];
}

export function useDragAndDrop<T>(options: UseDragAndDropOptions<T>): UseDragAndDropReturn {
	const { items, getItemId, onReorder, disabled = false, activationConstraint = { distance: 8 } } = options;

	// Setup sensors
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);

	// Handle drag end
	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;

			if (!over || active.id === over.id || disabled) {
				return;
			}

			// Find indices by ID
			const sortableIds = items.map((item, i) => getItemId(item, i));
			const fromIndex = sortableIds.indexOf(active.id);
			const toIndex = sortableIds.indexOf(over.id);

			if (fromIndex !== -1 && toIndex !== -1) {
				onReorder(fromIndex, toIndex);
			}
		},
		[items, getItemId, onReorder, disabled]
	);

	// Compute sortable IDs
	const sortableIds = useMemo(() => items.map((item, i) => getItemId(item, i)), [items, getItemId]);

	return {
		sensors: disabled ? [] : sensors,
		handleDragEnd,
		sortableIds,
	};
}
```

**Estimation**: 90 lignes (hook) + 150 lignes (tests)

#### 3.2 Refactorer EditableListField

**Fichier**: `framework/components2/list/EditableListField.tsx`

**Avant** (~203 lignes):

```typescript
export function EditableListField<T>({ ... }) {
  const { fstate, actions } = items;

  // ❌ Beaucoup de code DnD inline
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const sortableIds = fstate.items.map((item, i) => getItemId(item, i));
      const fromIndex = sortableIds.indexOf(active.id);
      const toIndex = sortableIds.indexOf(over.id);
      if (fromIndex !== -1 && toIndex !== -1) {
        actions.reorder(fromIndex, toIndex);
      }
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={fstate.items.map((item, i) => getItemId(item, i))}>
        {/* ... */}
      </SortableContext>
    </DndContext>
  );
}
```

**Après** (~140 lignes):

```typescript
import { useDragAndDrop } from '@framework/hooks2/form/useDragAndDrop';

export function EditableListField<T>({ ... }) {
  const { fstate, actions } = items;

  // ✅ DnD abstrait dans hook
  const dnd = useDragAndDrop({
    items: fstate.items,
    getItemId,
    onReorder: actions.reorder,
    disabled: !enableReordering,
  });

  return (
    <DndContext sensors={dnd.sensors} onDragEnd={dnd.handleDragEnd}>
      <SortableContext items={dnd.sortableIds}>
        {/* ... */}
      </SortableContext>
    </DndContext>
  );
}
```

**Réduction**: ~60 lignes supprimées, composant 30% plus court

---

### Phase 4: Corrections TypeScript Critiques

**Priorité: CRITIQUE - Bugs Existants**

#### 4.1 Fix FlowSettingsDialog.tsx (CRITICAL)

**Fichier**: `packages/web-frontend/src/app/pages/flows/flow-editor/FlowSettingsDialog.tsx`
**Ligne**: 36-38

**Avant** (state update hors useEffect):

```typescript
// ❌ RISQUE: Infinite loop si condition toujours vraie
if (flowDefinition.id !== localFlow.id || flowDefinition.version !== localFlow.version) {
	setLocalFlow(flowDefinition);
}
```

**Après**:

```typescript
// ✅ Correct: useEffect avec deps appropriées
useEffect(() => {
	if (flowDefinition.id !== localFlow.id || flowDefinition.version !== localFlow.version) {
		setLocalFlow(flowDefinition);
	}
}, [flowDefinition.id, flowDefinition.version, localFlow.id, localFlow.version]);
```

#### 4.2 Fix FlowEditorPage.tsx (HIGH)

**Fichier**: `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorPage.tsx`
**Lignes**: 103-109

**Problème**: 6x `as any` assertions

**Investigation requise**: Vérifier types dans `useFlowEditor` hook

- `nodes` devrait être `Node[]` from react-flow
- `edges` devrait être `Edge[]` from react-flow
- Handlers doivent correspondre aux types react-flow

**Fix**: Corriger types dans `useFlowEditor.ts`, supprimer `as any`

#### 4.3 Fix FlowEditorPropertiesPanel.tsx (MEDIUM)

**Fichier**: `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorPropertiesPanel.tsx`
**Lignes**: 118, 141, 173

**Problème**: Double cast `as unknown as`

**Solution**: Créer interface ConstantNodeData propre

```typescript
// flow-editor/types.ts (NOUVEAU ou EXISTANT)
export interface ConstantNodeData {
	label?: string;
	value?: string | number | boolean;
	type?: 'string' | 'number' | 'boolean';
}

// Utiliser dans FlowEditorPropertiesPanel:
const constantData = selectedNode.data as ConstantNodeData; // ✅ Cast direct
```

#### 4.4 Fix FlowEditorRightPanel.tsx (LOW)

**Fichier**: `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorRightPanel.tsx`
**Ligne**: 75

**Action**: Supprimer variable inutilisée

```typescript
// ❌ Supprimer
const [_yamlError, setYamlError] = useState<string | null>(null);
// ... lignes 124, 126: setYamlError calls inutiles
```

---

### Phase 5: Améliorations UX & Nettoyage

**Priorité: MOYENNE - Polish**

#### 5.1 Enrichir OutputItemRenderer avec Exemples

**Fichier**: `framework/components2/list/renderers/OutputItemRenderer.tsx`

**Avant**:

```typescript
<TextField
  label="Extraction Pattern (optional)"
  placeholder="Result: (.*)"
  description="Regex pattern for extracting value"
/>
```

**Après**:

```typescript
<TextField
  label="Extraction Pattern (optional)"
  placeholder="Result: (.*)"
  description={
    <div className="space-y-1 text-xs">
      <p className="text-muted-foreground">
        Regex pattern to extract value from step output
      </p>
      <div className="mt-2 space-y-1 rounded-md bg-muted/30 p-2 font-mono">
        <div>
          <code className="text-foreground">Result: (.*)</code>
          <span className="ml-2 text-muted-foreground">
            → Extract text after "Result: "
          </span>
        </div>
        <div>
          <code className="text-foreground">(\d+) items</code>
          <span className="ml-2 text-muted-foreground">
            → Extract number before " items"
          </span>
        </div>
        <div>
          <code className="text-foreground">Status: (\w+)</code>
          <span className="ml-2 text-muted-foreground">
            → Extract word after "Status: "
          </span>
        </div>
      </div>
    </div>
  }
/>
```

**Estimation**: +20 lignes

#### 5.2 Supprimer **test-imports**.ts

**Fichier**: `packages/web-frontend/src/framework/components2/list/__test-imports__.ts`

**Action**:

1. Vérifier si utilisé quelque part
2. Si oui, remplacer par imports directs
3. Supprimer fichier

**Convention**: Tests importent directement depuis sources, pas de barrels

#### 5.3 Supprimer index.ts Barrels

**Fichiers**:

- `framework/components2/list/index.ts`
- `framework/components2/list/renderers/index.ts`

**Action**: Supprimer, forcer imports directs

```typescript
// ❌ Avant
import { EditableListField } from '@framework/components2/list';

// ✅ Après
import { EditableListField } from '@framework/components2/list/EditableListField';
```

#### 5.4 Audit Exports framework/components/forms

**Action**: Vérifier tous les composants utilisent pattern `export { Component }`
**Fichiers à vérifier**:

- Input.tsx ✓
- Select.tsx ✓
- Checkbox.tsx ✓
- Label.tsx
- Textarea.tsx
- Switch.tsx
- RadioGroup.tsx
- Command.tsx
- Popover.tsx

**Si non conforme**: Aucune action (code existant, ne pas toucher si fonctionne)

#### 5.5 Corriger if/return Inline dans useListItems

**Fichier**: `framework/hooks2/form/useListItems.ts` (après migration)

**Chercher patterns**:

```typescript
// ❌ À corriger
if (condition) return value;

// ✅ Format attendu
if (condition) {
  return value;
}
```

**Estimation**: ~5 occurrences potentielles

#### 5.6 UseSyncedListItemsOptions Héritage

**Fichier**: `framework/hooks2/form/useSyncedListItems.ts` (après migration)

**Avant**:

```typescript
export interface UseSyncedListItemsOptions<T, R = T[]> {
	initialItems?: T[];
	minItems?: number;
	maxItems?: number;
	createDefault?: () => T;
	// Specific
	transform: (items: T[]) => R;
	onSync: (transformed: R) => void;
	filter?: (item: T) => boolean;
}
```

**Après**:

```typescript
export interface UseSyncedListItemsOptions<T, R = T[]> extends UseListItemsOptions<T> {
	// Only sync-specific options
	transform: (items: T[]) => R;
	onSync: (transformed: R) => void;
	filter?: (item: T) => boolean;
}
```

---

### Phase 6: Documentation Lessons Learned

**Priorité: CRITIQUE - Éviter Répétition**

#### 6.1 Mettre à Jour .claude/kb/lessons-learned.md

**Fichier**: `.claude/kb/lessons-learned.md`

**Sections à ajouter**:

````markdown
## Architecture - Contracts & Hooks

### FeatureContract vs FeatureFormContract

- **FeatureContract** (alias FeatureDataContract): Pour hooks data-fetching (backend)
    - Inclut `fillQuery` pour générer requêtes backend
    - Exemples: usePagination2, useSorting2, useCacheControl2
- **FeatureFormContract**: Pour hooks form (local state)
    - PAS de `fillQuery` (local seulement)
    - Exemples: useListItems, useSyncedListItems

❌ **Erreur fréquente**: Utiliser FeatureContract pour local state
✅ **Correct**: FeatureFormContract pour forms, FeatureDataContract pour backend

### Organisation hooks2/

- **Subfolders obligatoires**: `form/`, `data/`, `utility/`
- **Tests colocalisés**: `useFeature.test.ts` à côté de `useFeature.ts`
- **Pas de barrels**: Imports directs depuis sources

---

## TypeScript - useEffect & State Updates

### State Update DOIT être dans useEffect

❌ **Erreur critique**:

```typescript
if (condition) {
	setState(newValue); // ⚠️ Hors useEffect = risque infinite loop
}
```
````

✅ **Correct**:

```typescript
useEffect(() => {
	if (condition) {
		setState(newValue);
	}
}, [dependencies]);
```

### Array Dependencies avec Comparaison

✅ **Pattern valide** (si comparaison avant setState):

```typescript
useEffect(() => {
  const transformed = items.map(...);
  const isDifferent = /* comparison logic */;
  if (isDifferent) { // ✓ Comparison prevents loop
    onUpdate(transformed);
  }
}, [items]); // items is array, but safe
```

---

## Code Style

### if/return Multi-lignes TOUJOURS

❌ **Interdit**:

```typescript
if (condition) return value;
```

✅ **Obligatoire**:

```typescript
if (condition) {
  return value;
}
```

### Export Pattern Composants

✅ **Standard établi**:

```typescript
function Component({ ...props }) {
  return <div>...</div>;
}
export { Component };
```

❌ **Pas de**: `export default`, `export function Component`, `export const Component`

---

## Réutilisabilité - Extraction de Features

### Quand Extraire un Composant

**Signaux**:

- Code dupliqué dans 3+ endroits
- Pattern visuel cohérent (ex: bouton Remove avec icône)
- Classes CSS répétées (ex: drag handle)

**Exemples extraits**:

- `DragHandle` - GripVertical avec classes standards
- `RemoveItemButton` - Trash icon avec variant ghost
- `AddButton` - Plus icon avec border-dashed

### Quand Extraire un Hook

**Signaux**:

- Logique >10 lignes dans composant
- Testing complexifié par logique inline
- Réutilisabilité potentielle

**Exemple**: `useDragAndDrop` extrait de EditableListField

- Avant: 60 lignes DnD inline
- Après: 5 lignes hook call
- Bénéfice: Testing séparé, composant 30% plus court

---

## UX - Guidance Utilisateur

### Champs Patterns/Regex DOIVENT avoir exemples

❌ **Insuffisant**:

```typescript
<TextField
  label="Pattern"
  description="Regex pattern"
/>
```

✅ **Attendu**:

```typescript
<TextField
  label="Pattern"
  description={
    <div>
      <p>Regex examples:</p>
      <code>Result: (.*)</code> - Extract after "Result: "
      <code>(\d+) items</code> - Extract number
    </div>
  }
/>
```

**Règle**: Minimum 3 exemples concrets pour champs techniques

---

## Anti-Patterns Identifiés

### ❌ Barrel Files (index.ts import/export)

**Problème**: Complexifie imports, cache dépendances
**Solution**: Imports directs depuis sources

### ❌ Hooks Flat Directory

**Problème**: Tous les hooks dans un dossier → difficile à naviguer
**Solution**: Subfolders par catégorie (form/, data/, utility/)

### ❌ Type Assertions Multiples

**Problème**: `as unknown as Type` cache erreurs de design
**Solution**: Créer interfaces propres, corriger types upstream

### ❌ State Update Hors useEffect

**Problème**: Risque infinite loop
**Solution**: TOUJOURS wrapper dans useEffect avec deps correctes

````

**Estimation**: +150 lignes documentation

---

## Résumé des Fichiers Impactés

### Nouveaux Fichiers (10)
1. `framework/types/contracts/FeatureFormContract.ts`
2. `framework/types/contracts/FeatureDataContract.ts`
3. `framework/components2/primitives/DragHandle.tsx` + test
4. `framework/components2/list/RemoveItemButton.tsx` + test
5. `framework/components2/list/AddButton.tsx` + test
6. `framework/hooks2/form/useDragAndDrop.ts` + test

### Fichiers Migrés (20+)
- Tous hooks de `hooks2/` vers `hooks2/form/`, `hooks2/data/`, `hooks2/utility/`
- Tests associés

### Fichiers Modifiés (15)
1. `framework/hooks2/form/useListItems.ts` - Contract + if/return
2. `framework/hooks2/form/useSyncedListItems.ts` - Options héritage
3. `framework/components2/list/EditableListField.tsx` - useDragAndDrop + AddButton
4. `framework/components2/list/SortableItem.tsx` - DragHandle
5. `framework/components2/list/renderers/KeyValueItemRenderer.tsx` - RemoveItemButton
6. `framework/components2/list/renderers/OutputItemRenderer.tsx` - RemoveItemButton + exemples
7. `framework/components2/list/renderers/InputDefinitionRenderer.tsx` - RemoveItemButton
8. `packages/web-frontend/src/app/pages/flows/flow-editor/FlowSettingsDialog.tsx` - useEffect fix
9. `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorPage.tsx` - Types fix
10. `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorPropertiesPanel.tsx` - Types fix
11. `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorRightPanel.tsx` - Cleanup
12. `.claude/kb/lessons-learned.md` - Documentation complète
13. ~100+ fichiers - Imports mis à jour après migration hooks

### Fichiers Supprimés (3)
1. `framework/components2/list/__test-imports__.ts`
2. `framework/components2/list/index.ts`
3. `framework/components2/list/renderers/index.ts`

---

## Vérification

### Tests Automatisés
```bash
# TypeScript check
npm run check:ts

# Tests unitaires
npm run test:agent:frontend

# Build
npm run build
````

### Tests Manuels

1. Flow Editor → Vérifier env/output/inputs fields fonctionnent
2. Drag & drop → Vérifier reordering marche toujours
3. Remove buttons → Vérifier suppression items
4. Add buttons → Vérifier ajout items
5. Patterns extraction → Vérifier exemples visibles

### Validation Architecture

- [ ] Tous hooks dans subfolders form/data/utility
- [ ] Aucun index.ts barrel
- [ ] FeatureFormContract utilisé par useListItems
- [ ] useEffect correctement utilisé partout
- [ ] if/return multi-lignes partout
- [ ] DragHandle réutilisé
- [ ] RemoveItemButton réutilisé
- [ ] AddButton réutilisé
- [ ] useDragAndDrop extrait
- [ ] Erreurs TypeScript corrigées
- [ ] Exemples patterns visibles
- [ ] Lessons learned documenté

---

## Estimation Totale

| Phase                       | Tâches                    | Fichiers | Lignes    | Temps   |
| --------------------------- | ------------------------- | -------- | --------- | ------- |
| 1. Architecture Critique    | Contracts + Migration     | 30+      | ~100      | 4h      |
| 2. Composants Réutilisables | DragHandle, Remove, Add   | 6        | ~400      | 3h      |
| 3. Hook DnD                 | useDragAndDrop + refactor | 3        | ~250      | 2h      |
| 4. Fixes TypeScript         | 4 fichiers flow-editor    | 4        | ~50       | 2h      |
| 5. UX & Nettoyage           | Exemples + suppression    | 8        | ~100      | 2h      |
| 6. Documentation            | Lessons learned           | 1        | ~150      | 1h      |
| **TOTAL**                   | **15 corrections**        | **52+**  | **~1050** | **14h** |

---

## Prochaines Étapes

1. **Validation User**: Approuver ce plan
2. **Implémentation**: Suivre phases 1-6
3. **Review**: Tester + valider checklist
4. **Lessons Learned**: S'assurer que la doc est complète pour éviter répétition

🎯 **Objectif**: Code aligné avec conventions, réutilisable, documenté
