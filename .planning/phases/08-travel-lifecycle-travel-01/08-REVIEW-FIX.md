---
phase: 08-travel-lifecycle-travel-01
fixed_at: 2026-10-21T21:58:02Z
review_path: .planning/phases/08-travel-lifecycle-travel-01/08-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-10-21T21:58:02Z
**Source review:** `.planning/phases/08-travel-lifecycle-travel-01/08-REVIEW.md`
**Iteration:** 1
**Fix scope:** `critical_warning` (CR-* e WR-*), più due INFO presi su ruling dell'orchestratore (IN-01, IN-07).

**Summary:**
- Findings in scope: 2 (WR-01, WR-02)
- Fixed: 2
- Skipped: 0
- Fuori scope, presi su ruling: 2 (IN-01, IN-07) — fatti
- Fuori scope, lasciati: 6 (IN-02..IN-06, IN-08) — motivazione in una riga ciascuno

Ogni warning è stato affrontato in TDD: commit `test(08)` con lo spec rosso, poi commit `fix(08)` che lo porta a verde. Conventional Commits, nessun trailer. `src/schema.gql` invariato (`git diff --exit-code` esce 0): nessuna modifica di contratto.

## Tabella dei rilievi

| ID | Esito | Commit | Nota |
|----|-------|--------|------|
| WR-01 | fixed | `58a08d4` (test) → `06ce95b` (fix) | `isResolved` accetta solo un documento popolato: un `Types.ObjectId` grezzo (refPath irrisolto per `itemType` assente) è un orfano. Caso aggiunto allo spec unit e al wire int-spec |
| WR-02 | fixed | `a7544ca` (test) → `a19abb0` (fix) | `planAuto` rifiuta `QUEST_NOT_ACCEPTABLE` con WARN (id quest + POI) quando il marker non ha documento POI, prima della transazione; il salto di D-03 resta solo per "POI esistente ma senza strada" |
| IN-01 | fixed (docs) | `62599f4` | Handoff: semantica "stesso nodo = nessun percorso" in §2, §3, §8, §11(c); conteggi del gate aggiornati nel "Stato" |
| IN-07 | fixed | `33c5b6e` | Rimossi i due commenti legacy sugli import di `roads.service.ts` (Boy Scout) |
| IN-02 | skipped | — | Già documentato in §13 del handoff ("con `TRAVEL_SWEEP_INTERVAL_MS=0` un job anticipato resta incompleto fino al prossimo boot: in produzione tenere lo sweep attivo") |
| IN-03 | skipped | — | Hardening della coda (`removeOnFail` con TTL / `attempts`): Phase 10, nessun impatto sul contratto |
| IN-04 | skipped | — | Estrazione di `codeOf` in un modulo comune e log del codice d'errore nello scheduler: refactor di diagnostica, Phase 10 |
| IN-05 | skipped | — | `ClockModule` condiviso: scelta di design (provider ripetuto, override unico nei test), nessun difetto funzionale |
| IN-06 | skipped | — | `isFullForEveryone` è il riferimento condiviso con il FE per D-29/D-32 (§9 del handoff): scelta di design, resta esportata e testata |
| IN-08 | skipped | — | Codice `TRAVEL_IN_PROGRESS` dopo un teleport concorrente: scelta documentata nel commento, il retry riesce; eventuale `travelSameLocation()` in Phase 10 |

## Fixed Issues

### WR-01: `isResolved` accetta un `item` non popolato quando `itemType` manca, e la lista `quests` muore sul filo

