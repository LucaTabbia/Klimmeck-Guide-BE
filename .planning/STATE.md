---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Cura e modelli
status: completed
stopped_at: "Phase 21 completa (14/14, UAT su device passata il 2026-11-13) e quick 261113-aql in develop — prossima: Phase 22 da pianificare con la FE Phase 21"
last_updated: "2026-11-12T23:01:28.000Z"
last_activity: 2026-11-13 -- Phase 21 completa (PR #36), quick 261113-aql in develop (PR #37), UAT su device passata
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 59
  completed_plans: 45
  percent: 76
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-10 all'apertura della v1.1)

**Core value:** Il backend è la fonte di verità affidabile e sicura dello stato di gioco: nessun client può alterare uno stato che non gli appartiene, e ogni valore mostrato dal frontend è calcolato e garantito server-side.
**Current focus:** Phase 21 — Premi per rango e soccorsi (↔ FE Phase 20) — COMPLETA il 13 novembre 2026: in `develop` (PR #36) con il quick 261113-aql (PR #37); UAT su device passata (`21-HUMAN-UAT.md`). Prossima: Phase 22 Completamento guidato delle missioni (↔ FE Phase 21), contesto sul ramo `feat/22-…` da riallineare

## Current Position

Milestone: **v1.1 Cura e modelli** — aperta il 2026-11-10 (Phases 18–22; precedente: v1.0 Core Loop (BE), consegnata il 2026-11-10, tag `v1.0`); Phases 18–20 in `develop`
Phase: 21 di 22 (Premi per rango e soccorsi) — contesto del 2026-11-12 (D-01..D-17) emendato il 2026-11-13 dopo la ricerca e le risposte dell'utente (D-18..D-30), `21-REPO-RULES.md`, `21-RESEARCH.md`, `21-VALIDATION.md`, 14 piani scritti il 2026-11-13
Plan: 14 of 14
Status: Phase 21 complete — 14/14, review, verifica, audit, riavvio reale e UAT su device chiusi; quick 261113-aql (blocco della quest d'origine, nemici e durata dell'aid di dungeon, report dell'ordine delle dungeon) in `develop`
Last activity: 2026-11-13 -- Phase 21 completa (PR #36), quick 261113-aql in develop (PR #37), UAT su device passata
Next step: pianificare la Phase 22 (contesto sul ramo `feat/22-completamento-guidato-missioni`, da riallineare a `develop`) con la FE Phase 21. Aperto per l'utente: `Quest.rankPrizes` è leggibile da ogni utente autenticato (decidere con la fase dell'oste). Il BE locale gira da `dist/` di `develop` sulla porta 3001.

## Current Milestone

v1.1 Cura e modelli: Phase 18 Quest heal per taglia (BE-HEAL-01..09, ↔ FE 18) → Phase 19 Revisione dei modelli (BE-MODEL-01..12, ↔ FE 19) → Phase 20 Cibo e vita progressivi in viaggio (BE-FOODP-01..05, solo BE). Milestone FE gemella v1.1 «Healing & Models» (FE Phases 18–19). Ricerca di dominio saltata all'apertura (fasi già discusse); la ricerca per fase resta nel plan-phase.

## Accumulated Context

- Stack: NestJS 11 + Mongoose 8 + Apollo code-first (HTTP + `graphql-ws`) + Bull/ioredis + firebase-admin 14; Jest con `mongodb-memory-server` (replica set) e Redis effimero; CI GitHub Actions (lint, unit, integration, build + diff schema, secret scan).
- Il mondo vive solo nel DB (D-36): semina idempotente al boot, cura a DB, nessun seeder/migratore nel repo dopo il boot reale (resta il report nell'handoff).
- Il processo dell'utente gira da `dist/` su `develop` (porta 3001): `npm run build` è vietato mentre gira; riavvio dall'orchestratore con build prima del TaskStop.
- `test:cov` ≈ 630 s: solo in background; `npm run lint` e il filtro jest hanno trappole note (memoria dell'orchestratore).
- Handoff FE in `.planning/phases/NN-<slug>/BACKEND-NOTES.md` dei due repo; le regole di gioco dette dall'utente diventano D-NN.

### Roadmap Evolution

- v1.0: 10 fasi dalla roadmap del 2026-07-16, inserite 2.1 (2026-10-09), 3.1 (2026-10-15), 9.1 e 9.2 (2026-10-27), estensione con le Phase 11–16 (2026-10-29), inserita 13.1 (2026-11-05), Phase 17 aggiunta il 2026-11-09 come companion della FE Phase 12 Hardening. Dettagli in `milestones/v1.0-ROADMAP.md`.
- 2026-11-10: milestone archiviata; `REQUIREMENTS.md` rimosso (lo ricrea `/gsd-new-milestone`).
- 2026-11-10: milestone v1.1 Cura e modelli aperta con le Phase 18–20 (scope confermato dall'utente: solo le fasi discusse il 2026-11-09); `REQUIREMENTS.md` ricreato con BE-HEAL-01..09, BE-MODEL-01..09 e BE-FOODP-01..05.
- 2026-11-12: aggiunta la Phase 21 Premi per rango e soccorsi (BE-RANKP-01..06), gemella della FE Phase 20, dal discuss della FE; 3 aid concluse a mano nelle UAT cancellate a DB su ordine dell'utente (backup EJSON nello scratchpad della sessione).
- 2026-11-12: aggiunta la Phase 22 Completamento guidato delle missioni (BE-GMFLOW-01..07), gemella della FE Phase 21, dal discuss della FE; ramo impilato sulla 21.

### Decisions

Il log completo è nella tabella Key Decisions di `PROJECT.md`; le decisioni per piano delle fasi v1.0 sono nei `NN-CONTEXT.md` e nei SUMMARY delle fasi.

## Open Questions / Blockers

- **Durata dei viaggi** (UAT della Phase 20, 2026-11-13): lo `speedFactor` della strada vale come km/h del terreno (valori a DB da 3 a 7), non come moltiplicatore dei 10 km/h di base; l'utente se lo aspettava diverso e ha deciso «Per adesso teniamo com'è». Se cambia: riscalare gli `speedFactor` a DB, nessun cambio di codice.

- **Promemoria operativi di produzione (Phase 10):** conferma della tabella di policy Sightengine e dei default del throttler (`BACKEND-NOTES.md` §11 della Phase 10), una chiamata Sightengine reale, `THROTTLE_TRUST_PROXY` quando la topologia sarà nota; topologia Mongo (replica set) e policy Redis (eviction dei delayed job).
- **EventSub:** E2E managed con tunnel HTTPS e verifica C4 prima della produzione (Phase 6).
- **«Esci da tutti i dispositivi»** (mutation che revoca ogni sessione) — backlog dalla Phase 2, non necessaria finché «l'ultimo login caccia l'altro».
- **Branch locali già mergiati** (23 `feat/*`, `fix/*`, `docs/*`) lasciati in place: cancellabili con `git branch -d`.
- **Int-spec instabile «real Redis»** (Phase 19): `src/quests/outcomes/quest-resolution.processor.int-spec.ts` è fallita per intero una volta su una corsa completa di `src/quests` e mai più; usa il Redis locale vero, lo stesso del processo dell'utente (possibile contesa sui job).
- **`pointsOfInterest { city { id } }` a profondità 2 non è popolato** (Phase 19, fuori dal ruling C-WR-06): la FE non lo seleziona; vale una regola o resta così?
- **Sorteggio della lore di studio** (Phase 19): può cadere sulla lore di un pet vinto nello stesso esito (nessun doppione in lista, ma il tiro è «speso»); vale una regola?
- **Redis locale non raggiungibile ai due boot reali dell'11 novembre 2026** (`ECONNREFUSED`, preesistente): gli scheduler hanno loggato il ripiego («lo sweep copre»).

### Quick Tasks Completed (v1.0)

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261022-f0n | worldMission accettabile solo dalla sua città (D-26 emendata: solo la story da qualunque città; correzione utente) | 2026-10-22 | bc7b7f7 | [261022-f0n-worldmission-accettabile-solo-dalla-sua-](./quick/261022-f0n-worldmission-accettabile-solo-dalla-sua-/) |
| 261022-rhs | travel scheduler: Bull queue calls bounded by a 2 s timeout, Redis error logged once (UAT 2026-10-22: acceptQuest hung with Redis down) | 2026-10-22 | 2c77334 | [261022-rhs-travel-scheduler-bound-the-bull-queue-ca](./quick/261022-rhs-travel-scheduler-bound-the-bull-queue-ca/) |
| 261105-hea | `heal` come nono `UseType` delle magie (regola dell'utente, revisione dei mostri 2026-11-05); nessuna modifica SDL; cura a DB delle magie di cura dopo la merge e la FE gemella | 2026-11-05 | 34adf5f | [261105-hea-spell-heal-use-type](./quick/261105-hea-spell-heal-use-type/) |
| 261109-inj | `LootItem.canHeal: InjuryType[]` (campo già a DB, riusato su correzione dell'utente; `[InjuryType!]!` sullo schema, confermato al boot reale); solo il campo, meccanica di cura nella Phase 18; gemello FE | 2026-11-09 | branch `fix/…` gemello | [261109-inj-loot-effected-injuries](./quick/261109-inj-loot-effected-injuries/) |
| 261109-inj2 | nove `InjuryType` nuovi (37) con effetti provvisori a DB; gemello FE | 2026-11-09 | branch gemello | [261109-inj2-new-injury-types](./quick/261109-inj2-new-injury-types/) |
| 261109-cap | `ferrionCity` e `necrorianCity` a `CitySize.capital` (regola dell'utente nella UAT FE 12); nessun cambio SDL, Necrorian resta senza negozio, pool a DB non rigenerati | 2026-11-09 | PR #28 | [261109-cap-city-size-capitals](./quick/261109-cap-city-size-capitals/) |
| 261110-mag | tipo di quest `magic` (si comporta come `study`, ripetibile, rango minimo come dato della quest); SDL invariato; sul ramo della Phase 18 (PR #31) | 2026-11-10 | 63847cb4 | [261110-mag-quest-magic-type](./quick/261110-mag-quest-magic-type/) |
| 261110-cgd | arresto nelle `crime` (20 % alla conclusione, 10 ore di prigione, 25 % delle monete, `CharacterStatus.imprisonedUntil`, `CHARACTER_IMPRISONED`) e scontro nelle `guard` (20 %, nemico o branco city/all in fascia, monete doppie e xp dei nemici in vittoria, vita a 1 senza soccorso in sconfitta); ranghi a DB dopo la merge; sul ramo della Phase 18 (PR #31) | 2026-11-10 | 6c4e28f4 | [261110-cgd-crime-arrest-guard-encounter](./quick/261110-cgd-crime-arrest-guard-encounter/) |
| 261110-prp | push `prisonRelease` alla scadenza della prigione (sweep, un push per arresto, `imprisonedUntil` torna `null`); sul ramo della Phase 18 (PR #31) | 2026-11-10 | e50dba8c | [261110-prp-prison-release-push](./quick/261110-prp-prison-release-push/) |
| 261111-sdc | magia delle quest `magic` (`prizes.spellDraw`) con probabilità 30 % (`SPELL_DRAW_CHANCE`, gate tirato prima della scelta, solo col booleano); magia fissa senza gate; SDL invariato; ramo `feat/quick-spell-draw-chance` | 2026-11-11 | 5134cc5b | [261111-sdc-spell-draw-chance](./quick/261111-sdc-spell-draw-chance/) |
| 261111-enm | quest `enemy` prese da un solo giocatore di rango ≥ `minTitle`, senza posto a titolo (`questSlotsOf` in `quest-capacity.ts`: un posto senza titolo qualunque posto porti a DB; generatore con `{ title: null, count: 1 }`; aid di una `enemy` senza posto a titolo); `boss` invariati; supera D-09 della Phase 13 per le sole `enemy`; SDL invariato; a DB dopo la merge: `title` a `null` sul posto delle `enemy` aperte; ramo `fix/enemy-quests-single-player` | 2026-11-11 | d3daf25d | [261111-enm-enemy-quests-single-player](./quick/261111-enm-enemy-quests-single-player/) |
| 261113-aql | hunt e dungeon con un'aid aperta nata da loro (`rescue.failedQuest`) strappate per tutti finché l'aid si chiude (regola dell'utente 2026-11-13, supera D-15 della Phase 21): stato derivato dalle aid aperte, nessun campo a DB; `acceptQuest` → `QUEST_NOT_ACCEPTABLE` letto in sessione; SDL additivo `Quest.awaitingRescue: Boolean!` (uguale per tutti, una lettura per richiesta); `questUpdated` della quest d'origine alla nascita e alla chiusura dell'aid dal change stream; ramo `feat/quick-aid-locks-source-quest` | 2026-11-13 | 6ab6eef8 | [261113-aql-aid-locks-source-quest](./quick/261113-aql-aid-locks-source-quest/) |

## Session Continuity

Last session: 2026-11-11 — esecuzione e chiusura della Phase 19 (23 piani, boot reale, contenuto, rimozione del modulo una tantum)
Stopped at: Phase 19 completa (23/23, 2026-11-11) — PR #33 da togliere dal draft e mergiare su `develop`; poi Phase 20 (solo BE) e piani gated della FE Phase 19
Resume file: .planning/phases/19-revisione-dei-modelli/BACKEND-NOTES.md
