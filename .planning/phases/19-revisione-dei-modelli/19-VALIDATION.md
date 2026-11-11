---
phase: 19
slug: revisione-dei-modelli
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-11
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest (progetti `unit` e `integration`, `package.json`), `MongoMemoryReplSet` condiviso (`test/setup/`), harness `createAuthTestApp` / `createCharactersTestApp` / `createOutcomeHarness`, `FixedClock`, `test/harness/prime-change-stream.ts`, boot reale `test/app.int-spec.ts`; fixture nella forma vecchia solo col driver nativo (`src/migrations/model-review/legacy-fixtures.ts`) |
| **Config file** | `package.json` (sezione `jest`, `coverageThreshold` per cartella; a rischio: `./src/characters/spells/` 97/88/97, `./src/characters/characters.service.ts` 96/88/98, `./src/characters/equipment/` 98/98/98, `./src/economy/` 98/91/98, `./src/shops/` 97/82/98, `./src/travel/` 97/84/98, `./src/quests/generation/` 96/82/97) |
| **Quick run command** | `npx jest <spec toccate> --selectProjects unit` / `npx jest <spec toccate> --selectProjects integration --runInBand` (il comando `<automated>` del task) |
| **Full suite command** | nel piano di gate: `npx jest --selectProjects unit` + integration a blocchi per cartella senza coverage (`src/characters src/migrations`; `src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures`; `src/quests`; resto); `npm run test:cov` solo dall'orchestratore in background |
| **Estimated runtime** | unit ≈ 11 s; `tsc` ≈ 10,5 s; boot reale ≈ 7,5 s; integration `src/characters src/migrations` ≈ 120 s; blocco mondo ≈ 108 s; `src/quests` ≈ 150 s; `test:cov` ≈ 630 s (fuori dai 600 s dello strumento) |

---

## Sampling Rate

