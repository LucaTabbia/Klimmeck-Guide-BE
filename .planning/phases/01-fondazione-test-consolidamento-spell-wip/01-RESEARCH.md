# Phase 1: Fondazione Test & Consolidamento Spell WIP - Research

**Researched:** 2026-07-16
**Domain:** Test infrastructure (NestJS 11 + Jest 30 + Mongoose 8 + Bull/ioredis) — MongoMemoryReplSet, Bull DI-mock, fixture/factory, TDD del WIP spell
**Confidence:** HIGH (stack verificato via npm registry + docs ufficiali; codice WIP letto direttamente)

## Summary

La fase costruisce l'harness di test da zero: oggi esiste solo lo scaffold Jest (`app.controller.spec.ts`, `app.e2e-spec.ts`). L'obiettivo tecnico centrale è far girare la suite contro un `MongoMemoryReplSet` a nodo singolo — necessario perché **change stream e transazioni Mongo funzionano solo su replica set** — con `mongodb-memory-server@11.2.0`. La buona notizia rispetto al research flag: dalla versione 11 il binario MongoDB di default è la serie 8.x con storage engine **wiredTiger**, che supporta change stream e transazioni senza configurazione extra (il vecchio problema `ephemeralForTest` che non supportava i change stream è superato per Mongo ≥ 7.0). La flakiness in CI si combatte con: (1) caching del binario, (2) pin della versione MongoDB, (3) una singola istanza replSet condivisa via `globalSetup` con cleanup delle collection tra i test invece di restart, (4) teardown rigoroso per evitare open handle Jest.

