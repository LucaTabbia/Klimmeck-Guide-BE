---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 19
subsystem: quests
tags: [companion, dungeon, guided-mission, corrections, xp]
branch: fix/23-dungeon-xp-and-innkeeper-corrections
requires: [23-18]
provides: [companion xp from fought fights only, guided corrections merged with the simulation]
key-files:
  created:
    - src/quests/outcomes/pets/companion-enemies-xp.ts
    - src/quests/outcomes/pets/companion-enemies-xp.spec.ts
  modified:
    - src/quests/outcomes/combat/combat-resolver.ts
    - src/quests/outcomes/dungeon/placeholder-dungeon-resolver.ts
    - src/quests/outcomes/dungeon/dungeon-resolver.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/combatant-plan.ts
    - src/quests/outcomes/gm-overrides.ts
    - src/models/request/complete-pending-request.model.ts
    - src/quests/guided/guided-outcome.ts
    - src/quests/guided/guided-completion.service.ts
    - src/quests/guided/mission-draft-save.service.ts
decisions:
  - "D-13 xp: il compagno caduto prima dell'ultimo scontro di una sequenza prende gli xp dei soli scontri combattuti, quello della caduta compreso; xp del personaggio invariato"
  - "A-08: nella bozza guidata un campo omesso o null della correzione vale il simulato; un valore esplicito, anche [], vince; il record corrected salva gli effetti fusi; il completamento senza bozza non cambia"
completed: 2026-11-15
---

# Phase 23 Plan 19: xp del compagno nel dungeon e correzioni dell'oste

Due decisioni dell'utente dopo la merge della fase 23, senza PLAN.md (brief dell'orchestratore).

## Cosa

1. **xp del compagno (D-13).** `ParticipantEffects.companionEnemiesXp?` porta gli xp dei nemici degli scontri combattuti dal compagno quando cade prima dell'ultimo (assente = tutti i nemici). La regola unica è `companionEnemiesXpOf(fights)` in `pets/companion-enemies-xp.ts`. Il dungeon segnaposto la applica tappa per tappa (`ParticipantTrack`). Il completamento guidato la applica con `guidedBattleOf(fights, hex, enemyXp)`, sulla vita effettiva (corretta se corretta) del compagno a fine scontro; gli xp per nemico vengono da `enemyXpByIdOf(catalog)`, che usa la stessa formula di `enemyFactsOf`. `planParticipant` passa a `companionAfterFight` `battle.companionEnemiesXp ?? enemiesXp` (0 in sconfitta). L'xp del personaggio non cambia. Contratto GraphQL invariato.
2. **Correzioni dell'oste (A-08).** `correctionOverSimulated(correction, simulated)` in `guided-outcome.ts` fonde la correzione col simulato del suo scontro prima di `validateOverrides`: omesso o `null` = simulato, esplicito vince (anche `[]` e `0`, che poi la convalida rifiuta come prima). `MissionDraftSaveService.corrected` la usa tramite `overSimulated(correction, fight)`. Il record `corrected` contiene gli effetti fusi: `sameCorrections`/`effectsKeyOf` e la riconvalida al completamento lavorano sui fusi e non rileggono il simulato. Il completamento senza bozza (`gm-overrides.ts`) non cambia. Il gap G-1 è chiuso.

## Commit

- `70a1f9ab` test(quests): expect companion xp from the fights it fought only
- `8f005f5c` fix(quests): give a fallen companion the xp of its fights only
- `e0e4788a` test(quests): expect omitted correction fields to keep the simulation
- `9106b66e` fix(quests): fill omitted innkeeper corrections with the simulation

## Pin cambiati

