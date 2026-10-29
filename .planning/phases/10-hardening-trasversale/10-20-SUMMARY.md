---
phase: 10-hardening-trasversale
plan: 20
subsystem: models-typecheck
tags: [mongoose, schema, typescript, jest, ci, D-17b, C13, BE-HARD-06]
requires:
  - "10-19: indici con nome e boot reale a 63 casi"
provides:
  - "Enemy.locations e PointOfInterest.type come liste anche per Mongoose (type: [String], enum PoiType, default [])"
  - "tsconfig.json con types node, multer, jest; tsconfig.build.json con types node, multer"
  - "npx tsc --noEmit -p tsconfig.json a 0 errori, gate di ogni piano successivo"
  - "step CI `Type check` subito dopo `Build`"
affects: [10-21, 10-22, 10-23, 10-24, 10-25, 10-26, 10-27, 10-28, 10-29, 10-30, 10-31]
tech-stack:
  added: []
  patterns:
    - "filtri grezzi del driver su id `unknown` delle fixture: cast mirato `as Types.ObjectId` sul solo valore"
    - "Model<Classe> invece di Model<ClasseDocument> quando la spec usa `_id` come ObjectId"
    - "collection tipizzata nei test (`connection.collection<Raw...>(nome)`) per gli update grezzi su liste"
    - "lean<Forma>() tipizzato invece del cast del risultato"
key-files:
  created:
    - src/models/catalog-list-fields.schema.spec.ts
    - src/pointsOfInterest/point-of-interest-type.int-spec.ts
  modified:
    - src/models/enemy.model.ts
    - src/models/point-of-interest.model.ts
    - tsconfig.json
    - tsconfig.build.json
    - .github/workflows/ci.yml
    - 26 spec (elenco nella sezione Task 2)
decisions:
  - "Un documento legacy con lo scalare viene letto come lista di un elemento dal cast di Mongoose (hydrate e query): nessun reader dedicato; la normalizzazione su disco resta allo script del 10-26"
  - "tsconfig.build.json fissa types a node e multer: un uso accidentale dei globali di Jest nel codice di produzione non compila"
  - "Correzioni solo nei test, preferendo tipi esatti (Model<Classe>, collection tipizzata, lean tipizzato, signature dei helper) ai cast; nessun ts-ignore, nessun any nuovo"
metrics:
  duration: "~40 min"
  completed: "2026-10-30"
  tasks: 2
  files: 33
---

# Phase 10 Plan 20: liste Mongoose del catalogo e type check dei test Summary

`Enemy.locations` e `PointOfInterest.type` sono liste di `PoiType` anche per Mongoose (gli scalari legacy si leggono come lista di un elemento), `tsconfig.json` include i tipi di Jest con 0 errori di `tsc` grazie a correzioni nei soli spec, e la CI esegue il type check dopo la build.

## Commit

| Task | Commit | Tipo | Contenuto |
|------|--------|------|-----------|
| 1 | b3cb3ee | style | Prettier sui due modelli non formattati (nessun cambio di logica) |
| 1 | 83ee2d3 | test (RED) | `catalog-list-fields.schema.spec.ts` (4 casi) e `point-of-interest-type.int-spec.ts` (1 caso) |
| 1 | e46576c | fix (GREEN) | `@Prop({ type: [String], enum: Object.values(PoiType), default: [] })` sui due campi; import morti `Float`/`SpellInput` rimossi da `enemy.model.ts` (Boy Scout) |
| 2 | e5b180c | test | `types` con `jest`, `tsconfig.build.json` senza, 64 errori corretti in 26 spec |
| 2 | 7b33054 | ci | step `Type check` (`npx tsc --noEmit -p tsconfig.json`) subito dopo `Build` |

## Task 1: liste Mongoose (D-17b)

RED osservato:
- unit: 4/4 rossi. `instance` era `'String'` invece di `'Array'` per entrambi i campi; `hydrate({ type: 'city' })` restituiva `"city"` invece di `['city']`; il valore fuori enum non dava l'errore atteso su `type.0`.
- integration: la query `pointOfInterest { type }` falliva con `INTERNAL_SERVER_ERROR` «Expected Iterable, but did not find one for field "PointOfInterest.type"» sul documento legacy scalare.

GREEN: unit `src/models` 11 suite / 91 test; integration `src/pointsOfInterest src/validation src/quests test/app.int-spec.ts` 30 suite / 412 test (boot reale 63/63); `npm run build` 0; `src/schema.gql` invariato.

## Task 2: tipi di Jest e type check (C13)

`npx tsc --noEmit -p tsconfig.json` dopo l'aggiunta di `jest` ai `types`: **64 errori in 26 file** (non 56 in 23):
- i 23 file previsti, con `pending-requests.service.int-spec.ts` salito da 5 a 10 errori (casi aggiunti dal 10-02 sulla corsia standard): 61 errori;
- 3 spec aggiunti o toccati dai piani 10-07…10-14, fuori dal `files_modified` del piano: `test/app.int-spec.ts` (1), `src/throttling/throttling.int-spec.ts` (1), `src/throttling/app-throttler.guard.spec.ts` (1).