Sul fronte Bull: gli unit test mockano la coda al confine DI con `getQueueToken('spell-recovery')` (nessun Redis in memoria, nessun `ioredis-mock` — quest'ultimo è incompatibile con Bull perché Bull usa comandi Lua/blocking che il mock non implementa). I test di integrazione del processor girano contro un **Redis effimero reale**: in CI il pattern robusto è un service container `redis:7` di GitHub Actions; in locale senza Docker l'alternativa è `redis-memory-server`. Il WIP spell (`useSpell`/`equipSpell`/`unequipSpell` + `spell-recovery.processor.ts`) viene consolidato con TDD, con l'unico fix funzionale sull'ordine di validazione in `useSpell` (verifica esistenza spell **prima** del decremento).

**Primary recommendation:** `MongoMemoryReplSet.create({ replSet: { count: 1 } })` (wiredTiger di default su Mongo 8.x) in un `globalSetup` condiviso con cleanup per-test; split unit/integration via Jest `projects`; Bull DI-mock con `getQueueToken` negli unit + Redis service container in CI per i processor; fixture come funzioni pure two-tier (`buildX`/`persistX`) in `test/fixtures/`; fix ordine validazione `useSpell` RED→GREEN.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Fixture/factory (BE-TEST-03)**
- **D-01:** Factory come **funzioni pure** — `createXFixture(overrides?)` / `buildX(overrides?)`. Nessuna libreria (no fishery, no builder class).
- **D-02:** Vivono in **`test/fixtures/`** — fuori da `src/`, raggiungibili da unit spec e e2e, escluse dal build di produzione.
- **D-03:** **Due livelli:** `buildX(overrides)` ritorna un plain object (unit test con model mockato); `persistX(model, overrides)` lo salva su MongoMemoryReplSet (integration test) riusando `buildX`.
- **D-04:** Default **minimi validi e deterministici** — solo i campi richiesti dallo schema, valori fissi (no faker, no snapshot dal DB). Ogni test esplicita ciò che gli interessa via overrides.

**Perimetro consolidamento spell WIP (BE-TEST-04)**
- **D-05:** In Fase 1 il WIP si consolida **as-is**: scheduling recovery per-uso (un job Bull per ogni `useSpell`, delay = `recoveryTime` dal momento dell'uso). I test fissano il comportamento corrente come contratto temporaneo.
- **D-06:** Il fix obbligatorio è il **solo ordine di validazione** in `useSpell` (`characters.service.ts:297-303`): la spell va verificata su `spellModel` **prima** di decrementare gli usages e salvare. Test RED che prova il vecchio ordine (usage perso se la spell non esiste), poi GREEN.
- **D-07:** Il **cap sugli usages nel processor recovery è deferito a Phase 4** (BE-ATOM-05: recovery idempotente che non supera mai il massimo). Nessun guard temporaneo qui.
- **D-08:** **Commit separati per concern** sul branch `feat/01-test-foundation`: chore (infra Bull/Redis in app.module + registrazione queue) → feat (mutation equipSpell/unequipSpell/useSpell + processor, con test) → fix (ordine validazione, RED→GREEN) → refactor/chore (collaterali). Conventional Commits.
- **D-09:** Le **modifiche collaterali del WIP si tengono** (Boy Scout Rule), in commit dedicati: logger in `roads.service.ts`, rimozione provider `PUB_SUB` duplicato da `mongo.module.ts` (da verificare con test/smoke che le subscription `characterUpdated` funzionino ancora), `packageManager` in package.json.

**CI (BE-TEST-01 "CI-ready")**
- **D-10:** Si crea la **pipeline GitHub Actions in questa fase** — non solo compatibilità.
- **D-11:** La pipeline esegue la **suite completa**: lint + unit + integration (MongoMemoryReplSet con binary caching + Redis effimero avviabile in CI).
- **D-12:** Trigger: **ogni push su ogni branch** (feedback continuo anche sui branch di fase, non solo sulle PR).

### Claude's Discretion
- Architettura interna dell'harness: topologia MongoMemoryReplSet (istanza condivisa via globalSetup vs per-file), separazione unit/integration (Jest projects vs config unica), meccanismo di avvio del Redis effimero (container, binario, servizio CI) — decidere in research/planning rispettando le decisioni bloccate (replica set, no ioredis-mock, Bull DI-mock negli unit).
- Struttura interna di `test/fixtures/` (un file per modello vs index unico) e naming delle factory.
- Dettagli del workflow GitHub Actions (versioni Node, caching npm/yarn, strategia di caching dei binari mongodb-memory-server).

### Deferred Ideas (OUT OF SCOPE)
- **Phase 9 (Combat Result):** rework del recovery spell in semantica **sequenziale combat-driven** — la catena di recovery parte quando il combattimento termina e si ottiene il risultato (totale utilizzi noto); un recupero alla volta, il successivo parte al completamento del precedente. Lo scheduling per-uso consolidato in Fase 1 è un contratto temporaneo.
- **Phase 4 (BE-ATOM-01..05):** atomicità di `useSpell` (race condition read-modify-write concorrente) e cap/idempotenza del recovery job (mai usages oltre il massimo).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-TEST-01 | Suite Jest su `mongodb-memory-server` in modalità replica set (change stream + transazioni), setup/teardown condiviso, CI-ready | `MongoMemoryReplSet.create({ replSet: { count: 1 } })` con wiredTiger (default Mongo 8.x). Sezioni *Standard Stack*, *Architecture Patterns → Harness Mongo*, *Common Pitfalls #1/#2/#3*, *Environment Availability* |
| BE-TEST-02 | Unit mockano Bull al confine DI (`getQueueToken`); integration processor usa Redis effimero reale (no `ioredis-mock`) | `getQueueToken('spell-recovery')` + `useValue` mock negli unit; Redis service container CI o `redis-memory-server` locale per i processor. Sezioni *Architecture Patterns → Bull testing*, *Don't Hand-Roll*, *Common Pitfalls #4* |
| BE-TEST-03 | Fixture/factory riusabili per User, Character, Quest, Spell, Road, POI | Funzioni pure two-tier `buildX`/`persistX` in `test/fixtures/`. Sezione *Architecture Patterns → Fixtures*, *Common Pitfalls #5 (virtual maxActiveSpells + location required + idTransformPlugin)* |
| BE-TEST-04 | WIP spell use/recovery consolidato con TDD e committato: ordine validazione corretto in `useSpell`, processor coperto da test | Fix di riordino a `characters.service.ts:297-303`; RED riproduce la perdita di usage. Sezione *Architecture Patterns → WIP consolidation*, *Code Examples* |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Direttive attuabili estratte da `CLAUDE.md` (autorità pari alle locked decision):

- **TDD obbligatorio** — Red → Green → Refactor per ogni feature/bugfix. La fase è essa stessa il layer che rende possibile il TDD a valle.
- **Tech stack non negoziabile** — NestJS 11 + Mongoose 8 + Apollo GraphQL code-first + Bull/ioredis. I test si innestano su questo, nessuna sostituzione.
- **Compatibilità FE** — i contratti GraphQL esistenti non si rompono; le aggiunte di schema (già nel WIP: `equipSpell`/`unequipSpell`/`useSpell`) devono restare coerenti con `schema.gql`.
- **Workflow** — branch + PR verso `develop`; mai push diretto su `develop`/`main`; Conventional Commits. Branch di fase: `feat/01-test-foundation`.
- **Security** — nessun secret in repo; `.env` fuori VCS. I test di integrazione NON devono committare credenziali; usano env effimeri (URI del replSet e host/port del Redis effimero iniettati a runtime).
- **Principi** — Clean Code, SoC, Boy Scout Rule (giustifica il mantenimento delle modifiche collaterali del WIP in commit dedicati, D-09).
- **Stile** — Prettier: single quote, trailing comma `all`, 4 spazi. ESLint v9 flat config. I nuovi file di test seguono questo stile.
- **Naming** — `{feature}.spec.ts` (unit co-locati in `src/`), `{feature}.e2e-spec.ts` / integration in `test/`. Factory in `test/fixtures/`.
- **Error handling** — `NotFoundException` / `BadRequestException`; messaggi con gli ID coinvolti. I test asseriscono queste eccezioni con `.rejects.toThrow(...)`.

## Standard Stack

### Core (da aggiungere come devDependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mongodb-memory-server | 11.2.0 | Avvia un MongoDB in-process (incl. replica set) per i test | Standard de-facto per test Mongoose/NestJS; supporta `MongoMemoryReplSet` per change stream + transazioni [VERIFIED: npm view mongodb-memory-server version → 11.2.0, modified 2026-05-28] |
| redis-memory-server | 0.17.0 | Redis effimero in-process per i processor test in locale (alternativa al service container CI) | Stessa famiglia di mongodb-memory-server; utile dove non c'è Docker [VERIFIED: npm view redis-memory-server version → 0.17.0] |

### Supporting (già presenti — nessuna install)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jest | 30.0.0 | Test runner | Già in devDeps; supporta `projects` per split unit/integration [VERIFIED: package.json] |
| ts-jest | 29.2.5 | Transpile TS | Già configurato in `package.json` jest block [VERIFIED: package.json] |
| @nestjs/testing | 11.0.1 | `Test.createTestingModule`, override provider | Già in devDeps [VERIFIED: package.json] |
| supertest | 7.0.0 | HTTP assertions per e2e GraphQL | Già in devDeps [VERIFIED: package.json] |
| @nestjs/bull | 11.0.3 | Fornisce `getQueueToken` per il DI-mock | Già in deps; import `getQueueToken` da `@nestjs/bull` [VERIFIED: package.json] |
| @nestjs/mongoose | 11.0.3 | Fornisce `getModelToken` per mockare i Model negli unit | Già in deps [VERIFIED: package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Redis service container CI | `redis-memory-server` (0.17.0) | Container = più fedele alla prod, gestito da GitHub Actions `services:`; memory-server = zero Docker ma scarica un binario Redis (rischio timeout CI, mitigabile con cache). Raccomandato: **service container in CI + `redis-memory-server` opzionale in locale** |
| Redis reale per i processor | `ioredis-mock` (8.13.1) | **VIETATO da locked decision** — incompatibile con Bull (Bull usa script Lua/comandi blocking non implementati dal mock) [CITED: locked decision D + community consensus] |
| MongoMemoryReplSet condiviso globalSetup | Istanza per-file | Per-file = isolamento perfetto ma lento (avvio replSet ~secondi × N file); condiviso = veloce ma richiede cleanup collection tra i test. Raccomandato: **condiviso via globalSetup** |
| Jest `projects` (unit vs integration) | Config Jest unica + testPathPattern | `projects` = separazione pulita di globalSetup (integration ha il replSet, unit no → unit velocissimi). Raccomandato: **projects** |

**Installation:**
```bash
npm install --save-dev mongodb-memory-server@11 redis-memory-server@0
```

**Version verification:** eseguito in questa sessione:
- `npm view mongodb-memory-server version` → **11.2.0** (modified 2026-05-28) [VERIFIED: npm registry]
- `npm view redis-memory-server version` → **0.17.0** [VERIFIED: npm registry]
- `node --version` → **v22.12.0** (compatibile con mongodb-memory-server 11) [VERIFIED: local]
- Binario MongoDB scaricato di default dalla serie 8.x con storage engine wiredTiger [CITED: github.com/typegoose/mongodb-memory-server README]

## Architecture Patterns

### Recommended Test Structure
```
test/
├── fixtures/                    # BE-TEST-03 — funzioni pure, escluse dal build prod
│   ├── user.fixture.ts          # buildUser / persistUser
│   ├── character.fixture.ts     # buildCharacter / persistCharacter
│   ├── quest.fixture.ts
│   ├── spell.fixture.ts
│   ├── road.fixture.ts
│   ├── poi.fixture.ts
│   └── index.ts                 # re-export unico (discrezione)
├── setup/
│   ├── mongo-replset.ts         # crea/riusa MongoMemoryReplSet
│   ├── global-setup.ts          # avvia replSet, espone URI via env/global
│   ├── global-teardown.ts       # stop replSet + disconnect
│   └── redis.ts                 # helper Redis effimero per integration
├── jest-e2e.json                # e2e esistente
└── jest-integration.json        # (opzione config-file) integration con replSet+redis

src/
├── characters/
│   ├── characters.service.spec.ts      # unit — model+queue mockati
│   └── spell-recovery.processor.spec.ts # integration — Redis reale + replSet

jest.config (in package.json o file) con projects: [unit, integration]
```

### Pattern 1: Harness MongoMemoryReplSet condiviso (BE-TEST-01)
**What:** Un singolo replica set a nodo singolo avviato una volta per run, condiviso da tutte le spec di integrazione; le collection vengono svuotate tra i test invece di riavviare l'istanza.
**When to use:** Tutti i test che toccano change stream, transazioni, o persistenza reale.
**Example:**
```typescript
// test/setup/mongo-replset.ts
// Source: github.com/typegoose/mongodb-memory-server README [CITED]
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet: MongoMemoryReplSet;

export async function startReplSet(): Promise<string> {
    // count:1 → replica set a nodo singolo. Su Mongo 8.x lo storage engine
    // è wiredTiger di default → change stream + transazioni supportati.
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    return replSet.getUri();
}

export async function stopReplSet(): Promise<void> {
    if (replSet) await replSet.stop();
}
```
```typescript
// Cleanup tra i test (in un setupFilesAfterEnv o beforeEach del progetto integration)
import mongoose from 'mongoose';

afterEach(async () => {
    const { collections } = mongoose.connection;
    for (const key of Object.keys(collections)) {
        await collections[key].deleteMany({});
    }
});
```

**Nota transazioni/change stream:** con `count: 1` il replica set è pienamente funzionale per `session.startTransaction()` e `Model.watch()`. Il change stream del progetto (`characterModel.watch(pipeline, { fullDocument: 'updateLookup' })` in `characters.service.ts:42`) va esercitato in un test di integrazione: apri il watch, esegui un update su un Character persistito, asserisci l'emissione dell'evento `characterUpdated` sul PubSub (prova end-to-end del meccanismo change stream → PubSub → subscription).

### Pattern 2: Bull DI-mock negli unit (BE-TEST-02)
**What:** Negli unit test del service, la coda Bull è sostituita al confine DI — nessun Redis.
**When to use:** Test di `CharactersService.useSpell` che verificano che il job venga schedulato con i parametri giusti.
**Example:**
```typescript
// Source: yflooi.medium.com Bull testing + docs.nestjs.com/techniques/queues [CITED]
import { getQueueToken } from '@nestjs/bull';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Character } from 'src/models/character/character.model';
import { Spell } from 'src/models/spell.model';

const mockQueue = { add: jest.fn() };
const mockCharacterModel = { findById: jest.fn() };
const mockSpellModel = { findById: jest.fn() };

const moduleRef = await Test.createTestingModule({
    providers: [
        CharactersService,
        { provide: getModelToken(Character.name), useValue: mockCharacterModel },
        { provide: getModelToken(Spell.name), useValue: mockSpellModel },
        { provide: getQueueToken('spell-recovery'), useValue: mockQueue },
        { provide: 'PUB_SUB', useValue: { publish: jest.fn(), subscribe: jest.fn() } },
    ],
}).compile();
```
Asserzione tipica: `expect(mockQueue.add).toHaveBeenCalledWith('recover', { characterId, spellId }, expect.objectContaining({ delay: spell.recoveryTime }))`.

### Pattern 3: Processor integration con Redis reale (BE-TEST-02)
**What:** Il processor `spell-recovery` gira contro un Redis effimero reale; si aggiunge un job vero e si attende il completamento.
**When to use:** Verificare che `handleSpellRecovery` incrementi `usages` sul Character persistito.
**Example (CI — service container):**
```yaml
# .github/workflows/ci.yml (frammento) — Source: docs.github.com Actions services [CITED]
services:
  redis:
    image: redis:7
    ports: ['6379:6379']
    options: >-
      --health-cmd "redis-cli ping" --health-interval 10s
      --health-timeout 5s --health-retries 5
```
Il modulo di test importa `BullModule.forRoot({ redis: { host: REDIS_HOST, port: REDIS_PORT } })` puntando al container (env), registra la coda reale + il processor + il `characterModel` sul replSet, aggiunge un job e attende. Per attendere il completamento in modo deterministico usa un `QueueEvents`/`job.finished()` o un polling sul documento con timeout, evitando `sleep` arbitrari.

### Pattern 4: Consolidamento WIP spell con fix ordine validazione (BE-TEST-04)
**What:** Il bug in `useSpell` (`characters.service.ts:297-303`) decrementa e salva PRIMA di verificare che la spell esista su `spellModel`. Se la spell non esiste, l'usage è perso e nessun recovery è schedulato.
**Fix:** Spostare la `spellModel.findById` **prima** di `activeSpell.usages -= 1; character.save()`.
**TDD:** RED riproduce la perdita (spell attiva sul character ma inesistente in collection Spell → oggi usages scende di 1 e resta perso); GREEN dopo il riordino (nessun decremento se la spell non esiste).

### Anti-Patterns to Avoid
- **`ioredis-mock` per i processor:** vietato (locked decision) — Bull non funziona sopra il mock.
- **Restart del replSet tra ogni test:** troppo lento; svuota le collection invece.
- **`--forceExit` come cura degli open handle:** maschera il problema; chiudi esplicitamente app/mongoose/replSet e usa `--detectOpenHandles` in debug.
- **Fixture con faker/valori random:** vietato (D-04) — default fissi e deterministici.
- **Mock del change stream negli unit per "coprire" BE-TEST-01:** il criterio richiede un vero replSet; il change stream va esercitato in integrazione, non simulato.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MongoDB effimero per i test | Docker compose custom / mongo locale condiviso | `mongodb-memory-server` (`MongoMemoryReplSet`) | Gestisce download binario, replSet, teardown; supporta change stream + transazioni |
| Mock della coda Bull negli unit | Wrapper custom attorno a `Queue` | `getQueueToken('spell-recovery')` + `useValue` | Sostituzione pulita al confine DI NestJS |
| Mock dei Model Mongoose negli unit | Reimplementare `findById().exec()` a mano ovunque | `getModelToken(Name)` + oggetto mock con `jest.fn()` | Pattern NestJS standard, override mirato |
| Redis per i processor | Mock parziale di ioredis | Redis reale (service container CI / `redis-memory-server`) | `ioredis-mock` non regge i comandi Lua/blocking di Bull |
| Attesa del job Bull nei test | `setTimeout`/`sleep` a naso | `job.finished()` / `QueueEvents.completed` o polling con timeout | Deterministico, niente flakiness da timing |

**Key insight:** L'intera fase è "usa lo strumento giusto al confine giusto" — mock al confine DI dove il costo di Redis/Mongo non serve (unit), infrastruttura reale dove il comportamento dipende da essa (change stream, transazioni, job Bull).

## Common Pitfalls

### Pitfall 1: Change stream non emette (storage engine sbagliato)
**What goes wrong:** Su binari MongoDB < 7.0, mongodb-memory-server usava `ephemeralForTest` che **non supporta i change stream**.
**Why it happens:** Storage engine di default storico.
**How to avoid:** mongodb-memory-server 11 scarica di default la serie 8.x (wiredTiger) → nessun override necessario. Se si pinna una versione MongoDB, assicurarsi che sia ≥ 7.0 (wiredTiger). Non forzare `storageEngine: 'ephemeralForTest'`.
**Warning signs:** `Model.watch()` non riceve mai eventi pur con update andati a buon fine.

### Pitfall 2: Open handle Jest / il processo non termina
**What goes wrong:** Jest segnala "A worker process has failed to exit gracefully" o resta appeso.
**Why it happens:** replSet non fermato, connessione Mongoose non chiusa, app Nest non chiusa, coda Bull/ioredis con connessioni aperte.
**How to avoid:** `afterAll`/`globalTeardown` con `await app.close()`, `await mongoose.disconnect()`, `await replSet.stop()`, `await queue.close()`. Usa `--detectOpenHandles` per diagnosticare; evita `--forceExit` come soluzione.
**Warning signs:** Test verdi ma processo che non ritorna il prompt; CI in timeout.

### Pitfall 3: CI lenta/flaky per download del binario MongoDB
**What goes wrong:** Ogni run scarica ~100MB di binario MongoDB (e Redis se si usa memory-server) → lentezza e timeout intermittenti.
**Why it happens:** Nessuna cache.
**How to avoid:** `actions/cache` sul path binari (`~/.cache/mongodb-memory-server` o `node_modules/.cache/mongodb-memory-server/mongodb-binaries`); **pinnare la versione** con `MONGOMS_VERSION` per rendere la chiave cache stabile e deterministica. In alternativa `MONGOMS_SYSTEM_BINARY` se un mongod è già presente sul runner. [CITED: mongodb-memory-server README]
**Warning signs:** Job CI che varia molto in durata; fallimenti sporadici in fase di setup.

### Pitfall 4: `ioredis-mock` sembra funzionare ma il processor non processa
**What goes wrong:** Con `ioredis-mock` la coda accetta `add` ma il job non viene mai processato / si comporta in modo incoerente.
**Why it happens:** Bull richiede funzionalità Redis (script Lua, blocking pop) non implementate fedelmente dal mock.
**How to avoid:** Redis reale per qualsiasi test che processa job (locked decision). Mock solo al confine DI negli unit, dove NON si processa nulla.
**Warning signs:** Job che restano pending; asserzioni sul processor che non scattano mai.

### Pitfall 5: Fixture Character non valide (virtual + campi required)
**What goes wrong:** Un Character costruito "minimale" fallisce la persistenza o dà `maxActiveSpells: 0` inatteso.
**Why it happens (verificato nel codice):**
- `CharacterStatus.maxActiveSpells` è un **virtual computato da `xp`** (`character-status.model.ts:56-64`): `xp < 20000 → 0`, `< 25000 → 1`, ... Per testare `equipSpell` con slot disponibili la fixture deve avere `xp >= 20000`.
- `CharacterStatus.location` è **required** (`@Prop({ ..., required: true })`, `character-status.model.ts:22`) e riferisce un POI (ObjectId) → la fixture Character deve fornire un `location` valido (spesso serve `persistPoi` prima).
- `ActiveSpell.spell` è un `Types.ObjectId` ref a Spell (`active-spell.model.ts:11`) → coerenza tra l'ObjectId nella fixture e la Spell persistita.
- `idTransformPlugin` è applicato **globalmente** (`app.module.ts:81`) e trasforma `_id → id` in output JSON → attenzione nelle asserzioni (usa `id`, non `_id`, sugli oggetti serializzati; ma i ref restano `_id`/ObjectId a livello documento).
**How to avoid:** `buildCharacter` con default `xp: 20000+` quando servono slot; `persistCharacter` che accetta/crea un `location` POI; documentare questi default nel file fixture.
**Warning signs:** `equipSpell` che lancia "reached maximum number of active spells" con 0 spell attive; ValidationError su `location` mancante.

### Pitfall 6: Rimozione `PUB_SUB` duplicato rompe silenziosamente le subscription
**What goes wrong:** Il WIP rimuove il provider `PUB_SUB` (`new PubSub()` da `graphql-subscriptions`) da `mongo.module.ts`, lasciando come unica fonte `PubSubModule` (`createPubSub` da `@graphql-yoga/subscription`).
**Why it matters:** Il service tipizza il PubSub come `graphql-subscriptions.PubSub` mentre a runtime riceve l'istanza yoga — funziona perché è lo stesso token `'PUB_SUB'`, ma un secondo provider duplicato creava ambiguità. Dopo la rimozione va verificato che `characterUpdated` continui a emettere.
**How to avoid:** Smoke/integration test che apre il change stream, aggiorna un Character e verifica l'emissione su `PUB_SUB` (D-09 lo richiede esplicitamente).
**Warning signs:** Subscription che non ricevono più aggiornamenti dopo il consolidamento.

## Code Examples

### Fixture two-tier (BE-TEST-03) — pattern per Spell
```typescript
// test/fixtures/spell.fixture.ts
// Two-tier: build (plain) + persist (DB). Default minimi validi e deterministici (D-04).
import { Model, Types } from 'mongoose';
import { Spell } from 'src/models/spell.model';
import { UseType } from 'src/models/enums/use-type.enum';

export function buildSpell(overrides: Partial<Spell> = {}): Spell {
    return {
        id: new Types.ObjectId().toString(),
        name: 'Test Spell',
        description: 'A deterministic test spell',
        useType: UseType /* valore fisso valido dell'enum */,
        energyDamage: { /* campi minimi dello schema EnergyDamage */ } as any,
        requiredLearnTime: 0,
        minXpToLearn: 0,
        recoveryTime: 1000,
        maxUsages: 3,
        ...overrides,
    } as Spell;
}

export async function persistSpell(
    model: Model<any>,
    overrides: Partial<Spell> = {},
): Promise<any> {
    return model.create(buildSpell(overrides));
}
```
> Nota: `build*` riusato da `persist*` (D-03). Il valore esatto di `useType`/`energyDamage` va allineato agli enum/schema reali in fase di implementazione (`use-type.enum.ts`, `common/energy-damage`).

### Fix ordine validazione `useSpell` (BE-TEST-04, D-06)
```typescript
// PRIMA (bug, characters.service.ts:293-303): decremento → save → poi cerca la spell
activeSpell.usages -= 1;
await character.save();                                   // ← usage perso se la spell non esiste
const spell = await this.spellModel.findById(request.spellId).exec();
if (!spell) throw new NotFoundException(`Spell ${request.spellId} not found`);

// DOPO (fix): verifica esistenza spell PRIMA di mutare/salvare
const spell = await this.spellModel.findById(request.spellId).exec();
if (!spell) throw new NotFoundException(`Spell ${request.spellId} not found`);
activeSpell.usages -= 1;
await character.save();
// ...poi schedula il recovery con delay = spell.recoveryTime (comportamento as-is, D-05)
```
**Test RED (prova il vecchio ordine):** Character con spell attiva (`usages: 3`) ma spell **non presente** in collection Spell → chiama `useSpell` → attesa `NotFoundException` E `usages` invariato (3). Oggi fallisce perché `usages` diventa 2 e viene salvato. GREEN dopo il riordino.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ephemeralForTest` storage engine (no change stream) | `wiredTiger` di default | MongoDB 7.0 / mongodb-memory-server serie recenti | Change stream + transazioni funzionano senza override [CITED: mongodb-memory-server README] |
| `installSubscriptionHandlers: true` + `graphql-ws` | Apollo v4/Yoga PubSub (`createPubSub`) | @nestjs/apollo 13 (già in uso) | PubSub yoga già in `pubsub.module.ts`; il duplicato `graphql-subscriptions.PubSub` in `mongo.module.ts` è legacy e viene rimosso dal WIP |

**Deprecated/outdated:**
- `ioredis-mock` per testare Bull: pratica sconsigliata dalla community e vietata dalla locked decision.
- `console.log` in `roads.service.ts`: sostituito con `Logger` NestJS (già nel WIP, collaterale D-09).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Il binario MongoDB scaricato di default da mongodb-memory-server 11.2.0 è serie 8.x/wiredTiger, quindi change stream + transazioni out-of-the-box senza pin | Standard Stack / Pitfall 1 | Basso — se il default fosse < 7.0 basta pinnare `MONGOMS_VERSION` a un ≥ 7.0; il fix è banale ma va verificato al primo run |
| A2 | GitHub Actions service container `redis:7` è la via CI raccomandata per i processor test (vs `redis-memory-server`) | Architecture Pattern 3 | Basso — entrambe viable; è discrezione Claude (D). Se il runner non supporta i service container si ripiega su redis-memory-server |
| A3 | Una singola istanza `MongoMemoryReplSet` condivisa via globalSetup + cleanup collection è la topologia ottimale (vs per-file) | Architecture Pattern 1 | Medio — se emergono leak di stato tra test si passa a per-file (più lento ma isolato); decisione confermabile solo a implementazione |
| A4 | `job.finished()`/`QueueEvents.completed` è disponibile e affidabile con Bull 4.16 per attendere il job nei test | Don't Hand-Roll / Pattern 3 | Basso — API stabile di Bull; in caso di dubbio, polling con timeout sul documento Character |
| A5 | La rimozione del provider `PUB_SUB` duplicato non rompe le subscription a runtime (stesso token, istanza yoga già primaria) | Pitfall 6 / D-09 | Medio — mitigato dal fatto che D-09 richiede esplicitamente un test/smoke di verifica; il rischio è coperto dal criterio stesso |

**Nota:** A1 e A3 sono i due assunti da chiudere per primi in planning/implementazione (primo run del replSet).

## Open Questions (RESOLVED)

1. **Versione MongoDB da pinnare in CI**
   - What we know: il default è serie 8.x/wiredTiger; il caching richiede una versione stabile per una chiave cache deterministica.
   - What's unclear: se pinnare esplicitamente (es. `MONGOMS_VERSION=8.0.x`) o lasciare il default.
   - Recommendation: pinnare esplicitamente in CI per determinismo e stabilità della cache; lasciare libero in locale.
   - **RESOLVED:** pinnata `MONGOMS_VERSION=8.0.4` nel workflow CI (Plan 01-04 Task 1), lasciata libera in locale.

2. **Meccanismo Redis effimero in CI vs locale**
   - What we know: service container `redis:7` (CI) e `redis-memory-server` (locale) sono entrambi validi; `ioredis-mock` è escluso.
   - What's unclear: se standardizzare su un solo meccanismo per parità dev/CI.
   - Recommendation: service container in CI (fedeltà prod, zero download) + `redis-memory-server` opzionale in locale per chi non ha Docker; astrarre host/port dietro env così il test è agnostico.
   - **RESOLVED:** helper `test/setup/redis.ts` (Plan 01-01 Task 4) astrae host/port dietro env — service container `redis:7` in CI (Plan 01-04), `redis-memory-server` in locale.

3. **Topologia replSet: globalSetup condiviso vs per-file**
   - What we know: condiviso è più veloce, per-file più isolato.
   - What's unclear: se il cleanup per-collection è sufficiente per tutti i test change-stream.
   - Recommendation: partire condiviso + cleanup; passare a per-file solo se emergono leak di stato.
   - **RESOLVED:** replSet condiviso via `globalSetup` + cleanup collection in `after-env.ts` (Plan 01-01 Task 2/4); rivalutare per-file solo se emergono leak.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime test | ✓ | v22.12.0 | — |
| mongodb-memory-server | BE-TEST-01 (replSet) | ✗ (da installare) | 11.2.0 target | — (nessuno; è il core dell'harness) |
| Binario MongoDB (scaricato da memory-server) | replSet a runtime | ✗ (scaricato al primo run) | serie 8.x default | `MONGOMS_SYSTEM_BINARY` se mongod presente |
| Redis (CI) | BE-TEST-02 processor test | ✗ (service container) | redis:7 | `redis-memory-server` 0.17.0 |
| redis-memory-server (locale) | processor test senza Docker | ✗ (da installare) | 0.17.0 | Redis locale se presente |
| Docker (per service container CI) | Redis in GitHub Actions | ✓ su runner GitHub-hosted | — | `redis-memory-server` |
| jest / ts-jest / @nestjs/testing / supertest | tutta la suite | ✓ | 30.0.0 / 29.2.5 / 11.0.1 / 7.0.0 | — |

**Missing dependencies with no fallback:**
- `mongodb-memory-server` — è il cuore di BE-TEST-01, va installato. Il binario MongoDB verrà scaricato al primo run (cache in CI obbligatoria per performance).

**Missing dependencies with fallback:**
- Redis effimero: service container CI ↔ `redis-memory-server` locale sono intercambiabili dietro env host/port.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.0.0 + ts-jest 29.2.5 + @nestjs/testing 11.0.1 |
| Config file | Inline in `package.json` (unit) + `test/jest-e2e.json` (e2e); **da aggiungere** config integration (Jest `projects` o `test/jest-integration.json`) — Wave 0 |
| Quick run command | `npm test -- <file.spec.ts>` |
| Full suite command | `npm test` (unit) + comando integration dedicato + `npm run test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-TEST-01 | replSet avvia; transazione Mongo e change stream su Character passano | integration | `npm test -- --selectProjects integration` (o config dedicata) | ❌ Wave 0 |
| BE-TEST-02 (unit) | service risolto con coda Bull mockata (`getQueueToken`), nessun Redis | unit | `npm test -- characters.service.spec.ts` | ❌ Wave 0 |
| BE-TEST-02 (integration) | processor `spell-recovery` gira contro Redis reale effimero | integration | `npm test -- spell-recovery.processor.spec.ts` (con Redis up) | ❌ Wave 0 |
| BE-TEST-03 | fixture/factory valide per User/Character/Quest/Spell/Road/POI riusate in ≥2 spec | unit + integration | usate dalle spec sopra | ❌ Wave 0 |
| BE-TEST-04 (fix) | `useSpell` verifica la spell prima di decrementare (RED→GREEN) | unit | `npm test -- characters.service.spec.ts -t "useSpell"` | ❌ Wave 0 |
| BE-TEST-04 (processor) | `handleSpellRecovery` incrementa `usages` sul Character | integration | `npm test -- spell-recovery.processor.spec.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- <spec del task>` (unit, < 30s) + lint (`npm run lint`).
- **Per wave merge:** suite unit completa + integration (replSet + Redis).
- **Phase gate:** lint + unit + integration + e2e verdi prima di `/gsd-verify-work`; pipeline GitHub Actions verde (D-10/D-11).

### Wave 0 Gaps
- [ ] `test/setup/mongo-replset.ts` + `test/setup/global-setup.ts` + `test/setup/global-teardown.ts` — replSet condiviso (BE-TEST-01)
- [ ] Config Jest integration (Jest `projects` in package.json **oppure** `test/jest-integration.json`) — split unit/integration
- [ ] `test/setup/redis.ts` — helper Redis effimero (service container env / redis-memory-server) (BE-TEST-02)
- [ ] `test/fixtures/{user,character,quest,spell,road,poi}.fixture.ts` — factory two-tier (BE-TEST-03)
- [ ] `src/characters/characters.service.spec.ts` — unit `useSpell`/`equipSpell`/`unequipSpell` con mock (BE-TEST-02, BE-TEST-04)
- [ ] `src/characters/spell-recovery.processor.spec.ts` — integration processor (BE-TEST-02, BE-TEST-04)
- [ ] Test change stream → PubSub `characterUpdated` su replSet (BE-TEST-01 + verifica D-09 rimozione PUB_SUB duplicato)
- [ ] Install: `npm install --save-dev mongodb-memory-server@11 redis-memory-server@0`
- [ ] `.github/workflows/ci.yml` — lint + unit + integration, Redis service container, cache binari MongoDB, trigger su ogni push (D-10/D-11/D-12)

## Security Domain

Fase di sola infrastruttura di test + consolidamento WIP interno; nessun endpoint/superficie nuova esposta. Le categorie ASVS applicabili sono minime e rientrano nelle direttive CLAUDE.md già coperte.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Auth è Phase 2 (fuori boundary) |
| V3 Session Management | no | — |
| V4 Access Control | no | Ownership/role è Phase 3 |
| V5 Input Validation | no (in questa fase) | class-validator è Phase 10 (BE-HARD-01) |
| V6 Cryptography | no | — |
| V14 Config & Secrets | sì | Nessun secret nei test/CI: env effimeri iniettati a runtime; `.env` fuori VCS (CLAUDE.md). I workflow non devono loggare/committare credenziali |

### Known Threat Patterns for {test infra + CI}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret hardcoded nei file di test o nel workflow CI | Information Disclosure | Env effimeri a runtime; nessuna credenziale reale nei test (usano replSet/Redis effimeri locali) |
| `.env` committato per errore | Information Disclosure | `.env` in `.gitignore` (già), audit grep è Phase 10 (BE-HARD-03) |

## Sources

### Primary (HIGH confidence)
- Codebase letta direttamente: `characters.service.ts`, `spell-recovery.processor.ts`, `app.module.ts`, `characters.module.ts`, `mongo.module.ts`, `pubsub.module.ts`, `characters.resolver.ts`, modelli (`spell`, `character`, `character-status`, `character-assets`, `active-spell`, `user`, `road`, `point-of-interest`), `use-spell-request.model.ts`, `package.json`, git diff HEAD — verifica diretta del WIP e degli schemi
- npm registry: `mongodb-memory-server@11.2.0`, `redis-memory-server@0.17.0`, `ioredis-mock@8.13.1`, `testcontainers@12.0.4` [VERIFIED: npm view]
- github.com/typegoose/mongodb-memory-server README — MongoMemoryReplSet config, wiredTiger default Mongo 7.0+, binary caching env vars [CITED]

### Secondary (MEDIUM confidence)
- docs.nestjs.com/techniques/queues — Bull testing, getQueueToken [CITED]
- yflooi.medium.com — NestJS Bull unit vs integration testing in CI [CITED]
- oneuptime.com blog — testing MongoDB change stream handlers (storage engine caveat) [CITED]

### Tertiary (LOW confidence)
- Discussioni GitHub su open-handle Jest con MongoMemoryReplSet (issue #213) — pattern di teardown [needs validation al primo run]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versioni verificate su npm, Node compat verificata localmente
- Architecture (replSet + Bull DI-mock + fixtures): HIGH — config replSet e getQueueToken confermate da docs ufficiali; topologia condivisa vs per-file è discrezione (A3)
- Pitfalls: HIGH — pitfall #5/#6 derivano da lettura diretta del codice (virtual maxActiveSpells, location required, rimozione PUB_SUB); #1/#3 da docs ufficiali
- WIP consolidation / fix useSpell: HIGH — bug letto riga per riga (`characters.service.ts:297-303`)

**Research date:** 2026-07-16
**Valid until:** 2026-08-15 (stack stabile; rivalutare se si aggiorna MongoDB target o Bull → BullMQ)