- **After every task commit:** il comando `<automated>` del task + `npx tsc --noEmit -p tsconfig.json` + `pgrep -fl 'bin/jest'` vuoto + controllo trailer `git log -1 --format=%B | grep -ciE "co-authored-by|generated with|claude-session"` = 0
- **After every plan wave:** `npx jest --selectProjects unit` (≈ 11 s) + `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` (≈ 8 s) + il blocco integration dell'area toccata + il grep del nome vecchio del piano (un piano = una wave, catena lineare)
- **Before `/gsd-verify-work`:** gate del piano 19-23 verde (unit completo, integration completa a blocchi, boot reale, `git diff --exit-code src/schema.gql`, SDL cambiato solo come dichiarato, nomi vecchi solo sotto `src/migrations/model-review/`, coverage per cartella)
- **Max feedback latency:** 150 s (blocco integration di `src/quests`); 10–30 s per le spec mirate

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | BE-MODEL-09 | T-19-01, T-19-02 | boot a passi mai bloccante, una riga di soli conteggi, errore con solo nome e codice | unit | `npx jest src/migrations/model-review --selectProjects unit` | ❌ W0 | ✅ green |
| 19-01-02 | 01 | 1 | BE-MODEL-09 | T-19-03, T-19-04 | modulo una tantum importato solo da `AppModule`, montato al boot reale, SDL invariato | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 19-01-03 | 01 | 1 | BE-MODEL-09 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-01-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 19-02-01 | 02 | 2 | BE-MODEL-01 | T-19-05, T-19-07, T-19-08 | `Enemy.weaknesses` su schema (enum validato, default che regge ai non migrati), lettori, SDL esatto, `WeaknessesInput` fuori dallo SDL | unit + integration | `npx jest src/models src/quests/generation src/quests/outcomes src/travel/ambush --selectProjects unit` + `npx jest test/app.int-spec.ts src/quests/generation --selectProjects integration --runInBand` | ❌ W0 | ✅ green |
| 19-02-02 | 02 | 2 | BE-MODEL-01 | T-19-05, T-19-06 | passo D-01: copia e rimozione, seconda corsa a zero, fuori enum contati | integration | `npx jest src/migrations/model-review test/app.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ✅ green |
| 19-02-03 | 02 | 2 | BE-MODEL-01 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-02-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 19-03-01 | 03 | 3 | BE-MODEL-02 | T-19-09 | `Enemy.spells` a riferimenti popolati nei tre punti del filo, orfani scartati, SDL identico | unit + integration | `npx jest src/models/enemy.schema.spec.ts --selectProjects unit` + `npx jest src/quests/quests.resolver.int-spec.ts src/quests/results/quest-result.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 19-03-02 | 03 | 3 | BE-MODEL-02 | T-19-10, T-19-11, T-19-12 | abbinamento per id, per nome univoco, ambiguo o assente lasciato fuori e nominato; seconda corsa a zero | unit + integration | `npx jest src/migrations/model-review --selectProjects unit` + `npx jest src/migrations/model-review --selectProjects integration --runInBand` | ❌ W0 | ✅ green |
| 19-03-03 | 03 | 3 | BE-MODEL-02 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-03-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 19-04-01 | 04 | 4 | BE-MODEL-03 | T-19-13, T-19-16 | `Pet.attack`/`defense` con default vuoti, nessuno stato a catalogo, blocco `type Pet` esatto | unit + integration | `npx jest src/models --selectProjects unit` + `npx jest test/app.int-spec.ts src/shops test/shops --selectProjects integration --runInBand` | ❌ W0 | ✅ green |
| 19-04-02 | 04 | 4 | BE-MODEL-03 | T-19-14, T-19-15 | passo del catalogo: danni → attacco, difesa vuota solo se assente, la mano vince, nessun contenuto | integration | `npx jest src/migrations/model-review test/app.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ✅ green |
| 19-04-03 | 04 | 4 | BE-MODEL-03 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-04-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 19-05-01 | 05 | 5 | BE-MODEL-03 | T-19-17, T-19-19, T-19-20 | `OwnedPet` su schema e SDL, populate con le voci orfane fuori dal filo | unit + integration | `npx jest src/models src/characters src/migrations/mixed-refs --selectProjects unit` + `npx jest src/characters/character-updated.subscription.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ✅ green |
| 19-05-02 | 05 | 5 | BE-MODEL-03 | T-19-18 | `equipPet` solo da una voce posseduta, stato della voce intatto | unit + integration | `npx jest --selectProjects unit` + `npx jest src/characters --selectProjects integration --runInBand` | ✅ | ✅ green |
| 19-05-03 | 05 | 5 | BE-MODEL-03 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-05-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 19-06-01 | 06 | 6 | BE-MODEL-03 | T-19-21, T-19-22, T-19-23 | acquisto e vendita su voci intere, «già posseduto» su `pet`, guardie nel filtro, vita dal catalogo sanificata | unit + integration | `npx jest src/economy src/characters/pets --selectProjects unit` + `npx jest src/economy test/shops --selectProjects integration --runInBand` | ❌ W0 | ✅ green |
| 19-06-02 | 06 | 6 | BE-MODEL-03 | T-19-24 | pet in premio come voce nella scrittura dell'esito | unit + integration | `npx jest src/quests/outcomes --selectProjects unit` + `npx jest src/quests/outcomes/quest-pet-prize.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 19-06-03 | 06 | 6 | BE-MODEL-03 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-06-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 19-07-01 | 07 | 7 | BE-MODEL-03, BE-MODEL-09 | T-19-25, T-19-26, T-19-27, T-19-28 | passo dei pet posseduti: ref → voce, orfano a vita 0 contato, archiviati compresi, seconda corsa a zero | unit + integration | `npx jest src/migrations/model-review --selectProjects unit` + `npx jest src/migrations/model-review test/app.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ✅ green |
| 19-07-02 | 07 | 7 | BE-MODEL-03 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-07-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 19-08-01 | 08 | 8 | BE-MODEL-04 | T-19-29, T-19-31 | `petXpAward` (10 %, arrotondamento, tetto, guadagno effettivo, tetto non valido) e `companionXpAward` (array intero) | unit | `npx jest src/quests/outcomes/pets --selectProjects unit` | ❌ W0 | ✅ green |
| 19-08-02 | 08 | 8 | BE-MODEL-04 | T-19-30, T-19-32 | tetti `maxXp` dell'intero catalogo nel catalogo del combattimento, validi soltanto | unit | `npx jest src/quests/outcomes src/travel/ambush --selectProjects unit` | ✅ | ✅ green |
| 19-08-03 | 08 | 8 | BE-MODEL-04 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-08-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 19-09-01 | 09 | 9 | BE-MODEL-04 | T-19-33, T-19-34, T-19-36, T-19-37 | premio del compagno in `planParticipant` solo su vittoria con nemici (anche soccorso vinto e scontro di guardia vinto, D-18), un solo valore di `ownedPets`, `petXpGained` su modello, draft e SDL | unit + integration | `npx jest src/models/quest-result src/quests/outcomes src/quests/results src/travel/ambush --selectProjects unit` + `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 19-09-02 | 09 | 9 | BE-MODEL-04 | T-19-34, T-19-35 | replica set: quest con compagno, party, GM, pet in premio nello stesso esito; filo e risultato vecchio a 0 | integration | `npx jest src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/outcomes/gm-completion.service.int-spec.ts src/quests/outcomes/quest-pet-prize.int-spec.ts src/quests/results/quest-result.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 19-09-03 | 09 | 9 | BE-MODEL-04 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-09-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 19-10-01 | 10 | 10 | BE-MODEL-04 | T-19-38, T-19-39, T-19-40, T-19-41 | imboscata vinta: premio nel piano, `petXpGained` sul report trattenuto e nel risultato, report vecchi a 0, `AmbushReport` invariato | unit | `npx jest src/travel src/models --selectProjects unit` | ✅ | ✅ green |
| 19-10-02 | 10 | 10 | BE-MODEL-04 | T-19-38, T-19-40 | replica set: imboscata vinta → report → risultato all'arrivo; sconfitta senza premio | integration | `npx jest src/travel/ambush/ambush-resolution.int-spec.ts src/travel/ambush/ambush-lifecycle.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 19-10-03 | 10 | 10 | BE-MODEL-04 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-10-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 19-11-01 | 11 | 11 | BE-MODEL-10 | T-19-45, T-19-48 | `Pet.relatedLore` additivo, filtrato per viewer (giocatore, oste, senza personaggio, orfani, id stringa), registro dei ref, SDL | unit + integration | `npx jest src/models src/migrations/mixed-refs --selectProjects unit` + `npx jest src/lore test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 19-11-02 | 11 | 11 | BE-MODEL-10 | T-19-46, T-19-47, T-19-49 | lore del pet unite a `unlockedLore` nella stessa scrittura dell'acquisto e del premio, nessun duplicato, la vendita non le toglie | unit + integration | `npx jest src/economy src/quests/outcomes --selectProjects unit` + `npx jest src/economy/trade/shop-transaction.service.int-spec.ts src/quests/outcomes/quest-pet-prize.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts test/shops --selectProjects integration --runInBand` | ✅ | ✅ green |
| 19-11-03 | 11 | 11 | BE-MODEL-10 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-11-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 19-12-01 | 12 | 12 | BE-MODEL-07 | T-19-42, T-19-44 | via `PointOfInterest.quest` da modello, populate, registro e SDL nello stesso commit; `cities` senza `StrictPopulateError` | unit + integration | `npx jest src/models src/migrations/mixed-refs --selectProjects unit` + `npx jest src/cities src/shops test/app.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 19-12-02 | 12 | 12 | BE-MODEL-07 | T-19-43 | passo D-09: campo rimosso, seconda corsa a zero | integration | `npx jest src/migrations/model-review test/app.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 19-12-03 | 12 | 12 | BE-MODEL-07 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-12-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 19-13-01 | 13 | 13 | BE-MODEL-07 | T-19-50, T-19-51, T-19-53 | `City.shop` solo Mongoose, assente ≠ vuota, lettori (negozio, report, acquisto), SDL identico | unit + integration | `npx jest src/models src/shops src/economy --selectProjects unit` + `npx jest src/shops src/economy src/cities test/shops test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 19-13-02 | 13 | 13 | BE-MODEL-07 | T-19-52 | passo D-10: rinomina dei tre campi, pool conservati tali e quali, seconda corsa a zero | integration | `npx jest src/migrations/model-review test/app.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 19-13-03 | 13 | 13 | BE-MODEL-07 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-13-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 19-14-01 | 14 | 14 | BE-MODEL-08 | T-19-54, T-19-55 | `Lore.imagePath` su modello e SDL; passo D-11 con i documenti ambigui contati e lasciati | unit + integration | `npx jest src/models --selectProjects unit` + `npx jest src/lore src/cities src/migrations/model-review test/app.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 19-14-02 | 14 | 14 | BE-MODEL-08 | T-19-56, T-19-57 | file enum in kebab-case con la storia conservata, file vuoto e modello morto cancellati, SDL identico | type check + unit + integration | `npx tsc --noEmit -p tsconfig.json` + `npx jest --selectProjects unit` + `test ! -e src/models/notification.model.ts` | — | ⬜ pending |
| 19-14-03 | 14 | 14 | BE-MODEL-08 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-14-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 19-15-01 | 15 | 15 | BE-MODEL-05 | T-19-59, T-19-60, T-19-62 | `wornEquipment` e `feet` su enum, modello, lettori, registro, SDL e passo a due rinomine, in un commit; nomi vecchi solo nel migratore | unit + integration | `npx jest --selectProjects unit` + `npx jest test/app.int-spec.ts src/migrations/model-review --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 19-15-02 | 15 | 15 | BE-MODEL-05 | T-19-58, T-19-61 | `equipItem` con `feet` sul filo, valore fuori enum rifiutato, vendita che libera lo slot, combattimento | integration | `npx jest src/characters/equipment src/characters/creation src/economy src/quests/outcomes/quest-combat.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 19-15-03 | 15 | 15 | BE-MODEL-05 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-15-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 19-16-01 | 16 | 16 | BE-MODEL-06 | T-19-63, T-19-64, T-19-65, T-19-66 | `maxActiveSpells` resolve field puro, virtual tolta, harness registrato, query e subscription, SDL identico | unit + integration | `npx jest src/characters src/models test/fixtures --selectProjects unit` + `npx jest src/characters/spells/spell-state.wire.int-spec.ts src/characters/character-updated.subscription.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 19-16-02 | 16 | 16 | BE-MODEL-06 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-16-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 19-17-01 | 17 | 17 | BE-MODEL-06 | T-19-70 | `SpellState.active` additivo su schema e SDL, nessun lettore | unit + integration | `npx jest --selectProjects unit` + `npx jest test/app.int-spec.ts src/characters/spells --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 19-17-02 | 17 | 17 | BE-MODEL-06 | T-19-67, T-19-68, T-19-69 | fusione pura delle tre liste (indice, id, voce mancante, conflitto, equipaggiata sconosciuta) e passo D-07 con guardia sui campi vecchi | unit + integration | `npx jest src/migrations/model-review --selectProjects unit` + `npx jest src/migrations/model-review test/app.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 19-17-03 | 17 | 17 | BE-MODEL-06 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-17-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 19-18-01 | 18 | 18 | BE-MODEL-06 | T-19-71, T-19-75 | `SpellStateMigrator` ridotto al taglio che conserva `active`; nessuna ricostruzione senza le liste vecchie; personaggio iniziale (`learnedSpellState` invariato: spec di `src/quests` verdi) | unit + integration | `npx jest src/characters --selectProjects unit` + `npx jest src/characters/spells/spell-state.migrator.int-spec.ts src/characters/spells/spell-recovery.service.int-spec.ts src/characters/creation test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 19-18-02 | 18 | 18 | BE-MODEL-06 | T-19-72, T-19-73, T-19-74, T-19-76 | equip, unequip, uso e crediti sulla sola voce, capacità sotto concorrenza, codici invariati, un solo filtro d'array, coverage della cartella | unit + integration | `npx jest src/characters --selectProjects unit` + `npx jest src/characters --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 19-18-03 | 18 | 18 | BE-MODEL-06 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-18-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 19-19-01 | 19 | 19 | BE-MODEL-06 | T-19-77, T-19-78, T-19-80 | spesa solo sulle voci attive, array intero con `active` conservato, `learnedSpellState` e apprendimento con `active: false`, nessuna lista vecchia scritta | unit + integration | `npx jest src/quests/outcomes src/travel/ambush src/characters/spells --selectProjects unit` + `npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 19-19-02 | 19 | 19 | BE-MODEL-06 | T-19-77, T-19-79, T-19-81 | combattimento e override dalle voci attive, helper e parametri morti rimossi, motore non rinominato | unit + integration | `npx jest --selectProjects unit` + `npx jest src/quests --selectProjects integration --runInBand` + `npx jest src/travel/ambush --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 19-19-03 | 19 | 19 | BE-MODEL-06 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-19-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 19-20-01 | 20 | 20 | BE-MODEL-06 | T-19-85 | fixture, semine e documenti sul filo senza le due liste vecchie, col modello ancora largo | unit + integration | `npx jest --selectProjects unit` + `npx jest src/characters src/migrations src/authz src/economy --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 19-20-02 | 20 | 20 | BE-MODEL-06 | T-19-82, T-19-83, T-19-84, T-19-85, T-19-86 | contrazione di modello, populate, mapper, registro (32) e SDL: blocchi esatti, `ActiveSpell` assente, orfani fuori dal filo | unit + integration | `npx jest --selectProjects unit` + `npx jest test/app.int-spec.ts src/characters src/migrations --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 19-20-03 | 20 | 20 | BE-MODEL-06 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-20-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 19-21-01 | 21 | 21 | BE-MODEL-11 | T-19-96, T-19-97, T-19-98 | `Pet.rarity` nullable dell'enum esistente su schema, input e SDL (blocco `type Pet` esatto, `enum RarityType` nuovo), fuori enum rifiutato, nessun contenuto | unit + integration | `npx jest src/models --selectProjects unit` + `npx jest test/app.int-spec.ts src/shops test/shops --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 19-21-02 | 21 | 21 | BE-MODEL-11 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-21-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 19-22-01 | 22 | 22 | BE-MODEL-12 | T-19-99, T-19-100, T-19-101, T-19-103 | `Pet.enemy` solo Mongoose nel registro (33); `petPrizeOf` puro: tre fasce, confini, fascia vuota, tetto per rango, pet senza rarità, conteggio dei tiri | unit + integration | `npx jest src/models src/migrations/mixed-refs src/quests/generation --selectProjects unit` + `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 19-22-02 | 22 | 22 | BE-MODEL-12 | T-19-99, T-19-101, T-19-102, T-19-104 | `prizesOf` e generatore sul contratto nuovo dei tiri; candidati letti con rarità, vendibilità e zona; replica set: pet del nemico, pet di zona, nessun pet senza rarità; letterali a seme fisso delle due e2e ri-pinnati; coverage della cartella | unit + integration | `npx jest src/quests/generation --selectProjects unit` + `npx jest src/quests/generation test/quests/quest-generation.e2e.int-spec.ts test/quests/quest-generation-access.e2e.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 19-22-03 | 22 | 22 | BE-MODEL-12 | — | bookkeeping | doc | `grep -qF -- "- [x] 19-22-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 19-23-01 | 23 | 23 | BE-MODEL-09 | T-19-87, T-19-88, T-19-90, T-19-91, T-19-94, T-19-95 | `tsc`, unit e integration complete a blocchi, boot reale, SDL cambiato solo come dichiarato, nomi vecchi solo nel migratore, migratore presente e isolato, coverage per cartella, invarianti | gate | `npx tsc --noEmit -p tsconfig.json` + `npx jest --selectProjects unit` + blocchi integration + `git diff --exit-code src/schema.gql` | ✅ | ⬜ pending |
| 19-23-02 | 23 | 23 | BE-MODEL-04, BE-MODEL-09, BE-MODEL-10, BE-MODEL-11, BE-MODEL-12 | T-19-89, T-19-91, T-19-93 | handoff con la tabella SDL vecchio → nuovo verbatim, prove, runbook del boot reale coi conteggi, passo di contenuto dentro la fase, «mai codice pre-19 sul database migrato», senza segreti | doc | `grep -q "mai codice pre-19 sul database migrato" .planning/phases/19-revisione-dei-modelli/BACKEND-NOTES.md` | ❌ W0 | ⬜ pending |
| 19-23-03 | 23 | 23 | BE-MODEL-01, BE-MODEL-02, BE-MODEL-03, BE-MODEL-05, BE-MODEL-06, BE-MODEL-07, BE-MODEL-08 | T-19-92 | sette requisiti chiusi dal codice; BE-MODEL-04, 09, 10, 11 e 12 lasciati aperti (10, 11 e 12 solo per il contenuto); VALIDATION firmata; bookkeeping | doc | `grep -cE "\- \[x\] \*\*BE-MODEL-0[1235678]\*\*" .planning/REQUIREMENTS.md` = 7 | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Le spec nuove nascono nel commit RED del task indicato (TDD, REPO-RULES): nessun piano di soli scaffold.

