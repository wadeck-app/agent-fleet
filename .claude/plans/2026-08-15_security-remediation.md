# Security Remediation Plan — flow-cli

Date: 2026-08-15
Context: 8 security findings identified across audit cycles V1-V4. Each point requires full analysis (risk, cost, proposals) before implementation.

---

## Finding #1 — WebSocket daemon: no authentication

**Status:** `v` CLOSED — No action — threat model shows no auth can protect same-user actor. See threat-model-ws-auth.md. Threat model written: threat-model-ws-auth.md

### Todos

- [ ] Analyse les mécanismes d'auth possibles (token, HMAC, mutual TLS, Unix socket)
- [ ] Évaluer le coût UX de chaque option (impact sur `flow run`, transparence)
- [ ] Définir le flag `--no-auth` / config pour désactiver
- [ ] Proposer avec pros/cons + recommandation
- [ ] Implémenter l'option retenue
- [ ] Tests unitaires + intégration

---

## Finding #2 — PID auto-déclaré par les workers

**Status:** `v` CLOSED — Covered by #1 analysis. spawnedPids guard retained as defense-in-depth.

### Todos

- [ ] Vérifier si le token WS (finding #1) résout aussi #2 (il devrait)
- [ ] Analyser le scénario de race condition (10s window) en détail
- [ ] Proposer nonce per-spawn via env var
- [ ] Évaluer impact sur TestHelpers et tests existants

---

## Finding #3 — Lecture fichier sans restriction de chemin + info leakage dans les erreurs

**Status:** `v` DONE — Path guard + error sanitization implemented. path guard (allowAbsolutePaths config), error messages sanitized, 122→124 tests.

### Todos

- [ ] Analyser TOUS les chemins où des erreurs sont retournées à l'utilisateur
- [ ] Séparer logs user-facing (stderr human-friendly) vs logs fichier (détails techniques)
- [ ] Définir interface LogSink avec deux canaux: `user(message)` et `detail(message, err?)`
- [ ] Appliquer path.relative guard sur flowFile (comme SecretProvider.ts:47-70)
- [ ] Vérifier que PARSE_ERROR / FLOW_NOT_FOUND ne leakent plus de chemins
- [ ] Review complète de tous les String(err) visibles utilisateur

---

## Finding #4 — process.env passé entièrement aux workers

**Status:** `v` DONE — isolateEnv opt-out in ScriptExecutor + ClaudeLauncher + WorkerPool allowlist. StepRunner preserved with isolateEnv:false. 124 tests.

### Todos

- [ ] Vérifier la décision originale (était-ce explicitement demandé de ne PAS passer env?)
- [ ] Analyser ce dont les workers ont besoin (PATH, HOME, TMPDIR, NODE_PATH minimum)
- [ ] Définir un PATH minimal dans le worker plutôt qu'hérité
- [ ] Implémenter: seul l'env déclaré dans le flow YAML est passé + un PATH minimal fixe
- [ ] Mettre à jour WorkerPool.ts avec env allowlist
- [ ] Vérifier que claude CLI reste trouvable sans hériter le PATH daemon

---

## Finding #5 — Logs: informations sensibles/techniques visibles utilisateur

**Status:** `v` DONE — violations rule security/no-raw-err-in-cli created. 6 call sites fixed. 0 violations.

### Todos

- [ ] Inventaire complet de tous les points de log dans le codebase
- [ ] Classifier: user-facing stderr | daemon file log | worker stderr
- [ ] Concevoir la notion de "log sensitivity" (USER / INTERNAL / DEBUG)
- [ ] Implémenter un LogRouter qui route selon le canal et la sensitivité
- [ ] Appliquer: aucune stack trace, chemin, variable d'env, ou valeur interne vers stderr user
- [ ] Review finale: grep sur `console.error`, `process.stderr.write`, `console.log`

---

## Finding #6 — mode 0o600 ineffectif sur Windows pour le fichier MCP config

**Status:** `v` CLOSED — TM-03 documented: %TEMP% per-user on Windows provides equivalent protection. Not a real risk in scope.

### Todos

- [ ] Vérifier si c'est un vrai risque dans le contexte de déploiement réel
- [ ] Analyser: lifetime du fichier, qui peut le lire, quel est le worst case
- [ ] Si risque réel: proposer alternatives (named pipe, env var, icacls)
- [ ] Documenter la décision dans le threat model

---

## Finding #7 — LogMasker: seuil < 4 chars intentionnel

**Status:** `v` DONE — LogMasker minVariantLength configurable (default 4). TM-02 documented.

### Todos

- [ ] Vérifier que le seuil est bien configurable dans le code actuel
- [ ] Confirmer que c'est une décision de design documentée
- [ ] Ajouter au threat model comme décision explicite avec justification
- [ ] Si non configurable: rendre configurable avec valeur par défaut 4

---

## Finding #8 — Hex masking case-sensitive

**Status:** `v` DONE — Hex regex flag 'gi' — case-insensitive. No regression risk. Test added.

### Todos

- [ ] Évaluer si le risque est réel dans le contexte actuel
- [ ] Proposer: flag `i` sur le regex hex vs double registration
- [ ] Implémenter si le fix est trivial (il l'est)
- [ ] Mettre à jour les tests LogMasker

---

## Meta

### Lessons learned à appliquer

- Chaque finding = risk analysis + cost analysis + proposals avec pros/cons
- "v1 decision" n'est pas une réponse, c'est un report avec justification
- Les findings de type log/env/auth = HIGH priority par défaut

---

## Final Status

All 8 findings resolved as of 2026-08-15.

| #   | Finding                          | Disposition                                        | Tests        |
| --- | -------------------------------- | -------------------------------------------------- | ------------ |
| 1   | WebSocket no auth                | CLOSED — threat model shows no fix needed in scope | —            |
| 2   | PID spoofable                    | CLOSED — resolved by #1 analysis                   | —            |
| 3   | Path restriction + error leakage | FIXED                                              | 124 pass     |
| 4   | process.env to workers           | FIXED                                              | 124 pass     |
| 5   | Log sensitivity                  | FIXED + violations rule                            | 0 violations |
| 6   | 0o600 Windows                    | CLOSED — not a real risk (%TEMP% per-user)         | —            |
| 7   | LogMasker threshold              | FIXED                                              | 124 pass     |
| 8   | Hex case-sensitivity             | FIXED                                              | 124 pass     |

Artifacts produced:

- `.claude/audits/threat-model-ws-auth.md` — threat model for #1/#2/#6
- `.claude/audits/security-analysis-2026-08-15.md` — full analysis
- `.violations/rules/no-raw-err-in-cli.ts` — violation rule for #5
- `.violations/config.ts` — violations framework setup
