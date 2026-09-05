# Tests Iso-Fonctionnels Ingredients v2/v5

##  Objectif

Valider que **Ingredients v2** (Data2-based) et **Ingredients v5** (useCrudPage-based) ont le **meme comportement fonctionnel** malgre des implementations differentes.

##  Resultats

```
 36 tests PASSING (100%)
⏱  ~12 secondes d'execution
  18 scenarios × 2 versions = 36 tests
```

##  Categories de Tests

### 1. Initial Data Load (3 tests × 2 = 6 tests)

-  Fetch data from API on mount
-  Display fetched ingredient data
-  Pass pagination parameters to API

### 2. Search (2 tests × 2 = 4 tests)

-  Have search capability
-  Accept search input

### 3. Sorting (2 tests × 2 = 4 tests)

-  Have sortable columns
-  Have clickable column headers

### 4. Row Selection (2 tests × 2 = 4 tests)

-  Have selectable rows
-  Enable selection of multiple rows

### 5. Pagination (1 test × 2 = 2 tests)

-  Have page size controls

### 6. CRUD Actions (3 tests × 2 = 6 tests)

-  Have create action available
-  Have edit actions for each row

---

_Reference content moved to [docs/reference.md](docs/reference.md)._