- [ ] `src/migrations/model-review/model-review.boot.spec.ts` — ordine dei passi, formato dei log, errore non bloccante (BE-MODEL-09, task 19-01-01)
- [ ] `src/migrations/model-review/legacy-fixtures.ts` — inserimento e lettura grezza col driver nativo; un builder della forma vecchia per passo (task 19-01-01 e i task dei passi)
- [ ] `src/models/enemy.schema.spec.ts` — debolezze e magie per riferimento (BE-MODEL-01, BE-MODEL-02, task 19-02-01, 19-03-01)
- [ ] `src/migrations/model-review/enemy-weaknesses.step.int-spec.ts` (task 19-02-02), `enemy-spells.step.spec.ts` e `.int-spec.ts` (19-03-02), `pet-catalog.step.int-spec.ts` (19-04-02), `owned-pets.step.spec.ts` e `.int-spec.ts` (19-07-01), `poi-quest.step.int-spec.ts` (19-12-02), `city-shop.step.int-spec.ts` (19-13-02), `lore-image-path.step.int-spec.ts` (19-14-01), `worn-equipment.step.int-spec.ts` (19-15-01), `spell-states.step.spec.ts` e `.int-spec.ts` (19-17-02)
- [ ] `src/models/pet.schema.spec.ts` (19-04-01), `src/models/point-of-interest.schema.spec.ts` (19-12-01), `src/models/lore.schema.spec.ts` (19-14-01)
- [ ] `src/characters/pets/owned-pets.mapper.spec.ts` (19-05-01), `src/characters/pets/owned-pet-entry.spec.ts` (19-06-01)
- [ ] `src/quests/outcomes/pets/pet-xp.spec.ts` e `companion-xp.spec.ts` — funzioni pure del premio (BE-MODEL-04, task 19-08-01)
- [ ] `src/quests/outcomes/unrewarded-plan.spec.ts` — spesa delle magie nel piano senza premio (BE-MODEL-06, task 19-19-01)
- [ ] `src/quests/generation/pet-prize.spec.ts` — tre fasce, confini, tetto per rango e conteggio dei tiri del pet in premio (BE-MODEL-12, task 19-22-01)
- [ ] `src/characters/character-status.resolver.spec.ts` — resolve field di `maxActiveSpells` (BE-MODEL-06, task 19-16-01); resolver registrato in `test/authz/characters-test-app.ts`
- [ ] Fixture: `buildEnemy` (`weaknesses`), `buildPet` (`attack`, `defense`, `relatedLore`, `rarity`, `enemy`, senza stato), helper dei pet con rarità e legame in `test/quests/generation-world.ts`, `buildOwnedPet` (nuovo, task 19-05-01), `buildCharacter` e `spellBook` (`wornEquipment`, voci dei pet, sole voci delle magie con `active`), `place-in-city` e `shop-world.fixture` su `shop`