**Files modified:** `src/quests/quest-catalog.populate.ts`, `src/quests/quest-catalog.populate.spec.ts`, `src/quests/quests.resolver.int-spec.ts`
**Commits:** `58a08d4` — `test(08): WR-01 prove an item without itemType is dropped as a catalog orphan`; `06ce95b` — `fix(08): WR-01 treat a raw ObjectId item as a catalog orphan so the quests list never dies`
**Applied fix:**
- `isResolved(entry)` ora è `entry.item != null && typeof entry.item === 'object' && !(entry.item instanceof Types.ObjectId)`; import di `Types` da `mongoose` (il `PopulateOptions` resta `type`).
- Unit spec: `drops an item left as a raw ObjectId by an unresolved refPath` (voce grezza in `recommendedLoot`, `prizeItem`, `randomLoot` → scartata / `null`). RED verificato: la voce grezza restava nella lista.
- Wire int-spec: `keeps the list alive when an item has no itemType` — quest scritta con `collection.insertOne` (bypass della validazione, come le quest editate a mano per D-28) con una voce senza `itemType` in ciascuno dei tre path. RED verificato sul filo: due `INTERNAL_SERVER_ERROR` ("ID cannot represent value: Buffer") su `prizes.prizeItem.item.id` e `prizes.randomLoot[0].item.id`. GREEN: `errors` assente, voci scartate, quest sana intatta.
- **Deviazione registrata:** la prima stesura del wire test usava un `recommendedLoot` misto (una voce senza `itemType` e una con `LootItem`); Mongoose 8.18.1, in un array con fratelli che dichiarano il modello, popola anche la voce senza `itemType` riusando quel modello. Il caso è stato reso deterministico (una sola voce per path) e il comportamento è annotato nel commento dello spec. L'invariante protetto da D-31 (la lista `quests` non muore) vale in entrambe le forme.

### WR-02: il viaggio automatico "salta" su un POI inesistente quando il `markerLocation` della quest è un riferimento pendente

**Files modified:** `src/travel/travel-planner.service.ts`, `src/quests/acceptance/quest-acceptance.service.ts` (solo commento), `src/travel/travel-planning.int-spec.ts`, `src/quests/acceptance/quest-acceptance.service.int-spec.ts`, `src/quests/acceptance/accept-quest.resolver.int-spec.ts`, `.planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md`
**Commits:** `a7544ca` — `test(08): WR-02 prove a quest marker without a POI document is rejected fail-closed`; `a19abb0` — `fix(08): WR-02 reject a quest marker without a POI document fail-closed before the transaction`
**Applied fix:**
- `TravelPlanner.planAuto`: dopo le due letture lean, `if (!to)` → `logger.warn("Marker <poi> della missione <quest> inesistente: accettazione rifiutata")` e `throw GameRuleException.questNotAcceptable()`. Il WARN porta solo gli id di quest e POI (mai il personaggio o il proprietario). La rotta si calcola poi solo se `from` esiste: la partenza pendente resta benigna (il salto ripara la posizione, come osservato dal reviewer). Il rifiuto avviene in `movementTo`, cioè **prima** di `connection.transaction`: nessuna scrittura.
- Planner int-spec (`travel-planning.int-spec.ts`, la suite propria del planner — `planAuto` è DB-backed, non esiste una funzione pura da testare in unit): `rejects a marker without a point of interest document with QUEST_NOT_ACCEPTABLE` (RED: la promise si risolveva con `null`) e `still jumps when only the starting location is missing` (caratterizzazione del caso benigno).
- Acceptance int-spec: `rejects a marker without a point of interest document with QUEST_NOT_ACCEPTABLE and writes nothing` — marker fantasma aggiunto ai `pointsOfInterest` della città (così `locationInQuestCity` passa), spy su `connection.transaction` che deve restare non chiamato, personaggio immutato (`location`, `activeTravel`, `pendingQuest`), nessuna `PendingQuest`, coda vuota, WARN atteso.
- **Deviazione registrata (fixture):** il `persistWorld()` base di `quest-acceptance.service.int-spec.ts` e di `accept-quest.resolver.int-spec.ts` creava `cityMarker`/`cityPoi`/`questMarker` come ObjectId nudi senza documento POI — esattamente il difetto ora rifiutato — e 11 test della corsia standard cadevano con `QUEST_NOT_ACCEPTABLE`. Le due fixture persistono ora POI reali (via `persistPoi`) collocati a `[50, 50]`, `[50.01, 50.01]`, `[50.02, 50.02]`, lontani da qualunque nodo del travel world: senza strada la corsia standard continua a **saltare** come prima (deviazione 08-11 del handoff), quindi le asserzioni esistenti restano valide e deterministiche a prescindere dallo stato del grafo in memoria.
- Handoff aggiornato: riga `QUEST_NOT_ACCEPTABLE` della tabella codici (§2), ordine di valutazione di `acceptQuest` (§2), semantica del salto in §3 ("solo se il POI del marker esiste"), nota di §10 (`markerLocation` esistente, `itemType` obbligatorio sulle voci item).

