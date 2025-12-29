# Plan : Éditeur Visuel de Flow

**Date** : 2025-12-27_10-58
**Projet** : agent-fleet
**Composant** : Éditeur Visuel de Flow

---

## 📋 Contexte

L'application agent-fleet utilise des flows YAML pour définir des workflows composés de :

- **Steps** : ModelFlowStep, ScriptFlowStep, SubFlowStep
- **Dépendances** : via le champ `depends[]`
- **Patterns complexes** : exécution parallèle, boucles (onFailure.goto), conditions (when), subflows
- **Validation** : FlowValidator avec 4 validateurs spécialisés (Schema, Graph, Semantic, Template)

**Stack actuel** :

- Frontend : React 19 + TypeScript + Vite
- UI : Radix UI + Tailwind CSS
- Déjà présent : @dnd-kit pour drag & drop

**Besoins utilisateur** :

- ✅ Édition complète avec construction visuelle
- ✅ Validation en temps réel
- ✅ Intégration dans l'app existante (nouvelle page)
- ✅ Style Radix Nova

---

## 🎯 Proposition 1 : Xyflow (React Flow v12) - RECOMMANDÉ

### Technologie

**Bibliothèque** : [Xyflow](https://xyflow.com/) v12.x (~400KB gzipped)

**Note** : Xyflow est le nouveau nom de React Flow v12+. C'est la même équipe, même philosophie, version modernisée.

**Avantages** :

- ✅ Bibliothèque battle-tested (20k+ stars GitHub) - version modernisée
- ✅ **Performance 2x meilleure** que v11 pour large flows (100+ nodes)
- ✅ **TypeScript plus strict** - meilleure inférence de types
- ✅ **Architecture plugins modulaire** - plus propre et extensible
- ✅ Fonctionnalités intégrées : drag & drop, zoom, pan, minimap, edge routing
- ✅ **Accessibilité WCAG 2.1 AA** (meilleure que v11)
- ✅ **Support mobile/touch amélioré**
- ✅ Documentation complète et migration guide depuis v11
- ✅ Intégration facile avec Radix UI
- ✅ **Future-proof** - version active avec nouvelles fonctionnalités

**Inconvénients** :

- ⚠️ Dépendance externe (~400KB)
- ⚠️ Système de layout opinionné (surpassable)

### Architecture

**Imports Xyflow** :

```typescript
import { Background, Controls, MiniMap, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
```

**Structure** :

```
packages/web-frontend/src/app/pages/flow-editor/
├── FlowEditorPage.tsx                # Page principale (route /flows/:id/edit)
├── FlowEditorCanvas.tsx              # Canvas Xyflow
├── FlowEditorToolbar.tsx             # Barre d'outils (add nodes, layout, validate)
├── FlowEditorPropertiesPanel.tsx    # Panneau de propriétés (droite)
├── FlowEditorValidationPanel.tsx    # Panneau de validation (bas)
├── nodes/
│   ├── ModelStepNode.tsx             # Node pour ModelFlowStep
│   ├── ScriptStepNode.tsx            # Node pour ScriptFlowStep
│   ├── SubFlowStepNode.tsx           # Node pour SubFlowStep
│   └── BaseStepNode.tsx              # Composants partagés
├── edges/
│   ├── DependencyEdge.tsx            # Edge standard (depends)
│   ├── ConditionalEdge.tsx           # Edge conditionnel (when)
│   └── LoopEdge.tsx                  # Edge de boucle (onFailure.goto)
├── hooks/
│   ├── useFlowEditor.ts              # État principal
│   ├── useFlowValidation.ts          # Validation temps réel
│   ├── useFlowSerialization.ts       # YAML ↔ React Flow
│   └── useNodeOperations.ts          # Opérations CRUD sur nodes
└── utils/
    ├── flowToReactFlow.ts            # FlowDefinition → React Flow
    ├── reactFlowToFlow.ts            # React Flow → FlowDefinition
    └── layoutAlgorithms.ts           # Auto-layout (dagre)
```

### Sérialisation YAML ↔ React Flow

**FlowDefinition → React Flow** :

1. Créer nodes depuis `flow.steps[]` avec positions auto-calculées
2. Créer edges depuis `step.depends[]` (type: dependency)
3. Créer edges depuis `step.onFailure.goto` (type: loop, animé)
4. Créer edges depuis conditions when (type: conditional, dashed)

**React Flow → FlowDefinition** :

1. Extraire steps depuis nodes
2. Reconstruire `depends[]` depuis edges de type dependency
3. Reconstruire `onFailure.goto` depuis edges de type loop
4. Reconstruire conditions depuis edges conditionnels

### Validation temps réel

```typescript
// Hook de validation avec debounce
useEffect(() => {
	const timeout = setTimeout(() => {
		const result = flowValidator.validate(flowDefinition);
		setValidationResult(result);

		// Mapper les issues aux nodes
		const nodesWithIssues = nodes.map(node => ({
			...node,
			data: {
				...node.data,
				validationIssues: result.issues.filter(issue => issue.location?.stepId === node.id),
			},
		}));
		setNodes(nodesWithIssues);
	}, 500);
	return () => clearTimeout(timeout);
}, [flowDefinition]);
```

### Interface (ASCII Draft)

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  Flow Editor: simple-implement v1.0.0                             [💾 Save] [✓ Validate]   │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│  [🧠 Model Step] [⌨️ Script Step] [🔄 SubFlow]  │ Layout: [Auto] [Manual]  Zoom: [-][+]   │
├───────────────────────────────────────────────────────────┬────────────────────────────────┤
│                                                            │  Properties Panel              │
│   Canvas Area (React Flow avec pan/zoom)                  │  ───────────────────           │
│                                                            │                                │
│   ┌─────────────────┐                                     │  Selected: implement           │
│   │  ○              │                                     │                                │
│   │  🧠 implement   │                                     │  Step ID                       │
│   │  Implement Task │                                     │  ┌───────────────────┐        │
│   │  [sonnet]       │                                     │  │ implement         │        │
│   └────────┬────────┘                                     │  └───────────────────┘        │
│            │                                               │                                │
│     ┌──────┴─────┬──────────┐                            │  Step Name                     │
│     │            │          │                             │  ┌───────────────────┐        │
│     ▼            ▼          ▼                             │  │ Implement Task    │        │
│  ┌──────┐   ┌──────┐   ┌──────┐                         │  └───────────────────┘        │
│  │  ⌨️  │   │  ⌨️  │   │  🧠  │                         │                                │
│  │step-b│   │step-c│   │step-d│                         │  Model                         │
│  │Script│   │Script│   │ Model│                         │  ┌───────────────────┐        │
│  └──┬───┘   └──┬───┘   └──┬───┘                         │  │ sonnet        ▼   │        │
│     │          │          │                              │  └───────────────────┘        │
│     └──────────┴──────────┘                              │                                │
│                │                                          │  Prompt                        │
│                ▼                                          │  ┌───────────────────┐        │
│           ┌────────┐                                      │  │${{inputs.task}}   │        │
│           │  ○     │                                      │  │                   │        │
│           │step-end│    Legend:                          │  │                   │        │
│           │ Done   │    ──→  Dependency                  │  └───────────────────┘        │
│           └────────┘    ╌╌→  Conditional                 │                                │
│                          ⟲   Loop                        │  ▼ Advanced                    │
│  Minimap:  [▪️▪️▪️]                                      │    When: ____________         │
│                                                            │    □ Skip on Loop             │
│                                                            │    Retry: ____________        │
│                                                            │                                │
│                                                            │  [🗑️ Delete Step]            │
├────────────────────────────────────────────────────────────┴────────────────────────────────┤
│  Validation Results                                                      2 warnings ⚠️      │
│  ──────────────────────────────────────────────────────────────────────────────────────    │
│  ⚠️  UNUSED_INPUT | Flow input 'priority' is never used                                    │
│  ⚠️  MISSING_OUTPUT | Step 'implement' has no output configuration                         │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Composants Radix UI réutilisés

- `Dialog` : assistant de création de step
- `Select` : sélection de model/type
- `Tabs` : vue visuelle / YAML
- `Collapsible` : options avancées
- `AlertDialog` : confirmation changements non sauvegardés
- `Badge` : affichage des types (model, script)
- `Button`, `Separator`, etc.

### Complexité & Estimation

**Complexité** : Moyenne
**Durée estimée** : **2-3 semaines**

**Répartition** :

- Setup React Flow + routing : 3-4 jours
- Composants Node/Edge : 2-3 jours
- Panneau de propriétés : 2-3 jours
- Intégration validation : 1-2 jours
- Sérialisation YAML : 2-3 jours
- Auto-layout : 1-2 jours
- Tests & polish : 2-3 jours

---

## 🎯 Proposition 2 : React Flow v11 (Ancienne version)

### Technologie

**Bibliothèque** : [React Flow](https://reactflow.dev/) v11.x (~400KB gzipped)

**Pourquoi considérer v11** :

- ⚠️ **Uniquement si** vous avez une dépendance critique à un plugin non migré
- ⚠️ **Approche ultra-conservatrice** (mais injustifiée pour nouveau projet)

**Différences vs Xyflow v12** :

- ❌ Performance inférieure (~50% plus lent sur large flows)
- ❌ Types TypeScript moins stricts
- ❌ Pas d'architecture plugins
- ❌ Accessibilité basique (pas WCAG 2.1 AA)
- ❌ Support mobile/touch moins bon
- ❌ Version legacy - nouvelles features sur v12 uniquement

### Recommandation

**NE PAS CHOISIR** pour un nouveau projet. Xyflow v12 est supérieur dans tous les aspects.

**Seul cas d'usage valide** :

- Migration d'un projet React Flow v11 existant où le coût de migration est trop élevé
- Dépendance critique à un plugin communautaire non compatible v12 (rare)

---

## 🎯 Proposition 3 : Solution Custom SVG + D3.js

### Technologie

**Bibliothèques** :

- D3.js v7 (~50KB) : algorithmes de layout (dagre, force)
- @dnd-kit (déjà présent) : drag & drop
- SVG natif pour rendering

**Avantages** :

- ✅ Contrôle total sur rendering et interactions
- ✅ Bundle plus petit (~100KB vs ~400KB)
- ✅ Pas de dépendance à une lib externe
- ✅ Optimisations spécifiques au domaine possibles

**Inconvénients** :

- ❌ Beaucoup plus de développement
- ❌ Maintenance plus lourde
- ❌ Réinventer la roue (zoom, pan, minimap, edge routing)
- ❌ Accessibilité à implémenter manuellement
- ❌ Plus de bugs potentiels

### Architecture

```
packages/web-frontend/src/app/pages/flow-editor/
├── FlowEditorPage.tsx                # Page principale
├── svg/
│   ├── FlowSvgContainer.tsx          # Container SVG avec viewBox
│   ├── FlowViewportControls.tsx      # Zoom/pan custom
│   ├── FlowGrid.tsx                  # Grille de fond
│   └── FlowMinimap.tsx               # Minimap custom
├── nodes/
│   ├── SvgModelStepNode.tsx          # Node SVG pour model step
│   ├── SvgScriptStepNode.tsx         # Node SVG pour script step
│   └── SvgSubFlowStepNode.tsx        # Node SVG pour subflow step
├── edges/
│   ├── SvgDependencyEdge.tsx         # <path> SVG pour dépendances
│   ├── SvgConditionalEdge.tsx        # <path> SVG dashed
│   └── SvgLoopEdge.tsx               # <path> SVG courbé avec flèche
├── hooks/
│   ├── useFlowEditor.ts              # État principal
│   ├── useSvgPanZoom.ts              # Pan/zoom custom
│   ├── useSvgDragDrop.ts             # D&D avec @dnd-kit
│   └── useD3Layout.ts                # Layouts D3 (dagre, force)
└── utils/
    ├── svgPathCalculation.ts         # Calcul courbes Bézier
    ├── svgTransforms.ts              # Transformations matricielles
    └── layoutAlgorithms.ts           # Algos D3
```

### Implémentation Pan/Zoom

```typescript
// Hook custom pour pan/zoom
const handleWheel = (e: WheelEvent) => {
	e.preventDefault();
	const delta = e.deltaY > 0 ? 0.9 : 1.1;
	setViewport(v => ({
		...v,
		zoom: clamp(v.zoom * delta, 0.1, 3),
	}));
};

// Pan avec middle-click ou Ctrl+click
const handleMouseDown = (e: MouseEvent) => {
	if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
		isPanning = true;
		startPoint = { x: e.clientX - viewport.x, y: e.clientY - viewport.y };
	}
};
```

### Rendering SVG

```typescript
// Node SVG
<g transform={`translate(${node.x}, ${node.y})`}>
  <rect
    x={0} y={0}
    width={node.width} height={node.height}
    rx={8}
    fill="hsl(var(--card))"
    stroke={selected ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
    strokeWidth={selected ? 3 : 2}
  />
  <text x={20} y={25} fontSize={14} fontWeight="600">
    {step.name}
  </text>
  {/* Handles pour connexions */}
  <circle cx={width/2} cy={0} r={10} fill="transparent" />
</g>

// Edge SVG avec Bézier
<path
  d={`M ${sx} ${sy} C ${sx} ${sy+offset}, ${tx} ${ty-offset}, ${tx} ${ty}`}
  fill="none"
  stroke="hsl(var(--border))"
  strokeWidth={2}
  markerEnd="url(#arrowhead)"
/>
```

### Interface (ASCII Draft)

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  Flow Editor: simple-implement v1.0.0                             [💾 Save] [✓ Validate]   │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│  [🧠 Model] [⌨️ Script] [🔄 SubFlow]  │  Layout: [Dagre] [Force]  Zoom: [−][100%][+]      │
├───────────────────────────────────────────────────────────┬────────────────────────────────┤
│                                                            │  Properties Panel              │
│   <svg> Custom Canvas avec pan/zoom manuel                │  ───────────────────           │
│                                                            │                                │
│   ┌─────────────────┐  ← SVG <g> elements               │  Selected: implement           │
│   │ <rect/>         │                                     │                                │
│   │ 🧠 implement    │                                     │  [Identique aux autres        │
│   │ <text/>         │                                     │   propositions]               │
│   └────────┬────────┘                                     │                                │
│            │ <path d="M...C..." />                        │                                │
│     ┌──────┴─────┬──────────┐                            │                                │
│     │            │          │                             │                                │
│  <g>│</g>     <g>│</g>   <g>│</g>                        │                                │
│     ▼            ▼          ▼                             │                                │
│                                                            │                                │
│   • Tout en SVG natif                                     │                                │
│   • Pan/zoom custom                                       │                                │
│   • Edges = <path> Bézier                                │                                │
│   • D3.js pour layout                                     │                                │
│                                                            │                                │
│  Minimap: Custom SVG                                      │                                │
│                                                            │                                │
├────────────────────────────────────────────────────────────┴────────────────────────────────┤
│  Validation Results [identique]                                                             │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Complexité & Estimation

**Complexité** : Élevée
**Durée estimée** : **5-8 semaines**

**Répartition** :

- Container SVG + pan/zoom : 3-4 jours
- Rendering nodes/edges SVG : 3-4 jours
- Intégration D3 layouts : 2-3 jours
- Drag & drop custom : 3-4 jours
- Création de connexions : 2-3 jours
- Minimap custom : 2-3 jours
- Panneau propriétés : 2-3 jours
- Validation : 1-2 jours
- Sérialisation : 2-3 jours
- Accessibilité (ARIA) : 2-3 jours
- Optimisations perf : 2-3 jours
- Tests & polish : 3-4 jours

**Quand choisir cette approche** :

- Bundle size critique absolu
- Visualisations très spécifiques impossibles avec React Flow
- Équipe expérimentée en SVG/D3
- Ressources long-terme pour maintenance

---

## 📊 Tableau Comparatif

| Critère           | Xyflow v12 (Prop 1) | React Flow v11 (Prop 2) | Custom SVG (Prop 3) |
| ----------------- | ------------------- | ----------------------- | ------------------- |
| **Temps dev**     | 2-3 semaines        | 2-3 semaines            | 5-8 semaines        |
| **Complexité**    | Moyenne             | Moyenne                 | Élevée              |
| **Bundle**        | ~400KB              | ~400KB                  | ~100KB              |
| **Performance**   | Excellente (2x v11) | Bonne                   | Bonne (si optimisé) |
| **Customisation** | Élevée              | Élevée                  | Illimitée           |
| **Maintenance**   | Faible              | Faible                  | Élevée              |
| **Accessibilité** | WCAG 2.1 AA ⭐      | Basique                 | Manuelle            |
| **Mobile**        | Excellent ⭐        | Bon                     | Manuel              |
| **Documentation** | Excellente          | Excellente              | D3/SVG docs         |
| **Risque**        | Faible              | Faible                  | Élevé               |
| **Future-proof**  | ✅ Oui              | ❌ Legacy               | 🤷 Dépend équipe    |

---

## ✅ Recommandation Principale

### **Proposition 1 : Xyflow v12 (React Flow modernisé)** ⭐

**Pourquoi ?**

1. ✅ **Meilleur équilibre** fonctionnalités / temps / risque
2. ✅ **Performance 2x meilleure** que v11 - important pour flows complexes
3. ✅ **TypeScript plus strict** - moins de bugs runtime
4. ✅ **Architecture plugins** - code plus propre et maintenable
5. ✅ **Accessibilité WCAG 2.1 AA** - meilleure que v11
6. ✅ **Time-to-market rapide** (2-3 semaines)
7. ✅ **Future-proof** - version active avec nouvelles features
8. ✅ Intégration prouvée avec Radix UI + Tailwind
9. ✅ Documentation excellente + migration guide

**C'est le choix évident pour un nouveau projet.**

### Non recommandé : **Proposition 2 : React Flow v11**

**Pourquoi éviter** :

- Version legacy - pas de nouvelles features
- Performance inférieure
- Pas d'architecture plugins
- Accessibilité limitée

**Seulement si** : Migration d'un projet v11 existant avec coût de migration élevé

### Non recommandé : **Proposition 3 : Custom SVG**

**Pourquoi éviter** :

- 2-3x plus long (5-8 semaines vs 2-3)
- Complexité et maintenance élevées
- Réinvente la roue
- Économie bundle (~300KB) ne vaut pas l'effort

---

## 🚀 Plan d'Implémentation (Proposition 1)

### Phase 1 : Fondations (Semaine 1)

**Tâches** :

1. Installer dépendances Xyflow

    ```bash
    npm install @xyflow/react dagre
    npm install -D @types/dagre
    ```

2. Créer structure de base
    - `packages/web-frontend/src/app/pages/flow-editor/FlowEditorPage.tsx`
    - Route dans `App.tsx` : `/flows/:flowId/edit`

3. Implémenter sérialisation
    - `utils/flowToReactFlow.ts` : FlowDefinition → React Flow
    - `utils/reactFlowToFlow.ts` : React Flow → FlowDefinition
    - Tests unitaires pour round-trip

4. Créer composants Node basiques
    - `nodes/ModelStepNode.tsx`
    - `nodes/ScriptStepNode.tsx`
    - `nodes/SubFlowStepNode.tsx`

5. Test avec flows.yml existants

**Critère de succès** :

- ✅ Charger un flow YAML et l'afficher visuellement
- ✅ Round-trip parfait : YAML → React Flow → YAML

### Phase 2 : Fonctionnalités Core (Semaine 2)

**Tâches** :

1. Implémenter drag & drop depuis toolbar
    - `FlowEditorToolbar.tsx` avec palette de nodes
    - Gestion du drop dans canvas

2. Créer composants Edge
    - `edges/DependencyEdge.tsx` (standard)
    - `edges/ConditionalEdge.tsx` (dashed)
    - `edges/LoopEdge.tsx` (animé, coloré)

3. Intégrer FlowValidator
    - `hooks/useFlowValidation.ts`
    - Validation temps réel avec debounce (500ms)
    - Mapper ValidationIssue → nodes

4. Créer ValidationPanel
    - `FlowEditorValidationPanel.tsx`
    - Affichage issues groupées par sévérité
    - Click sur issue → focus node

5. Affichage visuel des erreurs
    - Border rouge sur nodes avec erreurs
    - Badge compteur d'erreurs

**Critère de succès** :

- ✅ Ajouter/supprimer steps par drag & drop
- ✅ Validation temps réel fonctionnelle
- ✅ Erreurs visibles sur nodes et dans panel

### Phase 3 : Édition & Polish (Semaine 3)

**Tâches** :

1. Implémenter PropertiesPanel
    - `FlowEditorPropertiesPanel.tsx`
    - Formulaires selon type de step (model/script/subflow)
    - Intégration avec composants form existants (TextField, SelectField, etc.)
    - Section "Advanced Options" (when, skipOnLoop, retry, onFailure)

2. Gestion sélection et édition
    - Click sur node → affiche properties
    - Modifications → mise à jour immédiate
    - Validation temps réel sur édition

3. Auto-layout avec dagre
    - `utils/layoutAlgorithms.ts`
    - Button "Auto Layout" dans toolbar
    - Algorithme hierarchique (TB = Top-Bottom)

4. Actions toolbar
    - Save (POST vers API flows)
    - Validate (force validation)
    - Layout (auto-arrange)
    - Export YAML

5. Tests, bugs, polish
    - Tests E2E avec Playwright
    - Tests unitaires composants
    - Polish UI (animations, feedback)
    - Documentation inline

**Critère de succès** :

- ✅ Édition complète des properties
- ✅ Auto-layout fonctionnel
- ✅ Save vers backend
- ✅ Tous flows.yml existants chargeables et éditables

---

## 📁 Fichiers Critiques

### Lecture (existants)

- `packages/flow-engine/src/types.ts` - Types FlowDefinition, FlowStep
- `packages/flow-engine/src/validation/FlowValidator.ts` - Validation
- `packages/flow-engine/src/validation/ValidationTypes.ts` - ValidationIssue
- `.agent-fleet/flows.yml` - Exemples de flows pour tests

### Création (nouveaux)

- `packages/web-frontend/src/app/pages/flow-editor/` - Tous les composants de l'éditeur
- `packages/web-frontend/src/app/App.tsx` - Ajout routes

### Modification (existants)

- `packages/web-frontend/package.json` - Ajout dépendances

---

## ⚠️ Risques & Mitigation

### Risques Techniques

1. **Performance avec large flows**
    - **Mitigation** : React Flow gère bien 100+ nodes ; virtualisation si besoin
    - **Fallback** : Passer à Xyflow si nécessaire

2. **Complexité sérialisation**
    - **Mitigation** : Types TypeScript stricts facilitent le mapping
    - **Tests** : Tests unitaires exhaustifs avec tous les flows.yml

3. **Mapping validation**
    - **Mitigation** : ValidationIssue.location.stepId déjà présent
    - **Direct** : Mapping trivial validation → nodes

4. **Edge routing loops/conditionals**
    - **Mitigation** : React Flow gère bien les cas standards
    - **Custom** : Composants edge custom pour cas spéciaux

### Risques Intégration

1. **Radix UI + React Flow conflicts**
    - **Mitigation** : Les deux sont React-first, compatibles
    - **Test early** : Spike d'intégration en Phase 1

2. **Tailwind dans React Flow nodes**
    - **Mitigation** : Tailwind fonctionne dans composants React Flow
    - **Validation** : Test dès Phase 1

---

## 📋 Prochaines Étapes

1. ✅ **Validation stakeholder** sur approche (recommandation : Proposition 1 - Xyflow v12) ✅ **VALIDÉ**
2. 🔬 **Spike technique** (1-2 jours) :
    - Intégration React Flow + Radix UI
    - Sérialisation round-trip avec flow réel
    - Mapping validation
3. 🚀 **Démarrer Phase 1** si validation OK
4. 🔄 **Itérer** selon feedback utilisateur

---

## 💡 Notes Additionnelles

- **Style Radix Nova** : Utiliser les CSS variables existantes (--primary, --card, --border, etc.)
- **Cohérence UI** : Réutiliser au maximum les composants framework existants
- **Accessibilité** : React Flow fournit déjà navigation clavier et ARIA
- **Mobile** : React Flow supporte touch, mais peut être amélioré si besoin critique
- **Documentation** : Ajouter guide utilisateur dans `.claude/docs/`
- **Tests** : Couvrir sérialisation, validation mapping, opérations CRUD
