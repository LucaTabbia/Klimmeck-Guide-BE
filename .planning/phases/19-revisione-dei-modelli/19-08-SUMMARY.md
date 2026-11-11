---
phase: 19-revisione-dei-modelli
plan: 08
subsystem: outcomes
tags: [pet, compagno, xp, tetto, catalogo del combattimento, D-04, D-17]
requires: [19-07]
provides:
  - costante `PET_XP_SHARE = 0.1`, funzione pura `petXpAward(enemiesXp, currentXp, maxXp)` e guardia `isPetXpCap` in `src/quests/outcomes/pets/pet-xp.ts`
  - funzione pura `companionXpAward(assets, enemiesXp, petMaxXp)` in `src/quests/outcomes/pets/companion-xp.ts`
  - `CombatCatalog.petMaxXp` (esadecimale del pet → `maxXp` valido), letto da `readCombatCatalog` nei due ritorni
affects: [19-09, 19-10]
tech-stack:
  added: []
  patterns: [primitiva pura a tabella, intero catalogo piccolo letto con la proiezione di un campo]
key-files:
  created:
    - src/quests/outcomes/pets/pet-xp.ts
    - src/quests/outcomes/pets/pet-xp.spec.ts
    - src/quests/outcomes/pets/companion-xp.ts
    - src/quests/outcomes/pets/companion-xp.spec.ts
  modified:
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/resolution-loader.service.spec.ts
    - src/quests/outcomes/combatant-plan.spec.ts
decisions:
  - Una sola guardia `isPetXpCap` (intero sicuro > 0) condivisa da `petXpAward` e dal lettore dei tetti
  - Xp dei nemici non finiti (NaN, infinito, assenti) valgono nessun premio, come lo zero e i negativi
  - Una voce del compagno senza `xp` valido parte da 0
metrics:
  completed: 2026-11-11
  tasks: 3
  files: 7
---

# Phase 19 Plan 08: Primitive degli xp del compagno — Summary

