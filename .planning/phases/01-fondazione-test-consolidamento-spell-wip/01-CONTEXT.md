# Phase 1: Fondazione Test & Consolidamento Spell WIP - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Esiste una fondazione TDD affidabile — MongoMemoryReplSet (change stream + transazioni), Bull mockato al confine DI negli unit test + Redis effimero reale nei test di integrazione dei processor, fixture/factory riusabili per User, Character, Quest, Spell, Road, POI — e il WIP spell nel working tree (equip/unequip/useSpell + processor spell-recovery) è consolidato con TDD, con fix dell'ordine di validazione in `useSpell`, e committato. A fine fase il working tree è pulito e la dir vuota `src/spellRecovery/` è rimossa.

Requirements: BE-TEST-01, BE-TEST-02, BE-TEST-03, BE-TEST-04.

**Fuori dal boundary:** atomicità/race condition (`useSpell` concorrente, cap recovery — Phase 4, BE-ATOM-05); semantica recovery sequenziale combat-driven (Phase 9); auth/authz (Phase 2-3).

</domain>

<decisions>
## Implementation Decisions

### Fixture/factory (BE-TEST-03)
- **D-01:** Factory come **funzioni pure** — `createXFixture(overrides?)` / `buildX(overrides?)`. Nessuna libreria (no fishery, no builder class).
- **D-02:** Vivono in **`test/fixtures/`** — fuori da `src/`, raggiungibili da unit spec e e2e, escluse dal build di produzione.
- **D-03:** **Due livelli:** `buildX(overrides)` ritorna un plain object (unit test con model mockato); `persistX(model, overrides)` lo salva su MongoMemoryReplSet (integration test) riusando `buildX`.
- **D-04:** Default **minimi validi e deterministici** — solo i campi richiesti dallo schema, valori fissi (no faker, no snapshot dal DB). Ogni test esplicita ciò che gli interessa via overrides.

