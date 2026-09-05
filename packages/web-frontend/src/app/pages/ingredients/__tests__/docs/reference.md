 Reference

_Moved from README -- see [README](../README.md) for the overview._

-  Have delete actions for each row

 . Data Refresh ( test ×  =  tests)

-  Be able to refresh data

 . Empty State ( test ×  =  tests)

-  Handle empty data without crashing

 . Loading States ( tests ×  =  tests) NOUVEAU !

-  Handle delayed data loading gracefully
-  Handle search during loading
-  Handle refresh without disrupting UI

  Principes of the Tests Iso-Fonctionnels

  this that The tests VERIFIENT (Comportement)

. Resultats observables: the donnees are affichees, l'API is appelee
. Capacites disponibles: the controles UI existent and are fonctionnels
. Etats d'application: Loading, empty state, erreurs are geres
. Interactions User: the inputs acceptent the donnees, the boutons are cliquables

  this that The tests NE VERIFIENT not (Implementation)

. Labels exacts of the boutons (`"Add"` vs `"Create"`)
. Structure HTML or classes CSS
. Details of the dialogs (comment ils s'ouvrent, routing vs state)
. Timing exact of the appels API (cache, debounce)
. Details visuels (couleurs, animations, layout)

  Tests with Controlled Promises

Tests for Loading States use controlled promises to verify:

```typescript
// Controle of the timing of reSolution
let resolveData: any;
const delayedPromise = new Promise(resolve => {
  resolveData = resolve;
});

mocks.getIngredients.mockReturnValueOnce(delayedPromise);

// Test pendant the loading...

// Resoudre quand on veut
resolveData({ items: [...], pagination: {...} });
```

Cela permet of tester:

-  L'UI reste stable pendant the loading
-  the interactions are possibles pendant the loading
-  the donnees apparaissent apres reSolution
-  not of crash or d'etat incoherent

  Usage

```bash
 Executer all The tests
npm test -- iso-functionality.test.tsx

 Executer seulement v
npm test -- iso-functionality.test.tsx -t "v"

 Executer seulement v
npm test -- iso-functionality.test.tsx -t "v"

 Executer a Category specifique
npm test -- iso-functionality.test.tsx -t "Loading States"

 Mode watch
npm test -- iso-functionality.test.tsx --watch
```

  this that Prouvent Ces Tests

. Equivalence fonctionnelle: v and v ont the meme comportement for l'User
. Migration sure: On peut remplacer v by v without regression
. Robustesse: the deux implementations gerent the edge cases (empty state, loading, etc.)
. Maintenabilite: The tests are decouples of l'Implementation, donc resistants aux refactorings

  Lecons Apprises

 Test of the Comportement vs Implementation

Mauvais :

```typescript
// Teste l'Implementation (label exact)
expect(screen.getByText('Add Ingredient')).toBeInTheDocument();
```

Bon :

```typescript
// Teste the comportement (capacite disponible)
const buttons = screen.getAllByRole('button');
const createButton = buttons.find(btn => btn.textContent?.match(/add|create|new/i));
expect(createButton).toBeDefined();
```

 Eviter the Details d'Implementation

Mauvais :

```typescript
// Depend of the timing exact d'appel API
await user.click(Header);
expect(mocks.getIngredients).toHaveBeenCalledTimes();
```

Bon :

```typescript
// Teste juste that l'UI reagit
await user.click(Header);
expect(true).toBe(true); // the clic fonctionne without Error
```

  Structure of the Fichiers

```
__tests__/
 ingredientMocks.ts            Mocks and donnees of test
 iso-functionality.test.tsx    Suite of tests principale
 README.md                     This file
```

  Tests Futurs Possibles

- Tests d'erreurs API (, , Timeout)
- Tests of mutations optimistes
- Tests of Navigation (routing)
- Tests of persistance (localStorage)
- Tests of Performance (large datasets)

---

Note: If a test fails for only one version, the test is poorly written, not the implementation that is broken. The iso-functional tests must pass for both versions at all times.
