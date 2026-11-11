---
phase: 18-quest-heal-per-taglia
fixed_at: 2026-11-10T13:40:00Z
review_path: .planning/phases/18-quest-heal-per-taglia/18-REVIEW-A.md, .planning/phases/18-quest-heal-per-taglia/18-REVIEW-B.md
rulings_path: .planning/phases/18-quest-heal-per-taglia/18-REVIEW-RULINGS.md
iteration: 1
findings_in_scope: 14
fixed: 11
skipped: 3
status: partial
---

# Phase 18: report dei fix della code review

**Base:** `5333fd72` (review e ruling). **Branch:** `feat/18-quest-heal-per-taglia`, albero principale.
**In scope:** i 14 finding con ruling (12 `FIX` / `FIX in parte` / `VERIFY first` più 2 `NOT NEEDED`). **Fixed:** 11. **Skipped:** 3 (A-IN-03 chiuso dalla verifica, B-IN-05 e B-IN-06 `NOT NEEDED`). `status: partial` è solo il calcolo meccanico: ogni ruling `FIX` è stato applicato o chiuso come chiedeva il ruling stesso.

Ogni fix è TDD: commit RED `test(...)` e poi GREEN `fix(...)`; i finding di sola prova sono un solo commit `test(...)`, i commenti e la pulizia delle spec sono `refactor(...)`. L'ID del finding è nel corpo di ogni commit; nessun trailer.

## Esiti

