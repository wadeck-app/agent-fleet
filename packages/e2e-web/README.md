# Tests E2E avec Playwright

Suite complète de tests End-to-End pour l'application Assistant Diététique.

## Démarrage Rapide

```bash
# Exécuter TOUS les tests (app + composants)
npm run test:e2e

# Tests application uniquement (backend + frontend)
npm run test:e2e:app

# Tests composants uniquement (Storybook, sans backend)
npm run test:e2e:components

# Développement avec Storybook + tests auto
npm run dev:storybook
```

## Types de Tests

### 1. Tests Application (`test:e2e:app`)

Tests de l'application complète avec backend + frontend

```bash
npm run test:e2e:app           # Headless
npm run test:e2e:app:ui        # Interface UI
npm run test:e2e:app:headed    # Navigateur visible
npm run test:e2e:app:debug     # Mode debug
npm run test:e2e:report        # Voir le rapport
```

### 2. Tests Composants (`test:e2e:components`)

Tests des composants React isolés via Storybook (sans backend)

```bash
npm run test:e2e:components           # Headless
npm run test:e2e:components:ui        # Interface UI
npm run test:e2e:components:headed    # Navigateur visible
npm run test:e2e:components:debug     # Mode debug
npm run test:e2e:report:components    # Voir le rapport
```

## Structure

```
e2e/
├── pages/              # Page Object Model
│   ├── BasePage.ts
│   ├── IngredientsPage.ts
│   └── RecipesPage.ts
├── fixtures/           # Données de test
│   ├── ingredientFixtures.ts
│   └── recipeFixtures.ts
├── utils/              # Utilitaires
│   └── testHelpers.ts
└── tests/              # Suites de tests
    ├── *.spec.ts                        # Tests app (backend + frontend)
    │   ├── ingredientsPage.spec.ts          # Tests CRUD ingrédients
    │   ├── recipesPage.spec.ts              # Tests CRUD recettes
    │   └── ...
    └── storybook/                       # Tests composants (Storybook uniquement)
        └── table.shift-click.storybook.spec.ts

playwright.config.integration.ts                 # Config pour tests app
playwright.config.storybook.ts       # Config pour tests Storybook
```

## Couverture des Tests

### 🥗 Ingrédients (50+ tests)

- ✅ CRUD complet
- ✅ Recherche et filtrage
- ✅ Validation des formulaires
- ✅ Gestion des doublons

### 🍽️ Recettes (45+ tests)

- ✅ CRUD complet
- ✅ Calcul automatique des macros
- ✅ Gestion des ingrédients
- ✅ Validation des recettes

### ✔️ Validation (30+ tests)

- ✅ Champs obligatoires
- ✅ Types de données
- ✅ Valeurs min/max
- ✅ Messages d'erreur

### 🔄 Intégration (20+ tests)

- ✅ Scénarios bout en bout
- ✅ Navigation entre pages
- ✅ Modification en cascade
- ✅ Gestion d'erreurs

### 📱 Responsive (30+ tests)

- ✅ Desktop / Tablet / Mobile
- ✅ 7 breakpoints testés
- ✅ Interactions tactiles
- ✅ Adaptation de l'UI

### 🧩 Composants (Tests Storybook)

- ✅ Table avec sélection multiple
- ✅ Shift+Click pour sélection de plage
- ✅ États visuels (selected, editing, deleting)
- ✅ Interactions clavier

## Commandes Utiles

```bash
# Tests spécifiques
npx playwright test ingredientsPage.spec.ts
npx playwright test --grep "devrait créer"

# Desktop uniquement
npm run test:e2e:chromium

# Mobile uniquement
npm run test:e2e:mobile

# Avec navigateur visible
npm run test:e2e:headed

# Génération de traces
npx playwright test --trace on
```

## Page Objects

### IngredientsPage

```typescript
// Créer un ingrédient
await ingredientsPage.createIngredient({
	name: 'Poulet',
	calories: 165,
	protein: 31.0,
	carbs: 0.0,
	fat: 3.6,
	servingSize: 100,
});

// Modifier
await ingredientsPage.editIngredient('Poulet', { calories: 170 });

// Supprimer
await ingredientsPage.deleteIngredient('Poulet');

// Rechercher
await ingredientsPage.searchIngredient('Poulet');
```

### RecipesPage

```typescript
// Créer une recette
await recipesPage.createRecipe({
	name: 'Poulet avec Riz',
	servings: 2,
	ingredients: [
		{ name: 'Poulet', quantity: 200 },
		{ name: 'Riz', quantity: 150 },
	],
	instructions: 'Faire cuire...',
});

// Récupérer les macros
const macros = await recipesPage.getRecipeMacros('Poulet avec Riz');
console.log(macros); // { calories: 525, protein: 66.1, carbs: 42.3, fat: 7.7 }

// Modifier
await recipesPage.editRecipe('Poulet avec Riz', {
	addIngredients: [{ name: 'Brocoli', quantity: 100 }],
});

// Supprimer
await recipesPage.deleteRecipe('Poulet avec Rix');
```

## Fixtures

```typescript
import { validIngredients } from '../fixtures/ingredientFixtures';

// Utiliser une fixture
await ingredientsPage.createIngredient(validIngredients.chicken);
```

## Helpers

```typescript
import { approximatelyEqual, generateUniqueName } from '../utils/testHelpers';

// Générer un nom unique
const name = generateUniqueName('Poulet'); // "Poulet_1638362400000_123"

// Comparer avec tolérance
expect(approximatelyEqual(525, 520, 5)).toBe(true);
```

## Configuration

Voir `playwright.config.integration.ts` à la racine :

- **2 projets** : `chromium-desktop` et `chromium-mobile`
- **Workers** : 1 (séquentiel, pour éviter les conflits de données)
- **Retries** : 2 tentatives en cas d'échec
- **Timeouts** : 30s par test, 10s par action
- **Screenshots** : Automatiques en cas d'échec
- **Vidéos** : Conservées en cas d'échec

## Bonnes Pratiques

1. **Noms uniques** : Toujours utiliser `generateUniqueName()`
2. **Isolation** : Chaque test doit être indépendant
3. **Attentes explicites** : Utiliser `waitFor()` plutôt que `waitForTimeout()`
4. **Assertions claires** : Utiliser les méthodes du Page Object
5. **Tolérance** : Pour les calculs, utiliser `approximatelyEqual()`

## Documentation Complète

Voir [docs/E2E_TESTING.md](../docs/E2E_TESTING.md) pour :

- Architecture détaillée
- Tous les scénarios de tests
- Guide de dépannage
- Maintenance et évolution

## Statistiques

- **157+ tests** au total
- **~10 minutes** d'exécution (mode headless)
- **Taux de succès** : >95%
- **Couverture** : Tous les flux utilisateurs critiques

## Support

Pour toute question, consulter la [documentation complète](../docs/E2E_TESTING.md) ou contacter l'équipe.