- `companion-defeat.int-spec.ts` «keeps a companion defeated on a stage out of the later stages…»: xp del compagno da `2 * FIGHT_PET_XP` a `FIGHT_PET_XP`, più `xpGained: 250` e `petXpGained: 10` sul risultato.
- `mission-draft-save.service.int-spec.ts` «corrects a fight within the bounds at its start (D-06)», caso `highest` (`{ hpAfter: 1000 }`): da liste vuote a `{ ...simulated, hpAfter: 1000 }`.
- `mission-draft-save.service.int-spec.ts` «saves the innkeeper correction of the companion life (D-17)»: `hpAfter` da 900 (vita d'inizio scontro) a `{ ...simulated, companionLifeAfter: 1 }`.

## Prove nuove

- `companion-enemies-xp.spec.ts` (4), `placeholder-dungeon-resolver.spec.ts` (+1 caso, +1 asserzione di assenza), `outcome-plan.spec.ts` (+1), `guided-outcome.spec.ts` (+4, describe `correctionOverSimulated`).
- `guided-completion.service.int-spec.ts`: +1 (compagno caduto nel primo scontro → xp 5 invece di 15, personaggio 150), +1 asserzione (vita omessa = simulata 900).
- `mission-draft-save.service.int-spec.ts`: +2 (compagno omesso = simulato, G-1; valori espliciti che vincono).

## Verifica

- `npx tsc --noEmit -p tsconfig.json`: 0. eslint e prettier puliti sui file toccati.
- Unit `src/quests`: 88 suite / 1 465 test verdi.
- Integration `src/quests/outcomes` + `src/quests/guided`: 21 suite / 318 test verdi; tutta `src/quests` dopo l'ultimo fix: 46 suite / 762 test verdi. Boot reale `test/app.int-spec.ts`: 102/102, `src/schema.gql` invariato (nessun decoratore cambiato).

## Deviazioni

Nessuna rispetto al brief. Fuori perimetro: la guardia dopo lo scontro della quest (`guard-outcome.ts` `mergedEffects`) non porta `companionEnemiesXp`: un compagno caduto nello scontro della quest prende ancora gli xp della guardia (regola non chiesta, da decidere).

## Aggiunta del 2026-11-15: il compagno sconfitto non prende xp (UAT)

Regola dell'utente in UAT: «Se il pet viene sconfitto non ottiene xp. Li ottiene solo quando vince.» Sostituisce la regola D-13 di sopra («la tappa in cui cade conta»). Osservato in UAT: caccia singola, compagno sconfitto, xp 6 → 7 e livello salito.

### Cosa

- `companionEnemiesXpOf(fights)` conta i soli scontri da cui il compagno esce in piedi: la caduta in qualunque scontro, anche l'ultimo, dà la chiave `companionEnemiesXp` con la somma degli scontri precedenti (caduto nel primo = 0). `CompanionFight` estende `Pick<ParticipantEffects, 'companionLifeAfter' | 'companionEnemiesXp'>`: una sequenza già fusa in cui il compagno è caduto porta la sua quota.
- Nuovi in `pets/companion-enemies-xp.ts`: `companionFightOf(effects, enemiesXp)` (le sole chiavi del compagno) e `companionShareOf(effects, enemiesXp)` = lo scontro singolo come sequenza di uno (caduto = 0, sequenza caduta = la sua quota, altrimenti tutti).
- `planParticipant` (`outcome-plan.ts`) e `planAmbushOutcome` (`ambush-plan.ts`) passano a `companionAfterFight` `won ? companionShareOf(effects, enemiesXp) : 0`. Valgono così quest, boss, soccorso, imboscata, GM legacy e guidato (che passano da `planParticipant`).
- Guardia: `guardBattleEffects` in `conclusion/conclusion-plan.ts` aggiunge agli effetti fusi `companionEnemiesXpOf([scontro della quest, scontro della guardia])` con gli xp di ciascun catalogo (`enemyFactsOf`). Caduto nella quest = 0 (né la quest né la guardia); caduto nella guardia = gli xp della quest. `mergedEffects` in `guard-outcome.ts` non cambia. Non è risultato sproporzionato.
- Dungeon: `stageFightOf` tolto, le tappe usano `companionFightOf`. Guidato invariato nel codice (usa già `companionEnemiesXpOf`).
- L'xp del personaggio non cambia; senza vittoria della quest il compagno resta a 0. `companionAfterFight` non cambia. Contratto GraphQL invariato (`src/schema.gql` senza diff).

### Commit

- `4d310a89` test(quests): expect no xp for a companion fallen in its fight
- `bf812a33` fix(quests): give no xp to a companion fallen in its fight

### Pin cambiati

- `companion-enemies-xp.spec.ts`: caduto nell'ultimo da `{}` a `{ companionEnemiesXp: 60 }`; caduto nel primo da 60 a 0; caduto nel secondo da 80 a 60.
- `placeholder-dungeon-resolver.spec.ts`: quota per tappa della caduta 0 / 1 / 2 da 60 / 80 / assente a 0 / 60 / 80.
- `outcome-plan.spec.ts` «unequips a companion defeated in the fight…»: xp della voce da 20 a 0 (+ `petXpGained` 0, `xpGained` 200).
- `ambush-plan.spec.ts` «unequips a companion defeated in a won ambush…»: voce da xp 30 / livello 2 a xp 0 / livello 1 (+ `petXpGained` 0).
- `companion-defeat.int-spec.ts`: quest vinta a 1, boss e dungeon caduto alla prima tappa da `FIGHT_PET_XP` (10) a 0 (+ `petXpGained` 0 e `xpGained` 150 sulla quest).
- `companion-defeat-rescue.int-spec.ts`: soccorritore caduto da 10 a 0; guardia col compagno caduto nella quest da 11 a 0.
- `ambush-resolution.int-spec.ts` «writes the companion of the ambush in the result…»: xp della voce da `COMPANION_SHARE` (1) a 0.
- `guided-completion.service.int-spec.ts` caduto nel primo scontro (corretto a 1): da 5 a 0.

### Prove nuove

- `companion-enemies-xp.spec.ts`: +1 caso di sequenza fusa, describe `companionFightOf` (1) e `companionShareOf` (3).
- `companion-defeat.int-spec.ts`: +1 (dungeon a tre tappe, caduto alla seconda → `FIGHT_PET_XP`, personaggio 350).
- `companion-defeat-rescue.int-spec.ts`: +1 (guardia vinta col compagno caduto nella guardia → 10, solo la quest).
- `guided-completion.service.int-spec.ts`: +1 (caduto nell'ultimo scontro → 5, i precedenti).

### Verifica

- RED: 4 suite unit / 10 test e 4 suite integration / 10 test rossi, tutti per la regola nuova.
- `npx tsc --noEmit -p tsconfig.json`: 0. eslint e prettier puliti sui 15 file toccati.
- Unit `src/quests` + `src/travel`: 114 suite / 1 767 test verdi.
- Integration `src/quests/outcomes` 16 / 224, resto di `src/quests` 30 / 541, `src/travel` + `test/app.int-spec.ts` 14 / 379 (boot reale 102/102), tutti verdi. `src/schema.gql` invariato.

### Deviazioni

Nessuna rispetto al brief. La guardia è risolta qui (prima era fuori perimetro, vedi Deviazioni sopra).

## Aggiunta del 2026-11-15: il compagno non noto resta nero (UAT)

Richiesta dell'utente in UAT: «Se non hai ancora ottenuto la lore corrispondente, il foglio non si deve aprire per dare il dettaglio e l'immagine deve essere nera (come succede per gli enemies).» Il BE decide, la FE legge un campo.

### Cosa

- Campo nuovo `Pet.known: Boolean!`, `@ResolveField` per viewer in `src/lore/known-pets.resolver.ts` (`KnownPetsResolver`, registrato in `LoreVisibilityModule` accanto a `KnownEnemiesResolver`), mai salvato a DB. Vale ovunque il filo serve un `Pet` (catalogo, negozi, premi delle quest e dei ranghi, `CharacterAssets.pet`, `OwnedPet.pet`).
- Regola in `src/lore/lore-visibility.ts`: `knowsAnyLoreOf(visibility, refs)` = nessun ref leggibile → `true`; altrimenti `true` se almeno uno è visibile (`isVisible`). `visibleLoreIdsOf` e `knowsAnyLoreOf` condividono il nuovo helper privato `readableLoreIdsOf(refs)` (esadecimale, duplicati e illeggibili scartati): stessa lettura e stessa visibilità di `Pet.relatedLore`, nessuna regola duplicata.
- Viewer: oste → `true` sempre; giocatore → lore del personaggio corrente attivo; senza personaggio, morto in attesa del foglio o anonimo → vista nulla, quindi `true` solo per i pet senza lore.
- Costo: la sola lettura del viewer già in cache per richiesta/evento (`ViewerKnowledgeService.of`), nessuna query delle lore.
- SDL: una riga, `known: Boolean!` dentro `type Pet`.

### Commit

- `c62ef79e` test(lore): expect a pet known once one of its lore is unlocked
- `e4268b72` feat(lore): serve whether the viewer knows a pet

### Pin cambiati

- `test/app.int-spec.ts` `CATALOGUE_PET_BLOCK`: + `known: Boolean!` dopo `imagePath` (letto da tre casi del boot reale).

### Prove nuove

- `src/lore/lore-visibility.spec.ts`: describe `knowsAnyLoreOf` (5 casi).
- `src/lore/lore-related.int-spec.ts`: describe «whether the viewer knows a pet» (7 casi: lore sbloccata / tutte chiuse, senza lore, oste, senza personaggio, query singola, id stringa, una lettura del viewer e zero `Lore.find` per tre pet).

### Verifica

- RED: unit 5 test rossi (`knowsAnyLoreOf` non esiste), integration 10 rossi (7 «Cannot query field "known" on type "Pet"», 3 pin del boot reale).
- `npx tsc --noEmit -p tsconfig.json`: 0. eslint pulito sui file toccati (un warning preesistente `no-base-to-string` a `test/app.int-spec.ts:1232`, fuori dal diff); prettier pulito.
- Unit `src/lore` + `src/pets`: 4 suite / 25 test verdi.
- Integration `src/lore` + `src/pets` + `test/app.int-spec.ts`: 6 suite / 160 test verdi (boot reale 102/102); matrice authz 1 / 131 verde. `git diff` di `src/schema.gql` = la sola riga `known: Boolean!` in `type Pet`.

### Deviazioni

Nessuna rispetto al brief. Note: `MissionCompanion.pet` è un `ID!`, non un `Pet`, quindi lì `known` non compare; una lore collegata ma cancellata dal DB conta ancora per `known` se il viewer la ha sbloccata (il campo non legge le lore, a differenza di `relatedLore` che la scarta), nessun dato reale oggi in quella condizione.