## Fuori scope — presi su ruling dell'orchestratore

### IN-01: `routeBetween` confonde "stesso nodo" con "nessun percorso"

**Files modified:** `.planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md`
**Commit:** `62599f4` — `docs(08): IN-01 document the same-node route semantics and refresh the gate counts`
**Applied fix:** nessuna modifica di codice (comportamento dichiarato e testato). Documentato nel handoff che due POI che agganciano lo stesso nodo del grafo non hanno rotta: viaggio libero → `TRAVEL_NO_PATH` (riga della tabella §2 estesa), viaggio da quest → salto istantaneo con il WARN di D-03 (§3, nuovo bullet "Stesso nodo stradale = nessun percorso"), nota in §8 sulle durate (sui dati di sviluppo il caso non si presenta; un marker di quest entro 5 km dal marker della città senza nodo più vicino salterebbe a ogni accettazione), requisito in §11(c) (marker su un nodo stradale **diverso** da quello della città). Nello stesso commit la riga "Stato" riporta i conteggi del gate post-fix.

### IN-07: commenti legacy sugli import in `RoadsService`

**Files modified:** `src/roads/roads.service.ts`
**Commit:** `33c5b6e` — `refactor(roads): IN-07 drop the legacy import comments`
**Applied fix:** rimossi "Assicurati che questi import siano corretti…" e "Assumi che questo sia corretto". `eslint`: 0 errori, resta il solo warning preesistente su `getShortestPath` (intoccabile per D-11, già dichiarato nel handoff).

## Skipped Issues

Tutti fuori dal `fix_scope` (`critical_warning`); una riga ciascuno, come da ruling.

- **IN-02** (`travel-completion.processor.ts`): già documentato in §13 del handoff — con `TRAVEL_SWEEP_INTERVAL_MS=0` un job anticipato resta incompleto fino al prossimo boot; in produzione tenere lo sweep attivo.
- **IN-03** (`travel-scheduler.service.ts`, `removeOnFail` senza TTL): hardening della coda Bull, Phase 10.
- **IN-04** (`codeOf` duplicabile, `catch {}` dello scheduler): refactor di diagnostica, Phase 10.
- **IN-05** (`Clock` registrato tre volte): scelta di design; un `ClockModule` è un refactor senza impatto funzionale.
- **IN-06** (`isFullForEveryone` senza chiamanti): riferimento condiviso con il FE per D-29/D-32, resta come specifica eseguibile.
- **IN-08** (`TRAVEL_IN_PROGRESS` dopo un teleport concorrente): scelta documentata nel commento, il retry riesce; eventuale `travelSameLocation()` in Phase 10.

## Verifica

Per ogni fix: rilettura del file modificato, `npx prettier --write` + `npx eslint` sui soli file toccati (0 errori), suite interessate rieseguite (percorsi prima di `--selectProjects`, integration con `--runInBand`).

**Gate di fase dopo i fix** (eseguito dopo `33c5b6e`, prima del commit docs `62599f4`):

| Check | Esito |
|-------|-------|
| `npx jest --selectProjects unit` | **95 suite / 1416 test** passati (prima: 95 / 1415) |
| `npm run test:int` (`--runInBand`) | **57 suite / 743 test** passati, ~107 s (prima: 57 / 739) |
| `npm run build` | exit 0 |
| `git diff --exit-code src/schema.gql` | exit 0 (SDL invariato) |
| `git status` | pulito dopo ogni commit; nessuna modifica non committata |

Nuovi test: +1 unit (WR-01), +4 integration (WR-01 wire ×1, WR-02 planner ×2, WR-02 accettazione ×1).

**Note operative:**
- I commit sono stati fatti con `git add` + `git commit -m` invece di `gsd-tools commit`: con `branching_strategy: phase` quel comando può eseguire `git checkout -b` quando un path contiene `NN-`, e il vincolo del workflow vieta di creare o cambiare branch. Risultato identico (commit atomici per finding, nessun trailer).
- `08-REVIEW-FIX.md` non è committato: lo committa l'orchestratore.

---

_Fixed: 2026-10-21T21:58:02Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
