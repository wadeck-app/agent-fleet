# Plan: Refactor Dialog Component Hierarchy

**Status:** 📋 Planned
**Priority:** Medium
**Estimated effort:** 8-11 hours
**Created:** 2026-01-22

---

## Objectif

Remplacer `CrudDialog` (nom trompeur) par une hiérarchie claire de composants Dialog adaptés à chaque cas d'usage.

---

## Problème actuel

- `CrudDialog` utilisé pour **tous** les types de dialogs (29+ usages)
- Nom suggère "CRUD" mais utilisé pour sélection, info, configuration, etc.
- Confusion pour les développeurs
- Props génériques → pas de type-safety spécifique

---

## Solution proposée

### Nouvelle hiérarchie

```
Dialog (Radix base primitive)
├── BaseDialog (wrapper générique - ex-CrudDialog)
│   ├── FormDialog (formulaires Create/Edit avec Save/Cancel)
│   ├── TwoColumnDialog (sélection/association 2 colonnes)
│   ├── InfoDialog (affichage info read-only)
│   └── WizardDialog (future - multi-steps)
└── AlertDialog (confirmations destructives - existe déjà)
```

---

## Phase 1: Créer les nouveaux composants (3-4h)

### 1.1 Renommer CrudDialog → BaseDialog

**Fichier:** `packages/web-frontend/src/framework/components/overlays/BaseDialog.tsx`

```bash
# Renommer le fichier
mv CrudDialog.tsx BaseDialog.tsx
mv CrudDialog.stories.tsx BaseDialog.stories.tsx
```

**Modifications:**

- Renommer `CrudDialog` → `BaseDialog`
- Renommer `CrudDialogProps` → `BaseDialogProps`
- Ajouter JSDoc expliquant que c'est la base pour tous les dialogs
- Mettre à jour les exports dans `index.ts`

**Tests:**

- Vérifier que le build passe
- Vérifier Storybook

---

### 1.2 Créer FormDialog

**Fichier:** `packages/web-frontend/src/framework/components/overlays/FormDialog.tsx`

**Interface:**

```typescript
interface FormDialogProps extends Omit<BaseDialogProps, 'children'> {
	mode: 'create' | 'edit';
	onSave: () => Promise<void>;
	onCancel?: () => void;
	isSaving?: boolean;
	saveButtonText?: string;
	cancelButtonText?: string;
	children: ReactNode;
	footer?: ReactNode; // Custom footer si besoin
	showDefaultFooter?: boolean; // Par défaut true
}
```

**Features:**

- Extends BaseDialog
- Footer automatique avec boutons Save/Cancel
- Gère le loading state (isSaving)
- Props typées pour mode create/edit
- Empêche la fermeture pendant save (optionnel)

**Exemple d'usage:**

```tsx
<FormDialog
  open={open}
  onOpenChange={setOpen}
  title="Create Task"
  mode="create"
  onSave={handleSave}
  isSaving={isSaving}
>
  <FormContainer>
    <TextField label="Name" {...} />
    <TextAreaField label="Description" {...} />
  </FormContainer>
</FormDialog>
```

**Tests unitaires:**

- Render avec mode create/edit
- Click sur Save appelle onSave
- Loading state désactive les boutons
- Fermeture bloquée pendant save

---

### 1.3 Créer TwoColumnDialog

**Fichier:** `packages/web-frontend/src/framework/components/overlays/TwoColumnDialog.tsx`

**Interface:**

```typescript
interface ColumnConfig {
	title: string;
	subtitle?: string; // Ex: "(3/10)"
	children: ReactNode;
	actions?: ReactNode; // Boutons d'action
	emptyState?: ReactNode; // État vide
}

interface TwoColumnDialogProps extends Omit<BaseDialogProps, 'children'> {
	leftColumn: ColumnConfig;
	rightColumn: ColumnConfig & {
		searchable?: boolean;
		searchPlaceholder?: string;
		onSearch?: (query: string) => void;
	};
	columnGap?: number; // Default: 6 (1.5rem)
}
```

**Features:**

