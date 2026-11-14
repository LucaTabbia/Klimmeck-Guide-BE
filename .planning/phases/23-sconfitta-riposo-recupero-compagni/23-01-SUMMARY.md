---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 01
subsystem: pets
tags: [pets, companion, life-clock, levels, owned-pets, mongoose]
requires: []
provides:
  - "companion-life.ts: companionLifeAt, petRecoveryTimeOf, defeatedUntilOf, isPetDefeated, companionDisplayName, isLegacyCompanionEntry, companionStoredLifeOf, COMPANION_LIFE_FLOOR"
  - "companion-level.ts: companionLevelOf, companionLevelThresholds, companionLevelFromXp, companionMaxLifeAt, companionStoredLevelOf, companionMaxLifeOf, isSavedCompanionLevel, COMPANION_LEVELS"
  - "OwnedPet: @Prop name, lifeAsOf, defeatedUntil, potionRecoveryUntil, level (senza @Field)"
  - "normalisedOwnedPets conserva i campi nuovi; newOwnedPetEntry scrive level: 1"
affects: [23-02, 23-03, 23-04, 23-05, 23-07, 23-08, 23-09, 23-10, 23-15, 23-16]
tech-stack:
  added: []
  patterns: ["chiavi opzionali scritte solo se valorizzate (spread condizionale)", "import a senso unico owned-pet-entry → companion-level, companion-life → companion-level"]
key-files:
  created:
    - src/characters/pets/companion-life.ts
    - src/characters/pets/companion-life.spec.ts
    - src/characters/pets/companion-level.ts
    - src/characters/pets/companion-level.spec.ts
    - src/characters/pets/owned-pet-fields.int-spec.ts
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - src/models/character/owned-pet.model.ts
    - src/characters/pets/owned-pet-entry.ts
    - src/characters/pets/owned-pet-entry.spec.ts
    - src/quests/outcomes/pets/companion-xp.spec.ts
    - test/fixtures/owned-pet.fixture.ts
    - src/economy/trade/trade-pets.spec.ts
    - src/economy/trade/shop-transaction.service.int-spec.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/quest-pet-prize.int-spec.ts
    - src/models/shop-fields.schema.spec.ts
    - src/economy/trade/do-transaction.int-spec.ts
    - test/shops/city-shops.e2e.int-spec.ts
decisions:
  - "companionLifeNow (regole 1-2 della vita) esiste già come helper NON esportato in companion-life.ts: companionStoredLifeOf ne aveva bisogno; il piano 04 lo esporta e aggiunge il suo caso"
  - "Una vita non finita (NaN, Infinity) si legge come non numerica (legacy = piena): lo skeleton della ricerca con typeof number lasciava passare NaN"
  - "companionStoredLifeOf con massimo non valido ricade su companionLifeNow anche per la voce legacy (minimo 1, mai NaN)"
metrics:
  duration: 15min
  completed: 2026-11-14
  tasks: 6
---

# Phase 23 Plan 01: Modello e orologio del compagno Summary

Orologio di riposo lineare pigro (`companionLifeAt`, velocità `(max − 1) / T`, minimo 1, legacy piena, `T` non valido istantaneo), dieci livelli del compagno sul tetto di xp con vita fino al doppio (`companionLevelOf`, livello salvato letto indulgente), cinque campi nuovi della voce posseduta conservati da ogni riscrittura dell'array e voce nata a livello 1; SDL invariato.

## Task e commit

| Task | Nome | Commit |
|------|------|--------|
| 1 | Requisiti BE-PET-01..14 e lista dei 18 piani | 5874efe6 |
| 2 | Orologio del compagno (RED / GREEN) | b4a83d3f / a1524962 |
| 3 | Livelli, vita massima, voce legacy (RED / GREEN) | 29651fe0 / b265725a |
| 4 | Campi conservati dalle riscritture (RED / GREEN) | 2430c4d6 / 619ddee4 |
| 5 | Nascita a livello 1 (RED / allineamento / GREEN) | 781f32fb / 610279a5 / 6349bd90 |
| 6 | Bookkeeping | commit `docs(phase-23): record plan 01 progress` |

## Fallimenti RED attesi

- Task 2 e Task 3: modulo assente (`Cannot find module './companion-life'` / `'./companion-level'` di ts-jest), nessun test eseguito.
- Task 4: `normalisedOwnedPets` scartava le chiavi nuove (sonda P1): falliscono `keeps name, anchor, dates and level when the array is rewritten (D-23, D-39)`, il caso di `companion-xp.spec.ts` e l'int-spec dei campi (asserzione sulle otto chiavi dell'array scritto, `Expected - 5`).
- Task 5: 22 test unitari rossi (voce nata a tre chiavi in `owned-pet-entry.spec.ts`, `trade-pets.spec.ts`, `outcome-plan.spec.ts`).

