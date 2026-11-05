---
phase: 13-generazione-quest
plan: 18
subsystem: quests (generazione: gate d'integrazione end to end)
tags: [quests, generation, integration, BE-QGEN-08, BE-QGEN-03, BE-QGEN-04, D-03, D-07, D-14, D-15, D-16, D-17, D-28]
requires: ["13-17"]
provides:
  - "test/quests/quest-generation.e2e.int-spec.ts: tetto, POI liberi, tipi, distribuzione su 30 città, legend nel giro, idempotenza, tabellone senza scadenza attraverso la mutation `generateQuests`"
  - "test/quests/quest-generation-access.e2e.int-spec.ts: single-flight su due chiamate concorrenti, due generatori sullo stesso POI, FORBIDDEN, audit"
  - "`generatedPerCityOf(world, markers): Record<string, number>` in test/quests/generation-world.ts"
affects: [13-19, 13-20]
tech-stack:
  added: []
  patterns:
    - "Config del generatore come oggetto mutabile passato in override (`{ token: QUEST_GENERATION_CONFIG, useValue: config }` dopo `QUIET_GENERATION_OVERRIDES`): ogni caso imposta `config.target` senza ricreare l'harness"
    - "Sovrapposizione deterministica di due chiamate HTTP: spy su `generate` + `runOnce` trattenuto finché `generate` non è stato chiamato due volte"
    - "Gara deterministica fra due generatori: Proxy sul model Quest con barriera sull'insert (ogni `create` attende che entrambi ci siano arrivati)"
key-files:
  created:
    - test/quests/quest-generation.e2e.int-spec.ts
    - test/quests/quest-generation-access.e2e.int-spec.ts
  modified:
    - test/quests/generation-world.ts
decisions:
  - "Seme fisso 7 (`SeededChanceSource(7)`) per l'harness; i due generatori del caso D-28 usano i semi 7 e 8"
  - "Il caso D-28 asserisce anche il WARN `Generatore: POI <hex> già occupato da un'altra corsa, si prosegue` (prova che l'indice unico parziale ha respinto il secondo insert, non che il secondo generatore abbia visto il POI già occupato)"
  - "Il caso D-17 trattiene la corsa finché entrambe le mutation sono arrivate al generatore: senza la ritenuta la sovrapposizione dipenderebbe dai tempi di supertest"
  - "Il caso del tabellone (D-14) importa anche `QuestsModule` per la query `quests`"
metrics:
  duration: "~25 min"
  completed: 2026-11-04
  tasks: 2
  files: 3
---

# Phase 13 Plan 18: Gate d'integrazione della generazione attraverso la mutation Summary

Due int-spec end to end in `test/quests/` provano insieme, sul modulo completo `QuestGenerationModule` e attraverso `mutation { generateQuests { created } }`, tetto per città, POI liberi, tipi `enemy`/`boss` soli, distribuzione su 30 città, legend nel giro, seconda corsa a 0, tabellone senza scadenza, single-flight, gara fra due generatori sullo stesso POI, FORBIDDEN e audit.

## Commit

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 1 | 09dffe5 | test(generation): cover cap, spread and idempotence end to end |
| 2 | d0c8f17 | test(generation): cover concurrency and access end to end |

## Casi verdi al primo colpo (la prova)

Il codice esisteva già (piani 13-09..13-14): tutti gli 11 casi sono passati verdi al primo colpo, nessun difetto trovato, nessun `fix(generation)`.

- `respects the cap of three generated quests per city (D-15)`: 4 città × 6 POI, target 24 → `created` 12, `{ 'Città 0': 3, …, 'Città 3': 3 }` con `toEqual`. Verde perché `cityWeightOf` dà peso 0 a una città con 3 generate (`MAX_GENERATED_PER_CITY`).
- `never places a generated quest on a city marker or on an occupied poi (D-15)`: hunt, dungeon e job aperte sul primo POI delle città 0–2, target 12 → 9 create, nessuna sui marker o sui tre POI, nessun POI ripetuto. Verde perché `readWorld` toglie dai liberi i marker e i POI di ogni quest aperta.
- `generates only enemy and boss quests and leaves the fixed ones untouched (D-03)`: tipi delle generate = `['boss', 'enemy']` (`toEqual`), documenti grezzi delle tre fisse `toEqual` a prima, 3 non generate. Verde perché `composeQuest` produce solo enemy/boss e il generatore fa solo insert.
- `spreads the quests over a 30 city map without concentrating them (D-15)`: griglia 6 × 5, 3 POI per città, target null → 30 create, massimo per città ≤ 3, almeno una città a 0. Verde per il peso di densità dei vicini.
- `brings the legend rank into the rotation (D-07)`: 4 × 3, target 12 → almeno una legend; ogni legend con posti `[{ title: 'legend', count: 1 }]`, 2–4 unità, tutti nemici di fascia hero (xp 560/700). Verde per `legendPack` e la rotazione `ranksByCoverage`.
- `creates nothing on a second run once the world is full (D-16)`: 12 poi 0, conteggio invariato.
- `keeps generated quests on the board with no expiry (D-14)`: `concludedAt` null su tutte, la query `quests` restituisce esattamente gli id delle generate, tipo enemy/boss, `enemies` non vuoto con `quantity > 0`.
- `shares one run between two concurrent innkeeper calls (D-17)`: `generate` chiamato 2 volte, stessi `created`, quest a DB = `created`.
- `never creates two quests on the same poi under two concurrent generators (D-28)`: una città con un solo POI, due `QuestGenerator` (semi 7 e 8, target 1) dietro la barriera → somma 1, una sola generata sul POI, un solo WARN di E11000, nessuna eccezione. Verde per l'indice `quest_generated_open_marker` e la cattura di `isDuplicateKeyError`.
- `refuses an adventurer and a guard with FORBIDDEN without generating (D-16)`: `{ data: null, codes: ['FORBIDDEN'] }` × 2, 0 quest.
- `audits the innkeeper run without auditing the refused calls (D-16)`: adventurer, oste, guard → un solo `AdminAuditLog` dell'oste.

Prima della barriera, una sonda diagnostica (rimossa, mai committata) aveva mostrato che la gara si verifica anche senza ritenuta (2 esecuzioni su 2 con il WARN di E11000); la barriera la rende deterministica.

## Nomi e firme creati

- `generatedPerCityOf(world: GenerationWorld, markers: readonly Types.ObjectId[]): Record<string, number>` (test/quests/generation-world.ts): conteggio per nome di città con gli zeri; i marker fuori dai POI del mondo sotto la chiave `fuori mappa`.
- Helper locali delle spec: `persistFixedQuests(world)`, `rawQuests(ids)`, `standaloneGenerator(seed, questModel)`, `barrierModel(parties)`, `holdRunUntilCalls(generator, calls)`.

## Verifica

- `npx jest test/quests/quest-generation-access.e2e.int-spec.ts test/quests/quest-generation.e2e.int-spec.ts --selectProjects integration --runInBand`: 2 suite / 11 test verdi (access ripetuta 3 volte, sempre verde).
- `npx tsc --noEmit -p tsconfig.json`: 0.
- `npx prettier --write` e `npx eslint` sui tre file, uno per uno: puliti.
- `git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'`: solo le due righe `  enemy: Enemy`; `src/schema.gql` invariato.
- Nel log della suite compaiono, alla chiusura dell'harness, gli ERROR `Change stream … chiuso (chiusura inattesa)` di `UserUpdatesPublisher`/`QuestsPublisher`: rumore di teardown dell'harness, non un fallimento.

## Deviations from Plan

Nessuna deviazione dalle regole. Aggiunte di robustezza rispetto al `<behavior>`:

- Il caso D-17 trattiene `runOnce` finché `generate` non è stato chiamato due volte (senza, le due richieste HTTP potrebbero non sovrapporsi e la seconda restituirebbe 0).
- Il caso D-28 mette una barriera sull'insert e asserisce il WARN dell'E11000, così prova l'indice unico e non solo la rilettura del mondo.
- Il caso D-03 asserisce che compaiono sia `enemy` sia `boss` (con il seme 7), non solo che i tipi stiano nell'insieme.

## Self-Check: PASSED

- FOUND: test/quests/quest-generation.e2e.int-spec.ts, test/quests/quest-generation-access.e2e.int-spec.ts
- FOUND: 09dffe5, d0c8f17