### Perimetro consolidamento spell WIP (BE-TEST-04)
- **D-05:** In Fase 1 il WIP si consolida **as-is**: scheduling recovery per-uso (un job Bull per ogni `useSpell`, delay = `recoveryTime` dal momento dell'uso). I test fissano il comportamento corrente come contratto temporaneo.
- **D-06:** Il fix obbligatorio è il **solo ordine di validazione** in `useSpell` (`characters.service.ts:297-303`): la spell va verificata su `spellModel` **prima** di decrementare gli usages e salvare. Test RED che prova il vecchio ordine (usage perso se la spell non esiste), poi GREEN.
- **D-07:** Il **cap sugli usages nel processor recovery è deferito a Phase 4** (BE-ATOM-05: recovery idempotente che non supera mai il massimo). Nessun guard temporaneo qui.
- **D-08:** **Commit separati per concern** sul branch `feat/01-test-foundation`: chore (infra Bull/Redis in app.module + registrazione queue) → feat (mutation equipSpell/unequipSpell/useSpell + processor, con test) → fix (ordine validazione, RED→GREEN) → refactor/chore (collaterali). Conventional Commits.
- **D-09:** Le **modifiche collaterali del WIP si tengono** (Boy Scout Rule), in commit dedicati: logger in `roads.service.ts`, rimozione provider `PUB_SUB` duplicato da `mongo.module.ts` (da verificare con test/smoke che le subscription `characterUpdated` funzionino ancora), `packageManager` in package.json.

### CI (BE-TEST-01 "CI-ready")
- **D-10:** Si crea la **pipeline GitHub Actions in questa fase** — non solo compatibilità.
- **D-11:** La pipeline esegue la **suite completa**: lint + unit + integration (MongoMemoryReplSet con binary caching + Redis effimero avviabile in CI).
- **D-12:** Trigger: **ogni push su ogni branch** (feedback continuo anche sui branch di fase, non solo sulle PR).

### Claude's Discretion
- Architettura interna dell'harness: topologia MongoMemoryReplSet (istanza condivisa via globalSetup vs per-file), separazione unit/integration (Jest projects vs config unica), meccanismo di avvio del Redis effimero (container, binario, servizio CI) — decidere in research/planning rispettando le decisioni bloccate (replica set, no ioredis-mock, Bull DI-mock negli unit).
- Struttura interna di `test/fixtures/` (un file per modello vs index unico) e naming delle factory.
- Dettagli del workflow GitHub Actions (versioni Node, caching npm/yarn, strategia di caching dei binari mongodb-memory-server).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisiti e stato
- `.planning/REQUIREMENTS.md` — BE-TEST-01..04 (definizioni normative della fase)
- `.planning/ROADMAP.md` §Phase 1 — success criteria e research flag (replica-set CI flakiness / binary caching)
- `.planning/STATE.md` — decisioni accumulate (replica set, Bull DI-mock + Redis reale, no ioredis-mock)

### Mappa codebase
- `.planning/codebase/TESTING.md` — stato test attuale (solo scaffold), config Jest, pattern raccomandati
- `.planning/codebase/CONCERNS.md` — concern critici #5 (`useSpell` non atomico); distinguere ciò che è Phase 1 (ordine validazione) da Phase 4 (atomicità)
- `.planning/codebase/CONVENTIONS.md` — naming, stile, error handling da rispettare nei nuovi test

### Codice WIP da consolidare (working tree, non committato)
- `src/characters/characters.service.ts` — `equipSpell`/`unequipSpell`/`useSpell` (bug ordine validazione a :297-303)
- `src/characters/spell-recovery.processor.ts` — processor Bull `spell-recovery` (nuovo file)
- `src/models/request/use-spell-request.model.ts` — DTO nuovo
- `src/characters/characters.resolver.ts`, `src/characters/characters.module.ts`, `src/app.module.ts` (BullModule), `src/mongo/mongo.module.ts` (rimozione PUB_SUB), `src/roads/roads.service.ts` (logger), `src/schema.gql`, `package.json`/`package-lock.json`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Scaffold Jest funzionante (`src/app.controller.spec.ts`, `test/app.e2e-spec.ts` + `test/jest-e2e.json`) — base per estendere la config, non c'è altro test esistente da preservare.
- `PubSubModule` globale (`src/pubsub.module.ts`) — è il provider `PUB_SUB` legittimo; il duplicato in `mongo.module.ts` è quello rimosso dal WIP.

### Established Patterns
- Modelli unificati GraphQL ObjectType + Mongoose Schema in `src/models/` — le factory devono produrre oggetti conformi a questi schema (attenzione a `Types.ObjectId` e al `idTransformPlugin` globale).
- Bull già configurato nel WIP: `BullModule.forRootAsync` in `app.module.ts` (REDIS_HOST/REDIS_PORT), coda `spell-recovery` registrata in `characters.module.ts` — il mock DI negli unit usa `getQueueToken('spell-recovery')`.
- Change stream su Character → PubSub → subscription `characterUpdated` (in `mongo.service.ts`/resolver) — il test replica-set di BE-TEST-01 deve esercitare questo meccanismo.

### Integration Points
- Config Jest inline in `package.json` (unit) + `test/jest-e2e.json` (e2e) — l'harness si innesta qui (setup/teardown condivisi, eventuale split unit/integration).
- `ConfigModule.forRoot({envFilePath: '.env'})` globale — i test di integrazione dovranno fornire env propri (MONGO_URI del replica set effimero, REDIS_HOST/PORT dell'istanza effimera).
- Nessuna directory `.github/workflows/` esistente — la pipeline CI parte da zero.

</code_context>

<specifics>
## Specific Ideas

- Il test RED per D-06 deve riprodurre esattamente lo scenario di perdita: `useSpell` con `spellId` inesistente su una spell attiva → oggi decrementa e salva, poi lancia NotFoundException senza schedulare recovery (usage perso per sempre).
- Design di gioco chiarito dal Shogun (per il futuro, non per questa fase): il recovery delle spell è concettualmente sequenziale — un utilizzo recuperato alla volta, N × recoveryTime — e nel disegno finale la catena parte alla fine del combattimento, quando il combat result rivela il totale di utilizzi spesi.

</specifics>

<deferred>
## Deferred Ideas

- **Phase 9 (Combat Result):** rework del recovery spell in semantica **sequenziale combat-driven** — la catena di recovery parte quando il combattimento termina e si ottiene il risultato (totale utilizzi noto); un recupero alla volta, il successivo parte al completamento del precedente. Lo scheduling per-uso consolidato in Fase 1 è un contratto temporaneo.
- **Phase 4 (BE-ATOM-01..05):** atomicità di `useSpell` (race condition read-modify-write concorrente) e cap/idempotenza del recovery job (mai usages oltre il massimo).

</deferred>

---

*Phase: 01-fondazione-test-consolidamento-spell-wip*
*Context gathered: 2026-07-16*
