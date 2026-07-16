# Phase 1: Fondazione Test & Consolidamento Spell WIP - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-16
**Phase:** 1-fondazione-test-consolidamento-spell-wip
**Areas discussed:** Design fixture/factory, Perimetro fix spell WIP, CI-readiness

---

## Design fixture/factory

| Option | Description | Selected |
|--------|-------------|----------|
| Funzioni pure | createXFixture(overrides?) — zero dipendenze, pattern già suggerito in TESTING.md | ✓ |
| Libreria fishery | Factory tipizzate con sequence/traits, dipendenza in più | |
| Classi builder | Fluent API, verboso | |

| Option | Description | Selected |
|--------|-------------|----------|
| test/fixtures/ | Fuori da src/, raggiungibile da unit e e2e, esclusa dal build | ✓ |
| src/testing/ | Dentro src/, da escludere da tsconfig.build e coverage | |
| Co-locate per dominio | __fixtures__/ sparsi per modulo | |

| Option | Description | Selected |
|--------|-------------|----------|
| Entrambi, due livelli | buildX plain object (unit) + persistX su DB (integration), il secondo riusa il primo | ✓ |
| Solo plain object | Persist a mano nei test di integrazione | |
| Solo persistiti | Sempre su DB, inutilizzabile negli unit puri | |

| Option | Description | Selected |
|--------|-------------|----------|
| Minimi validi | Campi richiesti dallo schema, valori fissi deterministici | ✓ |
| Realistici con faker | Dati generati con seed, dipendenza in più | |
| Snapshot dal DB reale | Fixture JSON estratte e sanitizzate, fragili | |

**User's choice:** tutte le opzioni raccomandate.

---

## Perimetro fix spell WIP

| Option | Description | Selected |
|--------|-------------|----------|
| Deferire a Phase 4 | Cap recovery è scope esplicito BE-ATOM-05 | ✓ |
| Guard semplice qui | Mitigazione temporanea non atomica, codice da riscrivere | |

| Option | Description | Selected |
|--------|-------------|----------|
| Un job per uso (parallelo) | Comportamento attuale del WIP | |
| Un solo job cumulativo | Semantica diversa, rework immediato | |
| **Other (free text)** | Recovery sequenziale: un utilizzo alla volta, il successivo parte al completamento del precedente | ✓ |

**User's choice (free text):** "Ogni job recupera un utilizzo. Finito il primo, parte il secondo e così via fino a recupero totale." Chiarimento successivo: la semantica sequenziale è il design definitivo ma **andrà rivista nella fase dei combattimenti** — la catena di recovery partirà alla fine del combattimento, quando il combat result rivela il totale di utilizzi spesi.

Follow-up: cosa consolidare in Fase 1 sapendo del rework in Phase 9?

| Option | Description | Selected |
|--------|-------------|----------|
| WIP as-is, rework in Phase 9 | Scheduling per-uso attuale + fix ordine validazione; sequenziale+combat-trigger progettati una volta sola in Phase 9 | ✓ |
| Sequenziale già ora | Catena subito, rischio doppio rework | |

| Option | Description | Selected |
|--------|-------------|----------|
| Commit separati per concern | chore infra → feat spell+test → fix ordine validazione → refactor collaterali | ✓ |
| Singolo commit feat | Storia opaca, revert tutto-o-niente | |

| Option | Description | Selected |
|--------|-------------|----------|
| Sì, commit dedicati | Boy Scout Rule; PUB_SUB removal verificata con smoke test subscription | ✓ |
| Scartarle (stash) | Fase chirurgica solo-spell | |

---

## CI-readiness

| Option | Description | Selected |
|--------|-------------|----------|
| Pipeline GitHub Actions ora | Workflow lint+test, gate dalla Fase 1 | ✓ |
| Solo compatibilità | Pipeline rimandata (es. Phase 10) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Suite completa | Lint + unit + integration (replica set con binary caching + Redis effimero) | ✓ |
| Solo lint + unit | Più stabile ma rimanda il rischio flakiness | |

| Option | Description | Selected |
|--------|-------------|----------|
| PR verso develop/main | Gate sulle PR, minuti contenuti | |
| Ogni push su ogni branch | Feedback continuo anche sui branch di fase | ✓ |

---

## Claude's Discretion

- Topologia MongoMemoryReplSet (globalSetup condiviso vs per-file), split unit/integration (Jest projects vs config unica), meccanismo di avvio Redis effimero
- Struttura interna di test/fixtures/ e naming delle factory
- Dettagli del workflow GitHub Actions (Node version, caching)

Nota: l'area "Architettura harness test" era proposta ma non selezionata dall'utente — resta a discrezione di research/planning entro le decisioni bloccate (replica set, no ioredis-mock, Bull DI-mock negli unit).

## Deferred Ideas

- Phase 9: recovery spell sequenziale combat-driven (catena al combat result, totale usi noto)
- Phase 4: atomicità useSpell + cap/idempotenza recovery (BE-ATOM-05)