- Layout `grid-cols-2` automatique
- SearchBar optionnel dans colonne droite
- Scrolling indépendant par colonne (max-h-[500px])
- Headers stylés avec titres et actions
- Empty states pour chaque colonne

**Exemple d'usage:**

```tsx
<TwoColumnDialog
	open={open}
	onOpenChange={setOpen}
	title="Manage Workspaces"
	maxWidth="5xl"
	leftColumn={{
		title: 'Associated Workspaces',
		subtitle: `(${associated.length}/${max})`,
		children: <AssociatedList />,
		actions: <SaveCancelButtons />,
		emptyState: <EmptyState icon="📁" text="No workspaces" />,
	}}
	rightColumn={{
		title: 'Available Workspaces',
		searchable: true,
		searchPlaceholder: 'Search workspaces...',
		onSearch: setSearchQuery,
		children: <AvailableList />,
		actions: <DiscoverButton />,
	}}
/>
```

**Tests unitaires:**

- Render avec 2 colonnes
- SearchBar apparaît si searchable=true
- Scroll indépendant
- Empty states

---

### 1.4 Créer InfoDialog

**Fichier:** `packages/web-frontend/src/framework/components/overlays/InfoDialog.tsx`

**Interface:**

```typescript
type InfoVariant = 'info' | 'success' | 'warning' | 'error';

interface InfoDialogProps extends BaseDialogProps {
	variant?: InfoVariant;
	icon?: ReactNode;
	onOk?: () => void;
	okButtonText?: string;
	showOkButton?: boolean; // Default: true
}
```

**Features:**

- Icône automatique selon variant (optionnel)
- Couleurs selon variant
- Bouton OK unique (ferme le dialog)
- Read-only (pas de formulaire)

**Exemple d'usage:**

```tsx
<InfoDialog
	open={open}
	onOpenChange={setOpen}
	title="Connection Status"
	variant="success"
	icon={<CheckCircle />}
	onOk={() => setOpen(false)}
>
	<p>Successfully connected to server!</p>
	<p>Response time: 42ms</p>
</InfoDialog>
```

**Tests unitaires:**

- Variants (colors/icons)
- Bouton OK ferme le dialog
- Custom icon override

---

### 1.5 Créer CrudDialog (deprecated alias)

**Fichier:** `packages/web-frontend/src/framework/components/overlays/CrudDialog.tsx`

**Contenu:**

```tsx
import { BaseDialog, type BaseDialogProps } from './BaseDialog';

/**
 * @deprecated Use BaseDialog, FormDialog, or TwoColumnDialog instead.
 * CrudDialog will be removed in v2.0
 */
export function CrudDialog(props: BaseDialogProps) {
	if (process.env.NODE_ENV === 'development') {
		console.warn('CrudDialog is deprecated. Use BaseDialog, FormDialog, or TwoColumnDialog instead.');
	}
	return <BaseDialog {...props} />;
}

export type CrudDialogProps = BaseDialogProps;
```

**Objectif:** Compatibilité backward pendant la migration

---

## Phase 2: Storybook & Documentation (1-2h)

### 2.1 Stories pour chaque composant

**Fichiers à créer:**

- `BaseDialog.stories.tsx`
- `FormDialog.stories.tsx`
- `TwoColumnDialog.stories.tsx`
- `InfoDialog.stories.tsx`

**Stories à créer pour chaque:**

- Default
- With description
- Different maxWidth
- With custom header actions
- Loading states
- Error states
- Empty states

---

### 2.2 Documentation

**Fichier:** `packages/web-frontend/src/framework/components/overlays/README.md`

**Contenu:**

- Quand utiliser quel Dialog
- Exemples de code
- Migration guide depuis CrudDialog
- Best practices

---

## Phase 3: Migration proof-of-concept (1-2h)

### 3.1 Migrer ConfigureScriptsDialog

**Fichier:** `packages/web-frontend/src/app/pages/workspaces/scripts/ConfigureScriptsDialog.tsx`

**Avant:**

```tsx
<CrudDialog maxWidth="5xl">
	<div className="grid grid-cols-2 gap-6 p-6">{/* 100+ lignes de layout manuel */}</div>
</CrudDialog>
```