## Casi verdi al primo colpo (con motivo)

- `drops a blank name, an unreadable date and an invalid level instead of writing them (D-23)` e `keeps the three-key shape of an entry without the new fields (D-23)`: la normalizzazione di oggi scrive già solo tre chiavi; i casi pinnano che il GREEN non le aggiunga.
- `reads a stored entry without the new fields with no added keys (D-23)` (int-spec): lo schema senza `default` non aggiunge chiavi in lettura lean, né prima né dopo.

## Contratto del modulo

Come da `<interfaces>` del piano. In più: `companionLifeNow(lifePoints, maxLifePoints)` privato in `companion-life.ts` (regole 1-2), usato da `companionLifeAt` e `companionStoredLifeOf`. `companion-level.ts` importa solo `isPetXpCap` (nessun import di `owned-pet-entry.ts`). Tabella base 100 / tetto 100 provata: soglie `0, 2, 7, 13, 22, 33, 47, 62, 80, 100`, vite `100 … 200`; Falco 100 → 200, Pegaso 5900 → 11800.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] NaN letto come vita valida**
- **Found during:** Task 2
- **Issue:** lo skeleton della ricerca (`typeof === 'number'`) con `NaN` produce `Math.min(max, NaN) = NaN`; il caso `it.each([..., NaN])` della spec lo vuole pieno.
- **Fix:** `storedLifeOf` richiede `Number.isFinite`.
- **Commit:** a1524962

**2. [Rule 3 - Blocking] Spec fuori elenco che fissano la forma a tre chiavi**
- **Found during:** Task 5 (verifica allargata)
- **Issue:** `src/models/shop-fields.schema.spec.ts` pinna i path dello schema della voce (rosso dal commit 619ddee4 del Task 4, la cui verifica del piano non copre `src/models`); `src/economy/trade/do-transaction.int-spec.ts` e `test/shops/city-shops.e2e.int-spec.ts` pinnano la voce comprata; inoltre 4 attese di `shop-transaction.service.int-spec.ts` e 1 di `quest-pet-prize.int-spec.ts` con `buildOwnedPet(...)` della voce nata non erano state viste nel RED.
- **Fix:** attese allineate (path nuovi in ordine, `buildOwnedPet(id, { level: 1 })`), nessuna asserzione tolta; commit di test separato prima del GREEN.
- **Files modified:** i cinque file citati
- **Commit:** 610279a5

**3. [Rule 3 - Blocking] Tipo debole nella spec della vita**
- **Found during:** Task 3
- **Issue:** `tsc` TS2559: la voce legacy `{ xp, currentLifePoints }` non ha proprietà in comune col parametro `{ level?, lifeAsOf? }` di `isLegacyCompanionEntry`.
- **Fix:** voce della spec tipizzata con `level?: number`; il ritocco della spec è finito nel commit GREEN b265725a.

**4. Commento riformulato per il grep di gate**
- Il commento dell'helper `xpOf` citava `owned-pet-entry`; riformulato perché `grep -c "owned-pet-entry" companion-level.ts` deve stampare 0.

### Note di bookkeeping

- STATE.md porta `Plan: 1 of 18` (K senza zero, regola del brief): il verify del Task 6 su `Plan: 01 of 18` non combacia, atteso.
- Il Task 5 elenca `shop-transaction.service.int-spec.ts` e `quest-pet-prize.int-spec.ts`: entrambe avevano casi sull'array, nessuna rimasta intatta.

## Test eseguiti

- Unit `src/characters src/quests src/travel src/models src/economy`: 175 suite / 2 465 test, verdi dopo l'allineamento.
- Integration: `owned-pet-fields` 2/2; `shop-transaction.service` + `quest-pet-prize` 72/72; `do-transaction` + `city-shops.e2e` 35/35; per sicurezza `boss-resolution`, `quest-resolution.service`, `gm-completion.service`, `guided-completion.service`, `mission-simulation.service` 95/95 e `equip-pet`, `character-mutations-lock`, `ambush-resolution`, `ambush-lifecycle`, `character-updated.subscription`, `archived-character-visibility`, `characters-ownership`, `character-creation.resolver` 231/231.
- `npx tsc --noEmit -p tsconfig.json` 0; `git diff d4e3adad -- src/schema.gql` vuoto.

## Known Stubs

Nessuno.

## Self-Check: PASSED
