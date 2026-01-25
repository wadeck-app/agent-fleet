# Plan: Synchronisation bidirectionnelle YAML ↔ Éditeur visuel + Diff View

## Problème identifié

**Fichier:** `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorRightPanel.tsx:40-47`

Le panneau YAML affiche `flowDefinition` (l'état chargé depuis le backend), mais les modifications visuelles sont stockées dans `nodes` et `edges`. Le YAML ne reflète donc pas les changements en temps réel.

```typescript
// Code actuel - affiche l'état SAUVEGARDÉ, pas l'état ÉDITÉ
const yamlContent = flowDefinition
  ? yaml.dump(flowDefinition, { ... })
  : '';
```

**Impacts:**

1. Quand l'utilisateur édite visuellement, le YAML n'est pas mis à jour en temps réel
2. Impossible de voir quelles modifications seront sauvegardées
3. Impossible d'éditer le YAML directement et de synchroniser avec l'éditeur visuel
4. Pas de vue diff pour comparer l'état original vs édité

## Gaps de complétude identifiés

**Analyse complète:** L'exploration a révélé que certaines propriétés du YAML ne sont PAS éditables dans l'UI:

### Propriétés manquantes (YAML → Visual)

- ❌ **workspace.mode**, **gitStrategy**, **reusePolicy** (flow-level, HIGH priority)
- ❌ **flowDefinition.version** (flow-level, MEDIUM)
- ❌ **flowDefinition.inputs** (flow-level, MEDIUM)
- ❌ **step.env** (script steps, MEDIUM)
- ❌ **step.output** (tous steps, LOW)
- ❌ **step.skipOnLoop** (tous steps, LOW)
- ❌ **step.timeout** (user intervention, MEDIUM)
- ❌ **step.workspaceStrategy** (subflow, LOW)

**Note:** Ces gaps seront comblés dans une phase ultérieure. Ce plan se concentre sur la synchronisation YAML ↔ Visual pour les propriétés déjà supportées.

## Solution recommandée

**Approche multi-phases:**

### Phase 1: Preview YAML temps réel (base)

Calculer un `previewFlow` qui reflète l'état visuel actuel

### Phase 2: Vue diff avec annotations (added/modified/removed)

Afficher les changements ligne par ligne entre original et preview

### Phase 3: Tabs multiples (Original / Preview / Diff)

Permettre de basculer entre les 3 vues

### Phase 4: Export individuel

Boutons d'export pour chaque version

### Phase 5: Édition bidirectionnelle (YAML → Visual)

Permettre d'éditer le YAML et mettre à jour l'éditeur visuel

### Avantages

- ✅ **Preview temps réel:** Voir immédiatement l'impact des modifications visuelles
- ✅ **Diff view:** Visualiser précisément ce qui a changé (added/removed/modified)
- ✅ **Flexibilité:** Basculer entre original, preview, et diff selon le besoin
- ✅ **Export:** Exporter n'importe quelle version du YAML
- ✅ **Bidirectionnel:** Éditer soit visuellement, soit en YAML
- ✅ **Performance:** Mémoisation pour éviter les recalculs inutiles

## Étapes d'implémentation

## PHASE 1: Preview YAML temps réel

### 1.1. Créer le hook `useFlowPreview`

**Fichier:** `packages/web-frontend/src/app/pages/flows/flow-editor/hooks/useFlowPreview.ts` (nouveau)

**Responsabilité:** Calculer le `FlowDefinition` preview à partir de l'état visuel actuel

```typescript
import { useMemo } from 'react';

import type { FlowEdge, FlowNode } from '../types';
import type { FlowDefinition } from '../types/flow-engine.types';
import { reactFlowToFlowDefinition } from '../utils/flowToReactFlow';

/**
 * Computes a preview FlowDefinition from current visual editor state
 * This preview reflects what WILL be saved when user clicks Save
 */
export function useFlowPreview(
	baseFlow: FlowDefinition | null,
	nodes: FlowNode[],
	edges: FlowEdge[]
): FlowDefinition | null {
	return useMemo(() => {
		if (!baseFlow) return null;
		return reactFlowToFlowDefinition(baseFlow, nodes, edges);
	}, [baseFlow, nodes, edges]);
}
```

### 1.2. Exporter les edges non filtrés depuis `useFlowEditor`

**Fichier:** `packages/web-frontend/src/app/pages/flows/flow-editor/hooks/useFlowEditor.ts:577`

```typescript
// Avant
edges: filteredEdges,

// Après
edges: filteredEdges,  // For visual display
allEdges: edges,       // For preview computation (includes hidden edges)
```

### 1.3. Installer la librairie `diff`

**Commande:**

```bash
npm install diff@^5.1.0
npm install -D @types/diff@^5.0.2
```

**Justification:** Librairie standard pour computing line diffs (5KB, utilisée par GitHub/GitLab)

---

## PHASE 2: Vue diff avec annotations

### 2.1. Créer l'utilitaire de diff

**Fichier:** `packages/web-frontend/src/app/pages/flows/flow-editor/utils/computeFlowDiff.ts` (nouveau)

```typescript
import * as diff from 'diff';
import * as yaml from 'js-yaml';

import type { FlowDefinition } from '../types/flow-engine.types';

export type DiffLineType = 'added' | 'removed' | 'unchanged' | 'modified';

export interface DiffLine {
	type: DiffLineType;
	lineNumber: number; // Line number in result
	originalLineNumber?: number; // Line number in original (for context)
	content: string;
	count?: number; // Number of consecutive lines of same type
}

export interface DiffSummary {
	additions: number;
	deletions: number;
	modifications: number;
}

/**
 * Compute line-by-line diff between two FlowDefinitions
 */
export function computeFlowDiff(
	original: FlowDefinition | null,
	preview: FlowDefinition | null
): { lines: DiffLine[]; summary: DiffSummary } {
	if (!original || !preview) {
		return { lines: [], summary: { additions: 0, deletions: 0, modifications: 0 } };
	}

	const yamlOriginal = yaml.dump(original, { indent: 2, lineWidth: 120 });
	const yamlPreview = yaml.dump(preview, { indent: 2, lineWidth: 120 });

	const changes = diff.diffLines(yamlOriginal, yamlPreview);

	const lines: DiffLine[] = [];
	let lineNumber = 0;
	let originalLineNumber = 0;
	const summary = { additions: 0, deletions: 0, modifications: 0 };

	for (const change of changes) {
		const count = change.count || 0;

		if (change.added) {
			summary.additions += count;
			change.value
				.split('\n')
				.filter(l => l)
				.forEach(line => {
					lines.push({
						type: 'added',
						lineNumber: ++lineNumber,
						content: line,
					});
				});
		} else if (change.removed) {
			summary.deletions += count;
			change.value
				.split('\n')
				.filter(l => l)
				.forEach(line => {
					lines.push({
						type: 'removed',
						lineNumber: lineNumber,
						originalLineNumber: ++originalLineNumber,
						content: line,
					});
				});
		} else {
			change.value
				.split('\n')
				.filter(l => l)
				.forEach(line => {
					lines.push({
						type: 'unchanged',
						lineNumber: ++lineNumber,
						originalLineNumber: ++originalLineNumber,
						content: line,
					});
				});
		}
	}

	// Detect modifications (adjacent add+remove)
	for (let i = 0; i < lines.length - 1; i++) {
		if (lines[i].type === 'removed' && lines[i + 1].type === 'added') {
			lines[i].type = 'modified';
			lines[i + 1].type = 'modified';
			summary.modifications++;
			summary.additions--;
			summary.deletions--;
		}
	}

	return { lines, summary };
}
```

### 2.2. Créer le composant `FlowDiffViewer`

**Fichier:** `packages/web-frontend/src/app/pages/flows/flow-editor/components/FlowDiffViewer.tsx` (nouveau)

```typescript
import { AlertCircle, Minus, Plus, Tilde } from 'lucide-react';
import type { DiffLine, DiffSummary } from '../utils/computeFlowDiff';
import { cn } from '../utils/cn';

interface FlowDiffViewerProps {
  lines: DiffLine[];
  summary: DiffSummary;
}

export function FlowDiffViewer({ lines, summary }: FlowDiffViewerProps) {
  if (lines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No changes detected
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Summary Header */}
      <div className="flex gap-2 border-b bg-muted/30 p-2 text-xs">
        <span className="flex items-center gap-1 text-green-600">
          <Plus className="size-3" />
          +{summary.additions}
        </span>
        <span className="flex items-center gap-1 text-red-600">
          <Minus className="size-3" />
          −{summary.deletions}
        </span>
        <span className="flex items-center gap-1 text-yellow-600">
          <Tilde className="size-3" />
          ~{summary.modifications}
        </span>
      </div>

      {/* Diff Lines */}
      <div className="flex-1 overflow-auto font-mono text-xs">
        {lines.map((line, idx) => (
          <div
            key={idx}
            className={cn(
              'flex gap-2 px-3 py-0.5',
              line.type === 'added' && 'bg-green-50 text-green-800',
              line.type === 'removed' && 'bg-red-50 text-red-800 line-through',
              line.type === 'modified' && 'bg-yellow-50 text-yellow-800',
              line.type === 'unchanged' && 'text-muted-foreground'
            )}
          >
            {/* Icon */}
            <span className="flex w-4 items-center justify-center">
              {line.type === 'added' && <Plus className="size-3 text-green-600" />}
              {line.type === 'removed' && <Minus className="size-3 text-red-600" />}
              {line.type === 'modified' && <Tilde className="size-3 text-yellow-600" />}
            </span>

            {/* Line Number */}
            <span className="w-8 text-right opacity-50">{line.lineNumber}</span>

            {/* Content */}
            <span className="flex-1">{line.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## PHASE 3: Tabs multiples (Original / Preview / Diff)

### 3.1. Refactoriser `FlowEditorRightPanel` avec tabs

**Fichier:** `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorRightPanel.tsx`

**Changements:**

1. **Ajouter props pour preview:**

```typescript
interface FlowEditorRightPanelProps {
	flowDefinition: FlowDefinition | null;
	validationResult: ValidationResult | null;
	onIssueClick: (stepId: string) => void;
	nodes: FlowNode[]; // NEW
	allEdges: FlowEdge[]; // NEW
}
```

2. **Ajouter state pour tabs YAML:**

```typescript
const [yamlTab, setYamlTab] = useState<'original' | 'preview' | 'diff'>('preview');
const [activeTab, setActiveTab] = useState<'yaml' | 'validation'>('yaml');
```

3. **Calculer preview et diff:**

```typescript
const previewFlow = useFlowPreview(flowDefinition, nodes, allEdges);
const { lines: diffLines, summary: diffSummary } = computeFlowDiff(flowDefinition, previewFlow);
```

4. **Générer YAML selon le tab actif:**

```typescript
const originalYaml = flowDefinition ? yaml.dump(flowDefinition, {...}) : '';
const previewYaml = previewFlow ? yaml.dump(previewFlow, {...}) : '';
```

5. **Modifier le rendu du tab YAML:**

```typescript
<TabsContent value="yaml" className="...">
  {/* Sub-tabs pour Original / Preview / Diff */}
  <Tabs value={yamlTab} onValueChange={(v) => setYamlTab(v as any)}>
    <TabsList className="mb-2">
      <TabsTrigger value="original">Original</TabsTrigger>
      <TabsTrigger value="preview">
        Preview
        {isDirty && <span className="ml-1 text-xs">•</span>}
      </TabsTrigger>
      <TabsTrigger value="diff">
        Diff
        {diffSummary.additions + diffSummary.deletions > 0 && (
          <span className="ml-1 rounded-full bg-primary/20 px-1.5 text-xs">
            {diffSummary.additions + diffSummary.deletions}
          </span>
        )}
      </TabsTrigger>
    </TabsList>

    <TabsContent value="original">
      <pre className="..."><code>{originalYaml}</code></pre>
    </TabsContent>

    <TabsContent value="preview">
      <pre className="..."><code>{previewYaml}</code></pre>
    </TabsContent>

    <TabsContent value="diff">
      <FlowDiffViewer lines={diffLines} summary={diffSummary} />
    </TabsContent>
  </Tabs>
</TabsContent>
```

### 3.2. Propager les props depuis `FlowEditorPage`

**Fichier:** `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorPage.tsx`

```typescript
<FlowEditorRightPanel
  flowDefinition={flowEditor.flowDefinition}
  validationResult={flowEditor.validationResult}
  onIssueClick={flowEditor.focusNodeFromIssue}
  nodes={flowEditor.nodes}         // NEW
  allEdges={flowEditor.allEdges}   // NEW
/>
```

---

## PHASE 4: Export individuel

### 4.1. Ajouter boutons d'export dans `FlowEditorRightPanel`

**Position:** Header du tab YAML, à côté du bouton collapse

```typescript
import { Download } from 'lucide-react';

// Dans le header:
<div className="flex items-center gap-2">
  <Button
    variant="ghost"
    size="sm"
    onClick={() => handleExport(yamlTab)}
    title={`Export ${yamlTab} YAML`}
  >
    <Download className="size-4" />
  </Button>
  <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
    <ChevronRight className="size-4" />
  </Button>
</div>
```

### 4.2. Implémenter la fonction d'export

```typescript
const handleExport = (version: 'original' | 'preview' | 'diff') => {
	if (!flowDefinition) return;

	let content: string;
	let filename: string;

	switch (version) {
		case 'original':
			content = originalYaml;
			filename = `${flowDefinition.name || flowDefinition.id}_original.yaml`;
			break;
		case 'preview':
			content = previewYaml;
			filename = `${flowDefinition.name || flowDefinition.id}_preview.yaml`;
			break;
		case 'diff':
			// Export diff as text with +/- prefixes
			content = diffLines
				.map(line => {
					const prefix = line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  ';
					return `${prefix}${line.content}`;
				})
				.join('\n');
			filename = `${flowDefinition.name || flowDefinition.id}_diff.txt`;
			break;
	}

	// Trigger download
	const blob = new Blob([content], { type: 'text/plain' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
};
```

---

## PHASE 5: Édition bidirectionnelle (YAML → Visual)

### 5.1. Ajouter mode édition au YAML panel

**État à ajouter:**

```typescript
const [isEditingYaml, setIsEditingYaml] = useState(false);
const [editedYaml, setEditedYaml] = useState('');
const [yamlError, setYamlError] = useState<string | null>(null);
```

**Bouton "Edit YAML":**

```typescript
{!isEditingYaml && (
  <Button variant="ghost" size="sm" onClick={() => {
    setIsEditingYaml(true);
    setEditedYaml(yamlTab === 'original' ? originalYaml : previewYaml);
  }}>
    <Edit className="size-4" />
  </Button>
)}
```

### 5.2. Créer le composant `YamlEditor`

**Fichier:** `packages/web-frontend/src/app/pages/flows/flow-editor/components/YamlEditor.tsx` (nouveau)

```typescript
import { useState } from 'react';
import { Button } from '@framework/components/primitives/Button';
import { AlertCircle, Check, X } from 'lucide-react';
import * as yaml from 'js-yaml';

interface YamlEditorProps {
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

export function YamlEditor({ initialValue, onSave, onCancel }: YamlEditorProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    try {
      // Validate YAML syntax
      yaml.load(value);
      setError(null);
      onSave(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid YAML');
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Editor */}
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="flex-1 resize-none bg-muted p-3 font-mono text-xs"
        spellCheck={false}
      />

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 border-t bg-destructive/10 p-2 text-xs text-destructive">
          <AlertCircle className="size-4" />
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 border-t p-2">
        <Button size="sm" onClick={handleSave}>
          <Check className="size-4" />
          Apply
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="size-4" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
```

### 5.3. Intégrer l'éditeur dans `FlowEditorRightPanel`

```typescript
{isEditingYaml ? (
  <YamlEditor
    initialValue={editedYaml}
    onSave={handleApplyYamlEdit}
    onCancel={() => setIsEditingYaml(false)}
  />
) : (
  // Affichage normal des tabs Original/Preview/Diff
)}
```

### 5.4. Implémenter `handleApplyYamlEdit`

**Fonction qui convertit le YAML édité en nodes/edges:**

```typescript
const handleApplyYamlEdit = (yamlContent: string) => {
	try {
		// Parse YAML to FlowDefinition
		const editedFlow = yaml.load(yamlContent) as FlowDefinition;

		// Validate structure (basic check)
		if (!editedFlow.steps || !Array.isArray(editedFlow.steps)) {
			throw new Error('Invalid flow structure: missing steps array');
		}

		// Convert to nodes/edges using existing conversion function
		const { nodes: newNodes, edges: newEdges } = flowDefinitionToReactFlow(editedFlow);

		// Apply auto-layout to position new nodes
		const layoutedNodes = applyDagreLayout(newNodes, newEdges);

		// Update editor state (via callback from useFlowEditor)
		onApplyYamlChanges(editedFlow, layoutedNodes, newEdges);

		setIsEditingYaml(false);
		setYamlError(null);
	} catch (err) {
		setYamlError(err instanceof Error ? err.message : 'Failed to apply YAML changes');
	}
};
```

### 5.5. Ajouter la callback dans `useFlowEditor`

**Fichier:** `packages/web-frontend/src/app/pages/flows/flow-editor/hooks/useFlowEditor.ts`

```typescript
const applyYamlChanges = useCallback(
  (newFlow: FlowDefinition, newNodes: FlowNode[], newEdges: FlowEdge[]) => {
    setFlowDefinition(newFlow);
    setNodes(newNodes);
    setEdges(newEdges);
    setIsDirty(true);
  },
  []
);

// Export in return:
return {
  // ... existing exports
  applyYamlChanges,
};
```

### 5.6. Gérer la perte des positions visuelles

**Défi:** Le YAML ne stocke pas les positions X/Y des nœuds.

**Solution:** Appliquer l'auto-layout après import YAML:

```typescript
import { applyDagreLayout } from '../utils/layoutAlgorithms';

// Dans handleApplyYamlEdit:
const layoutedNodes = applyDagreLayout(newNodes, newEdges);
```

**Note:** Cela repositionnera tous les nœuds. Afficher un avertissement à l'utilisateur avant d'appliquer.

## Cas limites gérés

### 1. Nœuds constants (UI uniquement)

**Statut:** ✅ Déjà géré par `reactFlowToFlowDefinition()` (ligne 103 dans flowToReactFlow.ts)

```typescript
const backendNodes = nodes.filter(n => n.type !== 'constant');
```

### 2. Edges de data flow (UI uniquement)

**Statut:** ✅ Déjà géré par `reactFlowToFlowDefinition()` (ligne 102 dans flowToReactFlow.ts)

```typescript
const backendEdges = edges.filter(e => e.data?.edgeType !== 'dataflow');
```

### 3. Flows volumineux (100+ nœuds)

**Mitigation:**

- Démarrer SANS debouncing (plus simple)
- Monitorer les performances dans la console
- Ajouter du debouncing si les utilisateurs rapportent du lag

**Si nécessaire plus tard:**

```typescript
import { useDebounce } from '@framework/hooks2/useDebounce';

const debouncedNodes = useDebounce(nodes, 200);
const debouncedEdges = useDebounce(edges, 200);
const preview = useFlowPreview(flowDefinition, debouncedNodes, debouncedEdges);
```

### 4. Nouveau flow vide

**Statut:** ✅ Géré - `useFlowPreview` retourne `null`, le YAML panel affiche "No flow loaded"

### 5. Validation

**Note:** La validation utilise actuellement `flowDefinition` (ligne 39 dans useFlowEditor.ts), pas le preview.

**Amélioration future (hors scope):** Passer le preview au lieu de `flowDefinition` pour valider l'état édité plutôt que l'état sauvegardé.

## Vérification

### Tests unitaires

**Fichier:** `packages/web-frontend/src/app/pages/flows/flow-editor/hooks/useFlowPreview.test.ts` (nouveau)

```typescript
describe('useFlowPreview', () => {
	it('returns null when baseFlow is null', () => {
		// Test avec baseFlow = null
	});

	it('computes preview correctly for simple flow', () => {
		// Test avec un flow basique
	});

	it('memoizes result when inputs unchanged', () => {
		// Vérifier que même référence objet si inputs identiques
	});

	it('filters out constant nodes', () => {
		// Vérifier que les nœuds constants n'apparaissent pas
	});

	it('filters out data flow edges', () => {
		// Vérifier que les edges de data flow n'apparaissent pas
	});

	it('includes dependency edges in preview', () => {
		// Vérifier que les dépendances sont dans le YAML
	});
});
```

### Tests d'intégration

**Fichier:** `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorRightPanel.test.tsx`

```typescript
describe('FlowEditorRightPanel YAML Preview', () => {
	it('updates YAML when node is added', () => {
		// Ajouter un nœud → vérifier que YAML change
	});

	it('updates YAML when node property changes', () => {
		// Modifier une propriété → vérifier YAML
	});

	it('updates YAML when edge is created', () => {
		// Créer une dépendance → vérifier dans depends[]
	});

	it('does not include constant nodes in YAML', () => {
		// Ajouter un nœud constant → vérifier absence dans YAML
	});

	it('YAML matches what saveFlow would save', () => {
		// Comparer preview avec résultat de saveFlow()
	});
});
```

### Checklist de test manuel

1. ✅ Charger un flow existant → YAML s'affiche correctement
2. ✅ Ajouter un nouveau nœud → YAML se met à jour immédiatement
3. ✅ Éditer une propriété (nom, prompt, etc.) → YAML se met à jour
4. ✅ Créer une edge de dépendance → YAML montre dans `depends` array
5. ✅ Supprimer une edge → YAML retire de `depends` array
6. ✅ Ajouter un nœud constant → YAML ne l'inclut PAS
7. ✅ Sauvegarder le flow → YAML reste identique (preview = état sauvegardé)
8. ✅ Basculer la visibilité des edges → YAML ne change PAS (utilise `allEdges`)
9. ✅ Flow volumineux (50+ nœuds) → Pas de lag perceptible

### Test de performance

**Objectif:** Vérifier que la conversion est assez rapide pour du temps réel

**Benchmarks attendus:**

- 10 nœuds: < 1ms
- 50 nœuds: < 5ms
- 100 nœuds: < 10ms
- 500 nœuds: Évaluer si debouncing nécessaire

**Méthode:** `performance.now()` dans la console du navigateur

## Améliorations futures (hors scope de ce plan)

### 1. Combler les gaps de propriétés YAML

**Priority:** HIGH

Ajouter des UIs pour éditer les propriétés actuellement manquantes:

- Flow-level: `workspace.mode`, `gitStrategy`, `reusePolicy`, `version`, `inputs`
- Step-level: `env` (script), `output`, `skipOnLoop`, `timeout` (user intervention), `workspaceStrategy` (subflow)

**Approche:** Créer un dialog "Flow Configuration" pour les propriétés flow-level, étendre les panneaux de propriétés pour les step-level.

### 2. Syntax highlighting pour YAML

**Library:** `shiki` ou `highlight.js`

Ajouter de la coloration syntaxique dans les vues YAML (Original/Preview) pour améliorer la lisibilité.

### 3. Undo/Redo pour édition YAML

Implémenter un historique d'éditions permettant d'annuler/refaire les changements YAML → Visual.

### 4. Validation avancée YAML

Valider le YAML édité contre le schéma TypeScript `FlowDefinition` avec des messages d'erreur détaillés (champs manquants, types incorrects, etc.).

## Fichiers critiques

### Nouveaux fichiers (à créer)

| Fichier                              | Responsabilité                  | Lines (estimées) |
| ------------------------------------ | ------------------------------- | ---------------- |
| `hooks/useFlowPreview.ts`            | Calculer preview FlowDefinition | ~20              |
| `utils/computeFlowDiff.ts`           | Computing line diffs            | ~80              |
| `components/FlowDiffViewer.tsx`      | Afficher diff avec annotations  | ~60              |
| `components/YamlEditor.tsx`          | Éditeur YAML avec validation    | ~50              |
| `hooks/useFlowPreview.test.ts`       | Tests unitaires                 | ~100             |
| `components/FlowDiffViewer.test.tsx` | Tests composant                 | ~80              |
| `utils/computeFlowDiff.test.ts`      | Tests diff utility              | ~100             |

### Fichiers modifiés

| Fichier                    | Lignes        | Changement                                               |
| -------------------------- | ------------- | -------------------------------------------------------- |
| `hooks/useFlowEditor.ts`   | 577, 603-607  | Exporter `allEdges`, ajouter `applyYamlChanges` callback |
| `FlowEditorRightPanel.tsx` | 12-16, 40-300 | Refactoriser avec tabs multiples, diff, export, édition  |
| `FlowEditorPage.tsx`       | ~130-137      | Passer `nodes` et `allEdges`                             |
| `package.json`             | dependencies  | Ajouter `diff@^5.1.0` et `@types/diff@^5.0.2`            |

### Fonctions de conversion (référence)

- **Visual → YAML:** `utils/flowToReactFlow.ts:96-150` - `reactFlowToFlowDefinition(baseFlow, nodes, edges)`
- **YAML → Visual:** `utils/flowToReactFlow.ts:8-91` - `flowDefinitionToReactFlow(flow)`
- **Auto-layout:** `utils/layoutAlgorithms.ts` - `applyDagreLayout(nodes, edges)`

---

## Résumé

Cette solution complète fournit:

### ✅ Phase 1: Preview temps réel

- Hook `useFlowPreview` calculant le YAML qui sera sauvegardé
- Mémoisation pour performance optimale
- Export de `allEdges` depuis `useFlowEditor`

### ✅ Phase 2: Diff view

- Utilitaire `computeFlowDiff` basé sur la librairie `diff`
- Composant `FlowDiffViewer` avec annotations colorées (added/removed/modified)
- Summary header affichant le nombre de changements

### ✅ Phase 3: Tabs multiples

- 3 tabs: Original / Preview / Diff
- Indicateurs visuels (• pour isDirty, badge de count pour diff)
- Navigation facile entre les vues

### ✅ Phase 4: Export individuel

- Bouton Download pour chaque version
- Export Original/Preview en `.yaml`
- Export Diff en `.txt` avec préfixes +/-

### ✅ Phase 5: Édition bidirectionnelle

- Composant `YamlEditor` avec textarea et validation
- Parsing YAML → FlowDefinition → nodes/edges
- Auto-layout automatique après import
- Gestion d'erreurs avec messages clairs

### Complexité estimée

| Phase     | Effort  | Fichiers                   | Tests         |
| --------- | ------- | -------------------------- | ------------- |
| Phase 1   | 4h      | 2 nouveaux, 1 modifié      | 2h            |
| Phase 2   | 6h      | 2 nouveaux                 | 3h            |
| Phase 3   | 4h      | 1 modifié                  | 2h            |
| Phase 4   | 2h      | 1 modifié                  | 1h            |
| Phase 5   | 6h      | 1 nouveau, 2 modifiés      | 2h            |
| **Total** | **22h** | **5 nouveaux, 4 modifiés** | **10h (45%)** |

**Note importante:** Déléguer l'implémentation frontend au **frontend-dev agent** (requis par `CLAUDE.md` pour tout changement dans `packages/web-frontend/src/**`).

---

## Ordre d'implémentation recommandé

**Impératif:** Implémenter les phases dans l'ordre (1 → 2 → 3 → 4 → 5) car chaque phase dépend de la précédente.

1. **Phase 1:** Base nécessaire pour toutes les autres phases
2. **Phase 2:** Fournit le diff utile pour Phase 3
3. **Phase 3:** Intègre Phase 1 et 2 dans l'UI
4. **Phase 4:** Simple ajout fonctionnel sur Phase 3
5. **Phase 5:** Feature avancée utilisant les conversions existantes

**Checkpoint après chaque phase:** Tester manuellement et exécuter `/check` avant de passer à la phase suivante.
