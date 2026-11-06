---
phase: 15-imboscate-in-viaggio
group: C
reviewed: 2026-11-06T20:58:30Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - src/app.module.ts
  - src/config/ambush-config.ts
  - src/config/env.validation.ts
  - src/models/character/active-travel.model.ts
  - src/models/character/ambush-snapshot.model.ts
  - src/models/character/character.model.ts
  - src/models/enums/quest-result-kind.enum.ts
  - src/models/quest-result/quest-result.model.ts
  - src/push/push-event-type.enum.ts
  - src/push/push-events.ts
  - src/quests/acceptance/quest-acceptance.service.ts
  - src/quests/generation/enemy-pool.ts
  - src/quests/generation/quest-composition.ts
  - src/quests/outcomes/combatant-plan.ts
  - src/quests/outcomes/outcome-plan.ts
  - src/quests/outcomes/quest-outcomes.module.ts
  - src/quests/outcomes/resolution-loader.service.ts
  - src/quests/results/quest-result.populate.ts
  - src/schema.gql
  - test/quests/outcome-world.ts
  - test/quests/quest-result.fixture.ts
  - test/travel/ambush-report.fixture.ts
  - test/travel/ambush-world.ts
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: issues_found
---

## Summary

Gruppo C riletto per intero contro il diff `b492a46..d9e0f5f`. Nessun finding critico né warning. Verificato punto per punto:

- **Composizione e pool (D-06..D-08, D-22):** `composeEnemies` estratta senza cambiare l'ordine dei tiri (il tiro della forma resta il primo, `budgetOf` non tira); `composeEnemyQuest` è un wrapper. `PoolOptions` ha default `GENERATED_POOL_OPTIONS` (animali esclusi) quindi le quest generate non cambiano; i leggendari restano esclusi in `isPoolable` anche con `animals: 'included'`.
- **Catalogo (D-09):** `readCombatCatalog` è il cuore di `readCatalog`; l'unica differenza è l'ordine delle letture (catalogo premi dopo `readSpellMaxUsages`), innocua perché sono letture. `woundsAfter`, `consumablesSpent`, `sellLine`, `spellsSpent` sono solo esportate, nessuna duplicazione. `QuestOutcomesModule` esporta `CombatResolver`, `ChanceSource`, `ResolutionLoader`.
- **Modello e SDL (D-14, D-23):** `kind` con default `quest`, `quest` required se `kind !== 'ambush'`, `ambush` required se `kind === 'ambush'`; i risultati sono letti idratati (mai `lean`, tranne l'acknowledgement che non legge `kind`), quindi un documento legacy senza `kind` si legge `quest`. `src/schema.gql` differisce da `develop` per la sola riga tolta `quest: QuestResultQuest!` e per le righe attese; `test/app.int-spec.ts` ha la stringa esatta aggiornata. Nessun consumatore in `src/` assume `quest` non nullo sui risultati.
- **Push (D-12):** voce di catalogo con corpo generico per `testPushMessage`, builder che sovrascrive `body`, `IDENTIFIED_TYPES` aggiornato, `ttlSeconds` uguale a `travelEnd`; payload con solo id del personaggio e nome della città; `PushService.sendToUser` non lancia mai, quindi `scheduler.cancel/schedule` dopo il push non sono a rischio.
- **Config (D-04):** valore non valido rifiuta il boot con messaggio che non ripete il valore; canonica via `resolvedOptions`; `ambushConfigProvider` registrato una sola volta (`TravelPlanningModule`); `.env.example` ha solo il blocco nuovo; nessun `process.env` nuovo sotto `src/` (l'unico residuo, `src/migrations/run-mixed-refs.ts`, non è nel diff).
- **Indici (D-19):** `character_active_travel_ambush` nel modello, nello spec degli sweep a stringa esatta e in `EXPECTED_INDEXES` del verifier; nessun duplicato.
- **Accettazione:** il sorteggio avviene solo sul viaggio reale (`movementTo`), dopo `classifyEligibility`/città e prima della transazione; un rifiuto non scrive nulla (il caso mangia-niente su rifiuto resta come in Phase 14: `fedOrReject` prima dei punti, pasto in sessione dentro la transazione). Il job dell'imboscata è accodato dopo il commit, best effort, come il job di fine viaggio.
- **`app.module.ts`:** `AmbushModule` in `AppModule`, non in `TravelModule`; nessun import circolare nuovo a livello di file (`ambush-snapshot.model` importa da `quest-result.model`, che non importa il modello del personaggio).
- **Fixture:** nessun `jest.mock(`, nessuna rete, nessun `Math.random`/`Date.now`/URI; builder deterministici; `buildQuestResult` ha `kind: 'quest'`. Le strade R2 (4,4 km) e R3 (8,9 km) sono sotto i 10 km per scelta dichiarata (D-03), R1 è 20 km.

Restano due note di qualità, nessuna raggiungibile come bug.

## Critical

Nessuno.

## Warning

Nessuno.

## Info

### C-IN-01: `ChanceSource` legato due volte con istanze diverse in produzione

**File:** `src/travel/travel-planning.module.ts:57` (provider) e `src/quests/outcomes/quest-outcomes.module.ts:98` (commento + export)
**Issue:** il commento aggiunto in `QuestOutcomesModule` dice «la stessa porta del motore per quest e imboscate: il binding cambia in un solo posto», ma `AmbushPlanner` (sorteggio alla partenza, iniettato in `QuestAcceptanceService` e nel viaggio libero) riceve il `ChanceSource` di `TravelPlanningModule`, cioè un secondo `{ provide: ChanceSource, useClass: MathChanceSource }`, mentre risoluzione e composizione dei nemici usano quello di `QuestOutcomesModule`. In produzione sono due istanze di `MathChanceSource` senza stato, quindi nessun effetto; il binding però vive in due posti e il commento è inesatto. Nei test l'override per token li copre entrambi, per questo non emerge.
**Why it matters:** chi un giorno sostituisse il binding in `QuestOutcomesModule` (per esempio una sorgente seedabile) lascerebbe il sorteggio della partenza sul vecchio, e le spec a seme fisso dell'imboscata sarebbero parziali senza accorgersene.
**Suggested fix:** o correggere il commento («il motore di combattimento e la composizione; il sorteggio della partenza ha il suo binding in `TravelPlanningModule`»), o far importare a `TravelPlanningModule` un modulo piccolo che possieda `ChanceSource` e lo esporti. Nessuna spec RED necessaria per la correzione del commento; per il refactor basta lo spec esistente sull'override.

### C-IN-02: `AMBUSH_TIMEZONE` accetta anche un offset fisso, non solo un nome IANA

**File:** `src/config/ambush-config.ts:25-33`
**Issue:** `new Intl.DateTimeFormat('en-US', { timeZone: raw })` su Node recenti accetta anche offset come `+02:00`; `resolvedOptions().timeZone` restituisce l'offset così com'è. Il messaggio d'errore e il commento parlano di «IANA time zone», ma un offset passa la validazione e produrrebbe una notte (22–06) senza ora legale.
**Why it matters:** configurazione sbagliata che sposta silenziosamente la fascia notturna di un'ora per metà anno; non è un bug raggiungibile con il default.
**Suggested fix:** rifiutare i valori che non sono nomi di regione, per esempio con `if (/^[+-]\d/.test(timeZone)) throw`, scrivendo prima la spec RED in `src/config/ambush-config.spec.ts` (`AMBUSH_TIMEZONE='+02:00'` deve lanciare con il messaggio senza il valore); oppure documentare in `.env.example` che gli offset sono ammessi.

---

_Reviewed: 2026-11-06T20:58:30Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
