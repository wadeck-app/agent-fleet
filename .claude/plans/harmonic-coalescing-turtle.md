# Plan: Composant Générique de Liste Éditable (EditableListField)

## Contexte

Actuellement, l'éditeur de flows utilise des textarea JSON pour plusieurs propriétés:
- `env` (variables d'environnement) → JSON `{"KEY": "value"}`
- `output` (configuration outputs) → JSON complexe avec metadata
- `inputs` (flow inputs) → Liste personnalisée avec composant dédié

**Problème:** Ces textarea JSON sont peu user-friendly et difficiles à comprendre pour les utilisateurs.

**Solution:** Créer un composant générique réutilisable avec une architecture composable similaire à DataView/Table/Grid, permettant de gérer des listes éditables avec add/remove/edit/reorder de manière déclarative.

---

## Architecture Proposée

Inspirée du pattern DataView/Table/Grid (3 couches headless):

```
┌─ Feature Hooks (State Management)
│  ├─ useListItems<T>           - Gestion CRUD des items
│  ├─ useListReordering<T>      - Drag & drop (optionnel)
│  └─ useListValidation<T>      - Validation (optionnel)
│
├─ Core Component (Composition & Rendering)
│  └─ EditableListField<T>      - Rendu de la liste éditable
│
└─ Item Renderers (Composables)
   ├─ KeyValueItemRenderer      - Pour env variables
   ├─ OutputItemRenderer        - Pour output config
   └─ InputDefinitionRenderer   - Pour flow inputs
```

**Principes clés:**
1. **Composabilité**: Features indépendantes et stackables
2. **Généricité**: Support de tout type d'item via `<T>`
3. **Type Safety**: TypeScript strict pour éviter les erreurs
4. **Testabilité**: Hooks et composants séparés
5. **Réutilisabilité**: Pattern utilisable pour env, output, inputs et futures listes

---

## Composants à Créer

### 1. Hook: `useListItems<T>`

**Localisation:** `packages/web-frontend/src/framework/hooks2/useListItems.ts` (NOUVEAU)

**Responsabilité:** Gestion CRUD des items d'une liste

**Interface:**
```typescript
interface ListItemsContract<T> {
  fstate: {
    items: T[];
    count: number;
    isEmpty: boolean;
    canAdd: boolean;
    canRemove: boolean;
  };
  actions: {
    add: (item: T) => void;
    remove: (index: number) => void;
    update: (index: number, item: Partial<T>) => void;
    set: (items: T[]) => void;
    clear: () => void;
  };
  fillQuery: () => void; // Pas de query (local state)
}

interface UseListItemsOptions<T> {
  initialItems?: T[];
  minItems?: number;
  maxItems?: number;
  createDefault?: () => T;
}

export function useListItems<T>(options: UseListItemsOptions<T>): ListItemsContract<T>
```

**Fonctionnalités:**
- État frozen (fstate) pour éviter re-renders
- Actions mémorisées
- Validation constraints (min/max)
- Support d'un item par défaut customisable

**Estimation:** ~80 lignes

---

### 2. Hook: `useListReordering<T>` (Optionnel)

**Localisation:** `packages/web-frontend/src/framework/hooks2/useListReordering.ts` (NOUVEAU)

**Responsabilité:** Gestion du drag & drop pour réordonner

**Interface:**
```typescript
interface ListReorderingContract<T> {
  fstate: {
    isDragging: boolean;
    draggedIndex: number | null;
  };
  actions: {
    startDrag: (index: number) => void;
    endDrag: () => void;
    reorder: (fromIndex: number, toIndex: number) => void;
  };
  sensors: SensorDescriptor[]; // Pour dnd-kit
  fillQuery: () => void;
}

export function useListReordering<T>(): ListReorderingContract<T>
```

**Fonctionnalités:**
- Intégration avec dnd-kit
- État de drag en cours
- Actions de réordonnancement

**Estimation:** ~60 lignes

---

### 3. Composant: `EditableListField<T>`

**Localisation:** `packages/web-frontend/src/framework/components2/list/EditableListField.tsx` (NOUVEAU)

**Responsabilité:** Composant principal pour afficher et éditer une liste

**Interface:**
```typescript
interface EditableListFieldProps<T> extends BaseFieldProps {
  // Core hooks
  items: ListItemsContract<T>;
  reordering?: ListReorderingContract<T>;

  // Rendering
  renderItem: (item: T, index: number, actions: ItemActions<T>) => ReactNode;
  renderEmpty?: () => ReactNode;

  // Labels
  addButtonLabel?: string;
  emptyMessage?: string;

  // Styling
  className?: string;
}

interface ItemActions<T> {
  update: (partial: Partial<T>) => void;
  remove: () => void;
}

export function EditableListField<T>(props: EditableListFieldProps<T>): ReactElement
```

**Fonctionnalités:**
- Affichage de la liste avec items rendus via `renderItem`
- Bouton "Add" (désactivé si maxItems atteint)
- Boutons "Remove" par item (désactivés si minItems atteint)
- Support du drag & drop si `reordering` fourni
- État vide avec message personnalisable
- Intégration avec FormContainer via BaseFieldProps

**Structure:**
```typescript
export function EditableListField<T>({
  items,
  reordering,
  renderItem,
  renderEmpty,
  addButtonLabel = 'Add Item',
  emptyMessage = 'No items',
  className,
  label,
  description,
  error,
}: EditableListFieldProps<T>) {
  const { fstate, actions } = items;

  // Setup dnd-kit if reordering enabled
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const fromIndex = fstate.items.findIndex((_, i) => i === active.id);
      const toIndex = fstate.items.findIndex((_, i) => i === over.id);
      reordering?.actions.reorder(fromIndex, toIndex);
    }
  };

  return (
    <Field label={label} description={description} error={error}>
      {fstate.isEmpty && renderEmpty ? (
        renderEmpty()
      ) : (
        <DndContext
          sensors={reordering ? sensors : undefined}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={fstate.items.map((_, i) => i)}>
            {fstate.items.map((item, index) => (
              <SortableItem key={index} id={index} disabled={!reordering}>
                {renderItem(item, index, {
                  update: (partial) => actions.update(index, partial),
                  remove: () => actions.remove(index),
                })}
              </SortableItem>
            ))}
          </SortableContext>
        </DndContext>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => actions.add(createDefault())}
        disabled={!fstate.canAdd}
      >
        <Plus className="size-4" />
        {addButtonLabel}
      </Button>
    </Field>
  );
}
```

**Estimation:** ~120 lignes

---

### 4. Composant: `SortableItem`

**Localisation:** `packages/web-frontend/src/framework/components2/list/SortableItem.tsx` (NOUVEAU)

**Responsabilité:** Wrapper pour items drag & droppable

**Interface:**
```typescript
interface SortableItemProps {
  id: number;
  disabled?: boolean;
  children: ReactNode;
}

export function SortableItem({ id, disabled, children }: SortableItemProps): ReactElement
```

**Fonctionnalités:**
- Intégration avec dnd-kit
- Handle de drag visuel
- Désactivable si pas de reordering

**Estimation:** ~40 lignes

---

### 5. Item Renderer: `KeyValueItemRenderer`

**Localisation:** `packages/web-frontend/src/framework/components2/list/renderers/KeyValueItemRenderer.tsx` (NOUVEAU)

**Responsabilité:** Rendu d'une paire clé-valeur (pour env variables)

**Interface:**
```typescript
interface KeyValueItem {
  key: string;
  value: string;
}

interface KeyValueItemRendererProps {
  item: KeyValueItem;
  actions: ItemActions<KeyValueItem>;
}

export function KeyValueItemRenderer({ item, actions }: KeyValueItemRendererProps): ReactElement
```

**Structure:**
```typescript
export function KeyValueItemRenderer({ item, actions }: KeyValueItemRendererProps) {
  return (
    <div className="flex gap-2 rounded border p-2">
      <TextField
        label="Key"
        value={item.key}
        onChange={(e) => actions.update({ key: e.target.value })}
        className="flex-1"
        placeholder="KEY"
      />
      <TextField
        label="Value"
        value={item.value}
        onChange={(e) => actions.update({ value: e.target.value })}
        className="flex-1"
        placeholder="value"
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={actions.remove}
        title="Remove"
      >
        <Trash className="size-4" />
      </Button>
    </div>
  );
}
```

**Estimation:** ~30 lignes

---

### 6. Item Renderer: `OutputItemRenderer`

**Localisation:** `packages/web-frontend/src/framework/components2/list/renderers/OutputItemRenderer.tsx` (NOUVEAU)

**Responsabilité:** Rendu d'une configuration output (nom + type + pattern optionnel)

**Interface:**
```typescript
interface OutputItem {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  pattern?: string;
}

interface OutputItemRendererProps {
  item: OutputItem;
  actions: ItemActions<OutputItem>;
}

export function OutputItemRenderer({ item, actions }: OutputItemRendererProps): ReactElement
```

**Structure:**
```typescript
export function OutputItemRenderer({ item, actions }: OutputItemRendererProps) {
  return (
    <div className="space-y-2 rounded border p-3">
      <div className="flex gap-2">
        <TextField
          label="Variable Name"
          value={item.name}
          onChange={(e) => actions.update({ name: e.target.value })}
          className="flex-1"
          placeholder="myVariable"
        />
        <SelectField
          label="Type"
          value={item.type}
          onChange={(value) => actions.update({ type: value })}
          options={[
            { value: 'string', label: 'String' },
            { value: 'number', label: 'Number' },
            { value: 'boolean', label: 'Boolean' },
            { value: 'object', label: 'Object' },
            { value: 'array', label: 'Array' },
          ]}
          className="w-40"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={actions.remove}
          title="Remove"
        >
          <Trash className="size-4" />
        </Button>
      </div>

      {item.type === 'string' && (
        <TextField
          label="Extraction Pattern (optional)"
          value={item.pattern || ''}
          onChange={(e) => actions.update({ pattern: e.target.value })}
          placeholder="Result: (.*)"
          description="Regex pattern for extracting value"
        />
      )}
    </div>
  );
}
```

**Estimation:** ~50 lignes

---

### 7. Item Renderer: `InputDefinitionRenderer`

**Localisation:** `packages/web-frontend/src/framework/components2/list/renderers/InputDefinitionRenderer.tsx` (NOUVEAU)

**Responsabilité:** Rendu d'une définition d'input (nom + type + required)

**Interface:**
```typescript
interface InputDefinitionItem {
  name: string;
  type: VariableType;
  required: boolean;
}

interface InputDefinitionRendererProps {
  item: InputDefinitionItem;
  actions: ItemActions<InputDefinitionItem>;
  availableTypes: Array<{ value: VariableType; label: string }>;
}

export function InputDefinitionRenderer({ item, actions, availableTypes }: InputDefinitionRendererProps): ReactElement
```

**Structure:** Similaire à KeyValue mais avec dropdown de types et checkbox required

**Estimation:** ~40 lignes

---

## Intégration dans Flow Editor

### 8. Adapter FlowEditorPropertiesPanel pour env

**Fichier:** `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorPropertiesPanel.tsx`

**Changement:** Remplacer le textarea JSON par EditableListField

**Avant:**
```typescript
<KeyValueField
  label="Environment Variables"
  value={JSON.stringify(step.env || {})}
  onChange={(value) => {
    try {
      const parsed = JSON.parse(value);
      updateNodeData(selectedNode.id, { env: parsed });
    } catch {
      // Invalid JSON, ignore
    }
  }}
/>
```

**Après:**
```typescript
const envItems = useListItems<KeyValueItem>({
  initialItems: Object.entries(step.env || {}).map(([key, value]) => ({ key, value })),
  minItems: 0,
  createDefault: () => ({ key: '', value: '' }),
});

// Sync to step data
useEffect(() => {
  const envObj = Object.fromEntries(
    envItems.fstate.items
      .filter(item => item.key) // Skip empty keys
      .map(item => [item.key, item.value])
  );
  updateNodeData(selectedNode.id, { env: envObj });
}, [envItems.fstate.items]);

// Render
<EditableListField
  label="Environment Variables"
  items={envItems}
  renderItem={(item, index, actions) => (
    <KeyValueItemRenderer item={item} actions={actions} />
  )}
  addButtonLabel="Add Variable"
  emptyMessage="No environment variables"
/>
```

**Estimation:** ~20 lignes modifiées

---

### 9. Adapter FlowEditorPropertiesPanel pour output

**Fichier:** `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorPropertiesPanel.tsx`

**Changement:** Remplacer le textarea JSON par EditableListField

**Avant:**
```typescript
<Textarea
  value={JSON.stringify(step.output || {}, null, 2)}
  onChange={(e) => {
    try {
      const parsed = JSON.parse(e.target.value);
      updateNodeData(selectedNode.id, { output: parsed });
    } catch {
      // Invalid JSON
    }
  }}
  rows={4}
  className="font-mono text-xs"
  description="JSON object defining output mappings"
/>
```

**Après:**
```typescript
const outputItems = useListItems<OutputItem>({
  initialItems: Object.entries(step.output || {}).map(([name, config]) => ({
    name,
    type: config.type,
    pattern: config.pattern,
  })),
  minItems: 0,
  createDefault: () => ({ name: '', type: 'string' }),
});

// Sync to step data
useEffect(() => {
  const outputObj = Object.fromEntries(
    outputItems.fstate.items
      .filter(item => item.name)
      .map(item => [item.name, { type: item.type, pattern: item.pattern }])
  );
  updateNodeData(selectedNode.id, { output: outputObj });
}, [outputItems.fstate.items]);

// Render
<EditableListField
  label="Output Configuration"
  description="Extract variables from step output"
  items={outputItems}
  renderItem={(item, index, actions) => (
    <OutputItemRenderer item={item} actions={actions} />
  )}
  addButtonLabel="Add Output Variable"
  emptyMessage="No output variables defined"
/>
```

**Estimation:** ~25 lignes modifiées

---

### 10. Adapter FlowSettingsDialog pour inputs

**Fichier:** `packages/web-frontend/src/app/pages/flows/flow-editor/FlowSettingsDialog.tsx`

**Changement:** Remplacer FlowInputDefinitionsField par EditableListField

**Avant:**
```typescript
<FlowInputDefinitionsField
  value={form.values.inputs}
  onChange={(inputs) => form.setFieldValue('inputs', inputs)}
/>
```

**Après:**
```typescript
const inputItems = useListItems<InputDefinitionItem>({
  initialItems: Object.entries(form.values.inputs).map(([name, spec]) => ({
    name,
    type: spec.type,
    required: spec.required || false,
  })),
  minItems: 0,
  createDefault: () => ({ name: '', type: 'string', required: false }),
});

// Sync to form
useEffect(() => {
  const inputsObj = Object.fromEntries(
    inputItems.fstate.items
      .filter(item => item.name)
      .map(item => [item.name, { type: item.type, required: item.required }])
  );
  form.setFieldValue('inputs', inputsObj);
}, [inputItems.fstate.items]);

// Render
<EditableListField
  label="Flow Inputs"
  items={inputItems}
  renderItem={(item, index, actions) => (
    <InputDefinitionRenderer
      item={item}
      actions={actions}
      availableTypes={VARIABLE_TYPES}
    />
  )}
  addButtonLabel="Add Input"
  emptyMessage="No inputs defined"
/>
```

**Estimation:** ~25 lignes modifiées

---

## Types & Validation

### 11. Types TypeScript

**Fichier:** `packages/web-frontend/src/framework/types/EditableListTypes.ts` (NOUVEAU)

**Contenu:**
```typescript
export interface KeyValueItem {
  key: string;
  value: string;
}

export interface OutputItem {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  pattern?: string;
}

export interface InputDefinitionItem {
  name: string;
  type: VariableType;
  required: boolean;
}

export interface ItemActions<T> {
  update: (partial: Partial<T>) => void;
  remove: () => void;
}
```

**Estimation:** ~30 lignes

---

## Tests

### 12. Tests pour useListItems

**Fichier:** `packages/web-frontend/src/framework/hooks2/useListItems.test.ts` (NOUVEAU)

**Couverture:**
```typescript
describe('useListItems', () => {
  it('initializes with empty list', () => {});
  it('initializes with provided items', () => {});
  it('adds item to list', () => {});
  it('removes item by index', () => {});
  it('updates item by index', () => {});
  it('respects minItems constraint', () => {});
  it('respects maxItems constraint', () => {});
  it('clears all items', () => {});
  it('provides correct canAdd/canRemove flags', () => {});
});
```

**Estimation:** ~150 lignes

---

### 13. Tests pour EditableListField

**Fichier:** `packages/web-frontend/src/framework/components2/list/EditableListField.test.tsx` (NOUVEAU)

**Couverture:**
```typescript
describe('EditableListField', () => {
  it('renders empty state', () => {});
  it('renders list of items', () => {});
  it('calls renderItem for each item', () => {});
  it('adds item on button click', () => {});
  it('removes item when action called', () => {});
  it('disables add button when maxItems reached', () => {});
  it('disables remove when minItems reached', () => {});
  it('supports drag & drop when reordering enabled', () => {});
});
```

**Estimation:** ~200 lignes

---

### 14. Tests pour Item Renderers

**Fichier:** `packages/web-frontend/src/framework/components2/list/renderers/*.test.tsx` (NOUVEAU)

**Un fichier par renderer:**
- `KeyValueItemRenderer.test.tsx`
- `OutputItemRenderer.test.tsx`
- `InputDefinitionRenderer.test.tsx`

**Couverture par renderer:**
```typescript
describe('KeyValueItemRenderer', () => {
  it('renders key and value fields', () => {});
  it('updates key on change', () => {});
  it('updates value on change', () => {});
  it('calls remove action', () => {});
});
```

**Estimation:** ~100 lignes par renderer (300 total)

---

## Documentation

### 15. Documentation du Pattern

**Fichier:** `packages/web-frontend/.claude/docs/editable-list-pattern.md` (NOUVEAU)

**Contenu:**
- Architecture overview
- Usage examples
- Custom item renderer guide
- Best practices
- Comparison avec DataView/Table/Grid pattern

**Estimation:** ~200 lignes markdown

---

## Vérification

### Tests Manuels

**Env Variables (Script steps):**
1. ✅ Ajouter une variable → Affiche deux champs (key/value)
2. ✅ Modifier key/value → Preview YAML mis à jour
3. ✅ Supprimer une variable → Disparaît de la liste et du YAML
4. ✅ Variables avec key vide → Filtrées dans le YAML

**Output Configuration (tous steps):**
1. ✅ Ajouter une output variable → Affiche nom + type
2. ✅ Changer le type → Options changent (pattern visible si string)
3. ✅ Définir un pattern → Apparaît dans YAML
4. ✅ Supprimer une output → Disparaît du YAML

**Flow Inputs (Flow Settings):**
1. ✅ Ajouter un input → Affiche nom + type + required checkbox
2. ✅ Changer le type → 21+ types disponibles
3. ✅ Cocher required → Apparaît dans YAML comme `required: true`
4. ✅ Supprimer un input → Disparaît du YAML

**Général:**
1. ✅ Drag & drop pour réordonner (si enabled)
2. ✅ État vide avec message clair
3. ✅ Contraintes min/max respectées
4. ✅ Boutons disabled aux limites

### Tests Automatisés

**Commande:** `npm run test:agent:frontend`

**Cible:**
- useListItems: 100% coverage
- EditableListField: >90% coverage
- Item Renderers: >90% coverage

---

## Fichiers Critiques

### Nouveaux Fichiers (Framework - 11)

| Fichier | Responsabilité | Lignes |
|---------|---------------|--------|
| `hooks2/useListItems.ts` | Hook CRUD liste | ~80 |
| `hooks2/useListReordering.ts` | Hook reordering | ~60 |
| `components2/list/EditableListField.tsx` | Composant principal | ~120 |
| `components2/list/SortableItem.tsx` | Wrapper drag & drop | ~40 |
| `components2/list/renderers/KeyValueItemRenderer.tsx` | Renderer key-value | ~30 |
| `components2/list/renderers/OutputItemRenderer.tsx` | Renderer output | ~50 |
| `components2/list/renderers/InputDefinitionRenderer.tsx` | Renderer input def | ~40 |
| `types/EditableListTypes.ts` | Types TypeScript | ~30 |
| `hooks2/useListItems.test.ts` | Tests hook | ~150 |
| `components2/list/EditableListField.test.tsx` | Tests composant | ~200 |
| `components2/list/renderers/*.test.tsx` | Tests renderers (3) | ~300 |

### Fichiers Modifiés (Flow Editor - 2)

| Fichier | Changement | Lignes |
|---------|-----------|--------|
| `FlowEditorPropertiesPanel.tsx` | env + output → EditableListField | +45 |
| `FlowSettingsDialog.tsx` | inputs → EditableListField | +25 |

### Documentation (1)

| Fichier | Contenu | Lignes |
|---------|---------|--------|
| `.claude/docs/editable-list-pattern.md` | Guide architectural | ~200 |

---

## Ordre d'Implémentation

### Phase 1: Core Framework (1-2 jours)
1. Créer `useListItems` hook
2. Créer `EditableListField` composant
3. Créer `SortableItem` wrapper
4. Tests unitaires pour hook et composant

### Phase 2: Item Renderers (1 jour)
1. Créer `KeyValueItemRenderer`
2. Créer `OutputItemRenderer`
3. Créer `InputDefinitionRenderer`
4. Tests unitaires pour chaque renderer

### Phase 3: Intégration Flow Editor (0.5 jour)
1. Adapter `env` dans FlowEditorPropertiesPanel
2. Adapter `output` dans FlowEditorPropertiesPanel
3. Adapter `inputs` dans FlowSettingsDialog

### Phase 4: Reordering (optionnel - 0.5 jour)
1. Créer `useListReordering` hook
2. Intégrer dnd-kit dans EditableListField
3. Tests drag & drop

### Phase 5: Documentation & Polish (0.5 jour)
1. Écrire documentation pattern
2. Tests end-to-end manuels
3. Corrections UI/UX

**Total estimé:** 3.5 - 4.5 jours

---

## Complexité & Risques

### Complexité: MOYENNE

**Points faciles:**
- Hook `useListItems` (pattern similaire à usePagination2)
- Item renderers (composants simples)
- Intégration dans Flow Editor (substitution directe)

**Points moyens:**
- EditableListField avec gestion du drag & drop
- Synchronisation bidirectionnelle (list ↔ object YAML)
- Tests complets avec dnd-kit

**Points difficiles:**
- ❌ Aucun - architecture bien définie

### Risques

1. **Performance avec grandes listes**: Mitigé par React.memo et memoization
2. **Conflicts avec types flow-engine**: Déjà résolus (types existants)
3. **Tests drag & drop**: Nécessite mocking de dnd-kit (documenté)

---

## Bénéfices

### Utilisateur Final
- ✅ Interface intuitive (pas de JSON manuel)
- ✅ Guidance visuelle (labels, types, placeholders)
- ✅ Validation immediate (contraintes UI)
- ✅ Réordering facile (drag & drop)

### Développeur
- ✅ Pattern réutilisable (env, output, inputs, futures listes)
- ✅ Code DRY (extraction de duplication ArrayField/KeyValueField)
- ✅ Type safety (TypeScript strict)
- ✅ Testable (hooks séparés)
- ✅ Composable (features indépendantes comme DataView)

### Maintenance
- ✅ Un seul composant à maintenir au lieu de 3+
- ✅ Tests centralisés
- ✅ Documentation claire du pattern
- ✅ Évolutivité (ajout de features facile)

---

## Résumé

Cette implémentation crée un **pattern composable générique** pour gérer des listes éditables, inspiré de l'architecture DataView/Table/Grid. Le composant `EditableListField` avec ses hooks et renderers remplace les textarea JSON par des interfaces user-friendly, tout en restant réutilisable pour de futurs besoins.

**Impact:**
- 3 cas d'usage immédiats (env, output, inputs)
- Réduction de ~95% de duplication vs implémentations actuelles
- Pattern extensible pour toute future liste éditable
- UI/UX cohérente à travers l'application

🎯 **Next:** Déléguer au **frontend-dev agent** pour implémentation.