`petXpAward` dà al compagno `round(xp dei nemici × 0,10)` col tetto `maxXp` del catalogo e ritorna il guadagno effettivo; `companionXpAward` trova la voce del compagno equipaggiato in `ownedPets` e restituisce l'array intero aggiornato più il guadagno (o nessun cambio); `readCombatCatalog` porta i tetti validi dell'intero catalogo dei pet in `petMaxXp`, anche nel ritorno anticipato senza nemici. Nessun lettore ancora: sul filo non cambia nulla.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | `b17473ff` | `test(outcomes): pin the companion xp award primitives` |
| 1 GREEN | `86d59d25` | `feat(outcomes): add the companion xp award primitives` |
| 2 RED | `4814b132` | `test(outcomes): pin the pet xp caps in the combat catalogue` |
| 2 GREEN | `3f844e0e` | `feat(outcomes): read the pet xp caps with the combat catalogue` |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 08`, `docs(phase-19): record plan 08 progress` |

Nessun trailer in nessun commit (controllo a `0` dopo ognuno).

## Evidenza RED

- **Task 1** — `pet-xp.spec.ts` e `companion-xp.spec.ts`: `Could not locate module src/quests/outcomes/pets/…` (2 suite non caricate, 0 test eseguiti: moduli assenti). Verdi al primo colpo: nessuno.
- **Task 2** — `resolution-loader.service.spec.ts`: 4 rossi su 6. I tre casi nuovi `(D-17)` (`catalog.petMaxXp` indefinito) e il caso esistente `reads the combat catalog of composed enemies without a quest (D-09)`, il cui `toEqual` sull'intero catalogo ora attende `petMaxXp: new Map()`. Fra il RED e il GREEN `tsc` è rosso per il solo campo non ancora dichiarato.

## Forma delle primitive

- **`petXpAward`**: tetto non valido (`isPetXpCap` falso: non numero, non intero sicuro, ≤ 0) → `{ xp: corrente, gained: 0 }`; altrimenti `xp = max(corrente, min(maxXp, corrente + quota))`, `gained = xp − corrente` (mai negativo: gli xp già sopra il tetto restano dove sono).
- **`companionXpAward`**: compagno letto con `refIdOf(assets.pet)` (ObjectId o esadecimale legacy), voce trovata con `sameId(entry.pet, …)`, tetto da `petMaxXp.get(esadecimale)`. Ritorna `{ ownedPets: null, gained: 0 }` senza assets, senza compagno, senza voce, senza tetto nella mappa o con guadagno 0. Con guadagno: copia dell'array con la sola voce del compagno sostituita da `{ ...voce, xp }` (le altre voci per identità, `currentLifePoints` intatta, ingresso non mutato). Nessun path posizionale nel modulo (T-19-31).
- **`readPetMaxXp`** (privato): `find({}, { maxXp: 1 })` lean sull'intero catalogo, filtro `isPetXpCap`; letto subito dopo `readSpellMaxUsages`, prima del ritorno anticipato.

## Costruttori di `CombatCatalog` aggiornati

`tsc` ne ha indicato uno solo: `catalogWith` in `src/quests/outcomes/combatant-plan.spec.ts` (`petMaxXp: new Map()`). Gli altri file che nominano `spellMaxUsages` (`outcome-plan.spec.ts`, `guard-outcome.spec.ts`, `ambush-plan.spec.ts`, `test/quests/unrewarded-plan-input.ts`, `conclusion-plan.ts`, `gm-completion.service.ts`, `ambush-resolution.service.ts`) costruiscono gli input dei piani campo per campo, non un `CombatCatalog`: non toccati. Nella spec del loader il modello dei pet passa da `null` a un finto modello (secondo argomento di `loaderWith`).

## Esito delle prove

- `npx jest src/quests/outcomes/pets --selectProjects unit` → 2 suite, 36 test verdi.
- `npx jest --selectProjects unit` → 268 suite, 3399 test verdi (prima di ognuno dei due commit GREEN: 3396 dopo il task 1).
- `npx jest src/quests --selectProjects integration --runInBand` → 35 suite, 503 test verdi (155 s, in primo piano).
- `npx jest src/travel --selectProjects integration --runInBand` → 11 suite, 202 test verdi.
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni GREEN. `git diff --exit-code src/schema.gql` → 0. Prettier ed eslint sui file toccati, uno per uno: puliti. `pgrep -fl 'bin/jest'` vuoto. Nessun comando spostato in background.
- Il resto del progetto integration (personaggi, economia, boot reale, migratore) non è stato rieseguito: il piano non tocca modelli condivisi né lo SDL.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| `export const PET_XP_SHARE = 0.1` in `pet-xp.ts` | 1 |
| `D-04)` ≥ 4 e `D-17)` ≥ 2 in `pet-xp.spec.ts` | 4 e 2 |
| `D-04)` ≥ 5 e `D-17)` = 2 in `companion-xp.spec.ts` | 9 e 2 |
| nessun `process.env`, `Math.random`, `Date.now` in `src/quests/outcomes/pets` | vuoto |
| `petMaxXp` ≥ 3 in `resolution-loader.service.ts` | 4 |
| `D-17)` = 3 in `resolution-loader.service.spec.ts` | 3 |
| SDL invariato | sì |

## Deviazioni dal piano

**1. [Regola 2 - Robustezza] xp dei nemici non finiti = nessun premio**
- La formula del piano con `NaN` darebbe `xp: NaN` scritto sulla voce. `petXpAward` legge una quota 0 per valori non finiti; casi nella tabella `awards nothing without enemies xp` (0, negativi, `NaN`, infinito, assente).

**2. [Regola 2 - Robustezza] voce senza `xp` valido parte da 0**
- `OwnedPetEntry.xp` è opzionale (dati legacy o scritti a mano): `companionXpAward` legge 0 per un valore assente, non intero o negativo; caso `starts from 0 when the entry carries no valid experience (D-04)`.

**3. [Scelta dentro il contratto] `isPetXpCap` esportata da `pet-xp.ts`**
- Una sola definizione di «tetto valido» per la funzione pura e per il lettore del catalogo (il piano la descriveva due volte). In più i tipi `PetXpAward` e `CompanionAssets`.

**4. [Casi in più] oltre il `<behavior>`**
- `pet-xp.spec.ts`: (130, 40) → 53; già al tetto → guadagno 0; tetti `Infinity` e stringa. `companion-xp.spec.ts`: guadagno tagliato dal tetto (95 → 100, `gained` 5), assets nulli o senza `ownedPets`, senza xp dei nemici. Il conteggio `D-17)` = 2 di `companion-xp.spec.ts` è rispettato titolando `(D-04)` il caso del guadagno tagliato (il tetto è regola di D-04).

**5. [Regola 3 - Blocco] `combatant-plan.spec.ts` fuori da `files_modified`**
- È il costruttore indicato da `tsc`, previsto dal testo del task 2.

**6. [Ordine dei commit di chiusura e forma di STATE] come nei piani 01–07**
- SUMMARY in un commit suo prima del bookkeeping; `Plan: 8 of 23`: il `grep -q "Plan: 08 of 23"` del piano non trova la riga, è atteso.

Nessuna decisione architetturale (Regola 4).

## Note per i piani successivi

- **19-09 (esiti delle quest):** in `planParticipant` chiamare `companionXpAward(snapshot.assets, won ? input.enemies?.xp ?? 0 : 0, catalog.petMaxXp)`; se `ownedPets` non è `null` è la base a cui aggiungere l'eventuale voce del pet vinto, in un solo valore finale di `assets.ownedPets`; `gained` è `petXpGained` del `QuestResult`. Il catalogo va portato fino all'input del piano: oggi gli input (`outcome-plan.spec.ts`, `unrewarded-plan-input.ts`, `gm-completion.service.ts`, `conclusion-plan.ts`) copiano `spellMaxUsages` campo per campo, `petMaxXp` andrà aggiunto allo stesso modo.
- **19-10 (imboscata):** `ambush-resolution.service.ts:456` copia `catalog.spellMaxUsages` nell'input di `planAmbushOutcome`: `petMaxXp` accanto; il guadagno entra in `commonSetOf` e nel report trattenuto (D-19).
- **Equipaggiato senza voce:** nessun premio (ruling dell'orchestratore), già pinnato.
- **Contenuto:** oggi `maxXp` è 100 su tutti i 44 pet: tutti entrano nella mappa. Un pet con tetto non valido è assente dalla mappa e non riceve nulla.
- **Spec del loader:** `loaderWith(enemyModel, petModel = fakeModel())`.
- BE-MODEL-04 resta aperto (consumatori in 19-09 e 19-10, contenuto a DB); nessuna spunta in REQUIREMENTS.

## Stub noti

Nessuno (primitive senza lettori per disegno: i consumatori sono i piani 19-09 e 19-10).

## Threat flags

Nessuna superficie nuova fuori dal threat model: T-19-29 (premio solo da funzioni pure, tetto dal catalogo), T-19-30 (tetto non valido fuori dalla mappa e nessun premio), T-19-31 (solo array intero) mitigati; T-19-32 accettato (una lettura in più di 44 documenti con la proiezione di un campo).

## Self-Check: PASSED

- I quattro file creati esistono; i quattro commit `b17473ff`, `86d59d25`, `4814b132`, `3f844e0e` sono in `git log`.