Categorie di correzione (solo file di test):
1. `_id` di tipo `unknown` (documenti `X & Document` delle fixture e di `TestPlayer`): `Model<PendingQuest>` invece di `Model<PendingQuestDocument>` (`pending-requests.service`, `travel-completion`); helper che accettano `unknown` dove usano solo `String(id)` (`rawUser` di `character-deletion.resolver`, `laneOf` di `pending-requests.service`); helper `rawUserOf(player)` con un solo cast in `death-acknowledgement` (9 errori → 1 cast); cast mirato `as Types.ObjectId` sul valore nei filtri del driver grezzo (`quest-result-access`, `archived-character-visibility`, `accept-quest.resolver`, `acknowledge-quest-result`, `quest-result-received.subscription`, `quest-result.resolver`, `unacknowledged-quest-results`, `teleport.resolver`, `travel.resolver`); `String(x._id)` invece di `x._id.toString()` (`throttling.int-spec`, `dev-auth.strategy` con `!` dopo `expect(stored).not.toBeNull()`).
2. Update grezzi su liste rifiutati dai tipi del driver su `Document` (`quest-acceptance.service`, 4): collection tipizzate `rawQuests()`/`rawCities()` via `connection.collection<RawQuestRegistrations | RawCityPointsOfInterest>(model.collection.collectionName)`, scrittura sempre senza il cast di Mongoose.
3. Firme: `NoopPushTransport` usato tramite la porta `PushTransport` (4); `it.each` di `auth-session.service` con una factory di spia per riga invece della coppia oggetto/metodo (2); `throwFor()` senza argomenti come l'override di `AppThrottlerGuard` (1); `getInstance()` assegnato a una variabile `Application` in `test/app.int-spec.ts` (1).
4. Letterali e cast: `TokenDeliveryOutcome[]` tipizzato in `push-delivery.spec` invece del cast incompatibile; spread di `RESCUE` in `resolution-kind.spec`; `path.options.enum` al posto di `enumValues` (assente dai tipi di Mongoose) in `character.model.spec`; `PopulatedCharacter._id` opzionale in `user-updates.publisher`; `lean<...>()` tipizzato in `fixtures.int-spec` e `complete-pending-request.resolver` (con `!` sul risultato, come il cast precedente che falliva comunque su `null`).

Verdi: `npx tsc --noEmit -p tsconfig.json` 0; `npm run build` 0; `npm run test:unit` 172 suite / 2290; le 20 int-spec toccate 20 suite / 316; boot reale 63/63; `src/schema.gql` invariato.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Perimetro di `tsc` più ampio del previsto**
- **Found during:** Task 2
- **Issue:** 64 errori in 26 file invece di 56 in 23; tre spec dei piani 10-07…10-14 (`test/app.int-spec.ts`, `src/throttling/throttling.int-spec.ts`, `src/throttling/app-throttler.guard.spec.ts`) fuori da `files_modified`.
- **Fix:** corretti nello stesso commit come previsto dalle plan_notes per gli spec dei piani precedenti.
- **Commit:** e5b180c

**2. [Rule 1 - Bug di test] Valore fuori enum nella spec del piano**
- **Found during:** Task 1
- **Issue:** il `<behavior>` usava `['city', 'shop']`, ma `shop` non è un valore di `PoiType` e GraphQL non potrebbe serializzarlo.
- **Fix:** la spec usa `[PoiType.city, PoiType.dungeon]`.
- **Commit:** 83ee2d3

**3. [Boy Scout] Import morti in `enemy.model.ts`**
- **Fix:** rimossi `Float` e `SpellInput` (warning eslint) nel commit GREEN.
- **Commit:** e46576c

**4. Correzioni diverse dall'elenco del RESEARCH C13**
- C13 dà solo i conteggi per file; le correzioni preferiscono tipi esatti a cast per riga (in `death-acknowledgement` un helper sostituisce 9 cast; in `quest-acceptance.service` collection tipizzate invece di cast sull'update; in `app-throttler.guard.spec` la chiamata segue la firma reale senza argomenti).

## Deferred Issues

- `src/quests/results/quest-result-maintenance.int-spec.ts` › «marks every legacy result as confirmed at its resolution time, once»: fallito una volta su tre nella corsa integration lunga del Task 1, verde da solo e alla seconda corsa completa (30 / 412). Non legato ai due modelli toccati; probabile race con `maintain()` lanciato e non atteso dal boot (piano 10-19). Da osservare nei piani successivi.
- `test/app.int-spec.ts:796` warning eslint `no-base-to-string` su `String(url)` del `fetchSpy`, emerso perché ora il file è tipizzato: è un warning su codice preesistente, non toccato.

## Known Stubs

Nessuno.

## Threat Flags

Nessuno: nessuna superficie nuova (T-10-74 e T-10-75 mitigati come da piano).

## Self-Check: PASSED
