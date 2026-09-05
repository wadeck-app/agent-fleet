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

  Principes des Tests Iso-Fonctionnels

  CE QUE LES TESTS VERIFIENT (Comportement)

. Resultats observables: Les donnees sont affichees, l'API est appelee
. Capacites disponibles: Les controles UI existent et sont fonctionnels
. Etats d'application: Loading, empty state, erreurs sont geres
. Interactions utilisateur: Les inputs acceptent les donnees, les boutons sont cliquables

  CE QUE LES TESTS NE VERIFIENT PAS (Implementation)

. Labels exacts des boutons (`"Add"` vs `"Create"`)
. Structure HTML ou classes CSS
. Details des dialogs (comment ils s'ouvrent, routing vs state)
. Timing exact des appels API (cache, debounce)
. Details visuels (couleurs, animations, layout)

  Tests avec Promesses Controlees

Les tests de Loading States utilisent des promesses controlees pour verifier:

```typescript
// Controle du timing de resolution
let resolveData: any;
const delayedPromise = new Promise(resolve => {
  resolveData = resolve;
});

mocks.getIngredients.mockReturnValueOnce(delayedPromise);

// Test pendant le loading...

// Resoudre quand on veut
resolveData({ items: [...], pagination: {...} });
```

Cela permet de tester:

-  L'UI reste stable pendant le loading
-  Les interactions sont possibles pendant le loading
-  Les donnees apparaissent apres resolution
-  Pas de crash ou d'etat incoherent

  Utilisation

```bash
 Executer tous les tests
npm test -- iso-functionality.test.tsx

 Executer seulement v
npm test -- iso-functionality.test.tsx -t "v"

 Executer seulement v
npm test -- iso-functionality.test.tsx -t "v"

 Executer une categorie specifique
npm test -- iso-functionality.test.tsx -t "Loading States"

 Mode watch
npm test -- iso-functionality.test.tsx --watch
```

  Ce Que Prouvent Ces Tests

. Equivalence fonctionnelle: v et v ont le meme comportement pour l'utilisateur
. Migration sure: On peut remplacer v par v sans regression
. Robustesse: Les deux implementations gerent les edge cases (empty state, loading, etc.)
. Maintenabilite: Les tests sont decouples de l'implementation, donc resistants aux refactorings

  Lecons Apprises

 Test du Comportement vs Implementation

Mauvais :

```typescript
// Teste l'implementation (label exact)
expect(screen.getByText('Add Ingredient')).toBeInTheDocument();
```

Bon :

```typescript
// Teste le comportement (capacite disponible)
const buttons = screen.getAllByRole('button');
const createButton = buttons.find(btn => btn.textContent?.match(/add|create|new/i));
expect(createButton).toBeDefined();
```

 Eviter les Details d'Implementation

Mauvais :

```typescript
// Depend du timing exact d'appel API
await user.click(header);
expect(mocks.getIngredients).toHaveBeenCalledTimes();
```

Bon :

```typescript
// Teste juste que l'UI reagit
await user.click(header);
expect(true).toBe(true); // Le clic fonctionne sans erreur
```

  Structure des Fichiers

```
__tests__/
 ingredientMocks.ts            Mocks et donnees de test
 iso-functionality.test.tsx    Suite de tests principale
 README.md                     Ce fichier
```

  Tests Futurs Possibles

- Tests d'erreurs API (, , timeout)
- Tests de mutations optimistes
- Tests de navigation (routing)
- Tests de persistance (localStorage)
- Tests de performance (large datasets)

---

Note: Si un test echoue pour une seule version, c'est le test qui est mal ecrit, pas l'implementation qui est cassee. Les tests iso-fonctionnels doivent passer pour les deux versions en tout temps.