**Après:**

```tsx
<TwoColumnDialog
	maxWidth="5xl"
	leftColumn={{
		title: 'Configured Scripts',
		subtitle: `(${editingScripts.length}/${MAX_SCRIPTS})`,
		children: <ConfiguredScriptsList />,
		actions: <SaveCancelButtons />,
	}}
	rightColumn={{
		title: 'Available Scripts',
		searchable: true,
		children: <AvailableScriptsList />,
		actions: <DiscoverButton />,
	}}
/>
```

**Bénéfices:**

- Réduction de ~50 lignes de code
- Layout standardisé
- SearchBar intégré
- Type-safety améliorée

---

### 3.2 Migrer CreateTaskDialog

**Fichier:** `packages/web-frontend/src/app/pages/tasks/CreateTaskDialog.tsx`

**Avant:**

```tsx
<CrudDialog>
	<FormContainer onSubmit={handleSave}>
		{/* Form fields */}
		<Button onClick={handleSave}>Save</Button>
	</FormContainer>
</CrudDialog>
```

**Après:**

```tsx
<FormDialog mode="create" onSave={handleSave} isSaving={isSaving}>
	<FormContainer>{/* Form fields */}</FormContainer>
</FormDialog>
```

**Bénéfices:**

- Boutons automatiques
- Loading state géré
- Props explicites

---

### 3.3 Tests end-to-end

**Scénarios à tester:**

1. Ouvrir ConfigureScriptsDialog
2. Chercher un script
3. Ajouter/retirer des scripts
4. Sauvegarder
5. Vérifier que tout fonctionne

---

## Phase 4: Migration complète (4-6h)

### 4.1 Migrer tous les FormDialog (10-12 fichiers)

**Fichiers à migrer:**

- CreateTaskDialog
- CreateProjectDialog
- EditProjectDialog
- EditWorkspaceDialog
- BookDialog
- IngredientDialog
- etc.

**Script de migration automatique:**

```bash
# Remplacer les imports
find packages/web-frontend/src/app -name "*.tsx" -exec sed -i 's/CrudDialog/FormDialog/g' {} \;

# Ajouter les props requises manuellement (onSave, mode)
```

---

### 4.2 Migrer tous les TwoColumnDialog (3 fichiers)

**Fichiers à migrer:**

- ManagePinnedProjectsDialog
- ManageProjectWorkspacesDialog
- ConfigureScriptsDialog (déjà fait en POC)

---

### 4.3 Nettoyer CrudDialog

**Actions:**

1. Supprimer le deprecated warning
2. Supprimer le fichier CrudDialog.tsx
3. Mettre à jour tous les imports restants
4. Vérifier qu'aucun usage ne reste

**Commande:**

```bash
# Rechercher les usages restants
grep -r "CrudDialog" packages/web-frontend/src/app
```

---

## Phase 5: Tests & Validation (1h)

### 5.1 Tests automatisés

**Commandes:**

```bash
# Unit tests
npm run test -- Dialog

# Type checking
npm run check

# Build
npm run build

# Storybook
npm run storybook
```

---

### 5.2 Tests manuels

**Checklist:**

- [ ] Tous les dialogs s'ouvrent correctement
- [ ] FormDialog: Save/Cancel fonctionnent
- [ ] TwoColumnDialog: Search fonctionne
- [ ] TwoColumnDialog: Scroll indépendant par colonne
- [ ] InfoDialog: OK ferme le dialog
- [ ] AlertDialog: Non affecté par les changements
- [ ] Storybook: Toutes les stories fonctionnent
- [ ] Pas de régression visuelle

---

## Checklist de migration

### Nouveaux fichiers à créer

- [ ] `BaseDialog.tsx` (renommé depuis CrudDialog)
- [ ] `BaseDialog.stories.tsx`
- [ ] `FormDialog.tsx`
- [ ] `FormDialog.stories.tsx`
- [ ] `FormDialog.test.tsx`
- [ ] `TwoColumnDialog.tsx`
- [ ] `TwoColumnDialog.stories.tsx`
- [ ] `TwoColumnDialog.test.tsx`
- [ ] `InfoDialog.tsx`
- [ ] `InfoDialog.stories.tsx`
- [ ] `InfoDialog.test.tsx`
- [ ] `README.md` (documentation)