| ID | Esito | Commit | Nota |
|----|-------|--------|------|
| A-WR-01 | fixed | `74fe25bc` (RED), `3c27c4b7` (GREEN) | Verificato prima: `quests`, `quest(id)` e `questUpdated` passano tutti da `QuestsService.findForViewer` / `findOne`, quindi da `dropOrphanCatalogRefs`. Lì `prizes.cure = cureOf(prizes.cure)`. Int-spec col driver nativo: quota mancante → 0, quota 7 → 0, refuso `brokenWing` scartato, cura valida invariata, nessun `errors` su `quests` e su `quest(id)`. RED: `Cannot return null for non-nullable field QuestCure.lifePointsShare` ed `Enum "InjuryType" cannot represent value`. |
| A-IN-01 | fixed | `53b42d17` | Solo prove, sul filo (stesso harness con accettazione e `QuestsModule`): tre legacy (senza vita, massimo e xp; idem con una ferita curabile; senza massimo con xp 20 000, che diventa rosso se una proiezione perde `status.xp`) e una tabella di sei fatti in cui il rifiuto `QUEST_NO_EFFECT` scatta esattamente quando `noEffect` è vero. Verdi al primo colpo, nessuna divergenza: codice non toccato. |
| A-IN-02 | fixed | `4d1e1fe4` | Solo prova: lo stesso subscriber vede `noEffect` cambiare 40 → 60 → 40 quando fra due eventi cambia solo `status.currentLifePoints` (tetto 50 su 100). Verde al primo colpo. |
| A-IN-03 | skipped | — | VERIFY first: `statusFactsOf` legge `status.title` (lo ripassa in `StatusFacts.title`, `src/quests/outcomes/progression/status-facts.ts`), quindi la proiezione resta. Lo scheletro della memo condiviso con `ViewerKnowledgeService` non si estrae ora (due occorrenze, regola del tre): da riprendere nella fase 19. |
| A-IN-04 | fixed | `b5db67ac` | Tolti lo spy e l'asserzione sul numero di `User.findById` (dipendeva dalle letture del tabellone); la prova resta la sola lettura dei vitali filtrata per proiezione; commento corretto, import `User` morto rimosso. |
| B-WR-01 | fixed | `580f6848` (RED), `98edd2f8` (GREEN) | Il filtro ripete ciò che il piano ha letto: `status.injuries` pinnate sul valore grezzo (assente = `null`), `status.potionRecoveryUntil` pinnata per uguaglianza se è una `Date` o assente. **Adattamento:** Mongoose fa il cast del filtro sul path `Date` (un testo dà `CastError`, un numero diventa un'altra data), quindi un valore presente che non è una data, che il piano legge come ricarica finita, si pinna per tipo (`{ $not: { $type: 'date' } }`, l'alternativa indicata dal reviewer): una ricarica scritta nel frattempo non combacia. Int-spec: testo, numero, legacy senza campo della ricarica, legacy senza `injuries` bevono; la corsa fra due bevute parallele resta verde (una passa, l'altra `POTION_RECOVERING`). |
| B-WR-02 | fixed | `4d22f6ba` (RED), `7c76b588` (GREEN) | `MAX_RECOVERY_VALUE = 2_147_483_647` in `src/models/loot-item.model.ts`: `max` a schema su `recovery.time` e `recovery.turns`, tetto su `time` in `recoveryTimeOf` (fuori scala = non bevibile, `ITEM_NOT_USABLE` sul filo con 9e15 scritto col driver). Con il tetto `recoveryDueAt` dà sempre una data valida (spec del piano al tetto). RED con `tsc` rosso solo per l'import della costante nella spec nuova. Parte skipped per ruling: nessuna sanificazione di `LootItem.recovery` sul filo; limiti scritti nel runbook di `BACKEND-NOTES.md` §3 c. Il lettore applica il tetto a `time`, l'unico campo che legge (`turns` è solo dato, D-16). |
| B-IN-01 | fixed | `24863a4c` (RED), `bde149db` (GREEN) | `hpAfter = max(vita letta, cura col tetto)`: oltre il massimo la vita resta, la ferita si cura; senza ferita curabile `ITEM_NO_EFFECT`. Una vita non finita ricade sulla cura col tetto, come prima. |
| B-IN-02 | fixed | `03d7990b` | VERIFY first riuscito: spy una tantum su `characters.updateOne` che esegue la `$push` rivale col driver nativo dopo lo snapshot in sessione; `updateOne` chiamata due volte (ritentativo del driver), nuova pila e pozione bevuta entrambe presenti. Stabile su tre esecuzioni. |
| B-IN-03 | fixed | `591068b0` | VERIFY first: la spec di superficie aveva già l'helper graphql-ws (`overGraphqlWs`). Casi ws per `probePotionRecovering` in produzione (`extensions` esattamente `{ code, recoveryUntil }`, nessun `requestId`) e fuori. Verdi al primo colpo. |
| B-IN-04 | fixed | `69543e43` | Un solo commento su `canHeal` che dice il perché (D-13, campo riusato). |
| B-IN-05 | skipped | — | `NOT NEEDED` per ruling (id orfani innocui, lettura dopo il commit idempotente); annotato nel §2 di `BACKEND-NOTES.md`. |
| B-IN-06 | skipped | — | `NOT NEEDED` per ruling (D-24: input tenuti senza superficie SDL). |
| B-IN-07 | fixed | `443b4807` | `RECOVERY_UNTIL_ISO = PROBE_RECOVERY_UNTIL.toISOString()`. |

Handoff: `63bbe39a` aggiorna `BACKEND-NOTES.md` (codici §1.3, semantica §1.5 per A-WR-01, B-WR-01 e B-IN-01, prove nuove e nota B-IN-05 al §2, limiti di `recovery` nel runbook §3 c).

## Gate finali (in foreground, dopo l'ultimo fix)

- `npx tsc --noEmit -p tsconfig.json`: esce 0.
- Unit completo (`npx jest --selectProjects unit`): **254 suite / 3239 test** verdi (prima dei fix 254 / 3225; +14).
- Integration completa, quattro blocchi come nel piano 18-11 (`--listTests`: 136 int-spec, tutte coperte dai blocchi, nessuna fuori):

| Blocco | Percorsi | Suite | Test | Tempo |
|--------|----------|-------|------|-------|
| A | `src/quests` | 34 | 481 (prima 469) | 160 s |
| B | `src/characters src/shops src/lore src/economy src/models src/lootItems src/graphql test/shops test/quests test/authz test/fixtures test/harness` | 47 | 683 (prima 676) | 157 s |
| C | `src/travel` | 11 | 200 | 68 s |
| D | `src/auth src/authz src/cities src/eventsub src/http src/migrations src/mongo src/pendingQuests src/pointsOfInterest src/push src/rest src/roads src/throttling src/time src/users src/validation test/app.int-spec.ts test/auth` | 45 | 617 | 92 s |

- Boot reale `test/app.int-spec.ts`: **84/84**.
- `git diff --exit-code src/schema.gql`: esce 0 (anche dopo ogni commit): SDL invariato.
- `pgrep -fl 'bin/jest'` vuoto; `git status --short` pulito prima di questo report. `npm run test:cov` resta all'orchestratore.

---

_Fixed: 2026-11-10_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