Harness: nessuno nuovo (`createAuthTestApp`, `createCharactersTestApp`, `createOutcomeHarness`, boot reale).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Boot reale col migratore: backup, prova a secco coi conteggi attesi, primo boot (nove righe), secondo boot a zero | BE-MODEL-09 | Il database reale non si tocca dagli esecutori (REPO-RULES): lo fa l'orchestratore a processo dell'utente fermo | Runbook nel handoff §3 (piano 19-23), passi 1–5; regola «mai codice pre-19 sul database migrato» |
| Contenuto a DB dentro la fase: `maxXp` dei 44 pet, `defense` di tutti i 44 pet, collegamenti `relatedLore` dei pet e la lore nuova, 44 rarità, 31 legami `Pet.enemy`, Molosso da guerra vendibile e nei pool, Scheletro di cavallo da guerra `ultrarare` | BE-MODEL-04, BE-MODEL-10, BE-MODEL-11, BE-MODEL-12 (D-25..D-28) | Il contenuto non passa dal repo (D-36): script fuori repo dell'orchestratore, dopo la revisione dell'utente sulla proposta | Runbook nel handoff §3, passo 6: prova a secco, applicazione, conteggi 44 / 44 / 44 + 1 / 44 / 31 |
| Rimozione del modulo una tantum in TDD dopo il boot reale | BE-MODEL-09 | Nessun piano rimuove il migratore: esce dal repo solo dopo la sua corsa | Runbook nel handoff §3, passo 7 (RESEARCH M-5) |
| `npm run test:cov` con le soglie per cartella | BE-MODEL-09 | ≈ 630 s, oltre i 600 s dello strumento: mai da un esecutore | Lanciato dall'orchestratore in background dopo il gate; il piano 19-23 misura la coverage per cartella come ripiego |
| UAT su device: sezione Magie con `active`, slot `feet`, pet posseduti con stato, «xp al compagno», lore dei pet | BE-MODEL-03..06, BE-MODEL-10..12 | Appartiene alla FE Phase 19 (device reale) dopo la merge | Note nel handoff §3 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 150 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