### Fichiers à migrer (29+ usages)

- [ ] ConfigureScriptsDialog (POC)
- [ ] CreateTaskDialog
- [ ] CreateProjectDialog
- [ ] EditProjectDialog
- [ ] EditWorkspaceDialog
- [ ] BookDialog
- [ ] IngredientDialog
- [ ] ManagePinnedProjectsDialog
- [ ] ManageProjectWorkspacesDialog
- [ ] - 20 autres fichiers à identifier

### Fichiers à supprimer

- [ ] `CrudDialog.tsx` (après migration complète)
- [ ] `CrudDialog.stories.tsx`

---

## Risques & Mitigation

### Risque 1: Breaking changes

**Impact:** Tous les dialogs cassent
**Mitigation:**

- Phase 2 garde CrudDialog comme alias deprecated
- Migration progressive par type
- Tests automatisés

### Risque 2: Perte de fonctionnalités

**Impact:** Certains cas d'usage non couverts
**Mitigation:**

- BaseDialog reste générique (fallback)
- Permet custom children pour cas spéciaux
- Review de tous les usages actuels

### Risque 3: Complexité accrue

**Impact:** Plus de composants à maintenir
**Mitigation:**

- Documentation claire
- Storybook avec exemples
- Guidelines de quand utiliser quoi

---

## Métriques de succès

### Quantitatives

- [ ] 0 usages de CrudDialog restants
- [ ] 100% des dialogs typés correctement
- [ ] Couverture de tests >80% pour nouveaux composants
- [ ] 0 régressions visuelles

### Qualitatives

- [ ] Code plus maintenable (-30% lignes pour dialogs 2 colonnes)
- [ ] Meilleure DX (auto-complétion, props typées)
- [ ] Clarté des intentions (nom = fonction)
- [ ] Feedback positif de l'équipe

---

## Références

- **Analyse complète:** `.claude/temp/dialog-hierarchy-proposal.md`
- **Pattern actuel:** `ManageProjectWorkspacesDialog.tsx` (bon exemple 2 colonnes)
- **Radix Dialog docs:** https://www.radix-ui.com/docs/primitives/components/dialog
- **Radix AlertDialog docs:** https://www.radix-ui.com/docs/primitives/components/alert-dialog

---

## Notes d'implémentation

### Ordre recommandé

1. **BaseDialog** (renommer) - 30min
2. **FormDialog** (le plus utilisé) - 1h
3. **TwoColumnDialog** (le plus complexe) - 2h
4. **InfoDialog** (le plus simple) - 30min
5. **Stories + Tests** - 2h
6. **POC Migration** (2 fichiers) - 1h
7. **Migration complète** - 4-6h
8. **Cleanup** - 1h

### Dépendances

- Aucune dépendance externe nécessaire
- Utilise déjà Radix UI Dialog
- Compatible avec framework actuel

### Backward compatibility

**Phase 2-3 (pendant migration):**

```tsx
// CrudDialog reste un alias
<CrudDialog> → <BaseDialog>
```

**Phase 4 (après migration):**

```tsx
// CrudDialog supprimé
<BaseDialog>       // Generic
<FormDialog>       // CRUD forms
<TwoColumnDialog>  // Selection
<InfoDialog>       // Read-only
```

---

## Prochaines étapes

Quand vous êtes prêt à implémenter :

```bash
# 1. Créer une branche
git checkout -b feat/dialog-hierarchy-refactor

# 2. Phase 1: Créer les composants
# Suivre les specs ci-dessus

# 3. Phase 2: POC
# Migrer ConfigureScriptsDialog + CreateTaskDialog

# 4. Review & Tests
# Vérifier que tout fonctionne

# 5. Phase 3: Migration complète
# Migrer tous les fichiers

# 6. Merge
git commit -m "refactor: implement dialog component hierarchy"
```

**Estimation totale:** 8-11 heures réparties sur 2-3 jours

---

**Status finale attendu:** ✅ Completed
