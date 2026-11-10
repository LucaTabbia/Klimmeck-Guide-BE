---
phase: quick-261110-mag
plan: 01
subsystem: quests
tags: [quest-type, magic, study, eligibility, lore-draw, spell-draw]
key-files:
  modified:
    - src/models/enums/quest-type.enum.ts
    - src/quests/acceptance/quest-eligibility.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/party/quest-start.service.ts
    - src/quests/outcomes/quest-resolution.sweeper.ts
    - src/quests/acceptance/quest-eligibility.spec.ts
    - src/quests/acceptance/quest-lanes.spec.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/quests/generation/generated-prizes.spec.ts
    - src/quests/outcomes/study-lore-draw.int-spec.ts
    - src/quests/outcomes/study-spell-draw.int-spec.ts
commits:
  - { hash: e71f5b56, message: "test(quests): pin the magic quest type as a repeatable study" }
  - { hash: b333bdd3, message: "style(models): format quest-type.enum.ts" }
  - { hash: abcf10c0, message: "feat(quests): add the magic quest type that behaves like a study" }
---

# Quick 261110-mag: tipo di quest `magic`

## Parole dell'utente (2026-11-10)

- «Al momento la quest study presente a Valantar è la quest che potrebbe farti imparare la magia. Creiamone una nuova […] che ti permette di imparare la magia. Il rango richiesto minimo è mago […]. La vecchia quest study da ora in poi funzionerà come quest study normale. Potrebbe valer la pena aggiungere la entry "magic" al tipo di quest […]. Per il resto la quest è uguale ad una quest study normale. Non è posizionata su un POI diverso da quello della città ed è ripetibile. Il meccanismo di sblocco della magia è identico, ovvero va a probabilità.»
- «La quest potrebbe dare lore come le normali study.»
- «Niente costo in monete.» «Metti 20 ore.»

## Cosa cambia

`QuestType` guadagna `magic`, che per il BE si comporta esattamente come `study`:

- **ripetibile e senza registrazione**: `magic` entra in `REPEATABLE_TYPES` (`src/quests/acceptance/quest-eligibility.ts:33`); non è in `REGISTERED_TYPES`, quindi corsia standard, costo zero (`pointsCostOf` invariata), avvio all'arrivo come la `study`;
- **lore di studio**: `readStudyLorePool` (`src/quests/outcomes/resolution-loader.service.ts:629-630`) carica il pool delle lore di studio anche per `magic`; il tiro resta quello della study (Phase 16 D-08);
- **magia**: il sorteggio non cambia, resta governato da `prizes.spellDraw` senza alcun ramo sul tipo (D-31);
- **rango minimo**: è un dato della quest (`requirements.minTitle: 'mage'`), già applicato da `meetsTitle` (titolo maggiore o uguale al minimo per ogni tipo diverso da `story`): nessun codice nuovo;
- **generazione**: i generatori conoscono solo `enemy` e `boss` (`GeneratedQuestType`), quindi una `magic` non viene mai generata; un test lo fissa.
- `tsc` non ha trovato alcuna mappa o switch esaustivo su `QuestType` nel codice di produzione (le uniche `Record<QuestType, …>` sono nelle spec delle corsie e della ripetibilità, aggiornate). Ritoccati per coerenza (Boy Scout) i commenti che elencano i tipi senza registrazione in `src/quests/party/quest-start.service.ts:81` e `src/quests/outcomes/quest-resolution.sweeper.ts:62`.
- Nessun campo nuovo, nessuna migrazione, nessun file di contenuto, nessun costo in monete.

## File toccati

- `src/models/enums/quest-type.enum.ts`: valore `magic = 'magic'` dopo `study`. Il file non passava Prettier (virgolette doppie): formattato prima nel commit di stile separato `b333bdd3`.
- `src/quests/acceptance/quest-eligibility.ts`: `QuestType.magic` in `REPEATABLE_TYPES`, commento dei tipi senza registrazione.
- `src/quests/outcomes/resolution-loader.service.ts`: pool delle lore di studio per `study` e `magic`.
- `src/quests/party/quest-start.service.ts`, `src/quests/outcomes/quest-resolution.sweeper.ts`: solo commenti.
- Spec: `quest-eligibility.spec.ts` (tabella di ripetibilità, `isRegistered` falso, `meetsTitle` di una magic con minimo mage per paladin/mage/hero), `quest-lanes.spec.ts` (corsia standard), `quest-acceptance.service.int-spec.ts` (paladin rifiutato con `QUEST_TITLE_MISMATCH` senza scritture, mage e hero accettati senza spesa di punti), `generated-prizes.spec.ts` (i tipi generati sono solo `boss` ed `enemy`), `study-lore-draw.int-spec.ts` (una magic vinta sblocca una lore di studio), `study-spell-draw.int-spec.ts` (una magic con `spellDraw` insegna la stessa magia della study con lo stesso seme).

## RED osservati

- Unit (`quest-eligibility.spec.ts`, `quest-lanes.spec.ts`, `generated-prizes.spec.ts`): `Test Suites: 2 failed, 1 passed · Tests: 3 failed, 127 passed, 130 total` — «the lane table covers every QuestType», «the repeatability table covers every QuestType», «isRepeatable(undefined) is true» (`QuestType.magic` valeva `undefined`, `isolatedModules`).
- Verdi al primo colpo, con motivo: i tre casi `meetsTitle` della magic (la regola del minimo vale già per ogni tipo non story, e con `undefined` il ramo è lo stesso), `isRegistered(magic)` falso (nessun insieme lo contiene), «generates only enemy and boss quests, never a magic one» (guardia: la generazione non enumera altri tipi).
- Integration (`quest-acceptance.service.int-spec.ts`, `study-lore-draw.int-spec.ts`, `study-spell-draw.int-spec.ts`): `Test Suites: 3 failed · Tests: 5 failed, 121 passed, 126 total`, tutti e cinque i casi nuovi con `ValidationError: Quest validation failed: infos.type: \`magic\` is not a valid enum value for path \`type\``.

## Gate

- `npx tsc --noEmit -p tsconfig.json`: 0.
- `npx jest --selectProjects unit`: 254 suite / 3246 test verdi (prima 254 / 3239: +7).
- `npx jest src/quests --selectProjects integration --runInBand`: 34 suite / 486 test verdi (prima 34 / 481: +5).
- Boot reale `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 84/84; `git diff --exit-code src/schema.gql` pulito.
- `npx prettier --write` e `npx eslint` sui file toccati: puliti. Subject 60, 40, 64 byte, nessun trailer.

## Deviazioni

- **Lo SDL non cambia** (il brief si aspettava una riga `magic` in `enum QuestType`): `enum QuestType` non compare in `src/schema.gql`, perché nessun campo esposto lo usa — `Quest.infos.type` è dichiarato `@Field(() => String)` e l'input che usa l'enum non è raggiungibile da alcun resolver. `git diff f13c0433 -- src/schema.gql` è vuoto. Sul filo la quest magica arriva con `infos.type: "magic"`; nessuna modifica a `test/app.int-spec.ts`.
- Nessun'altra deviazione.

## Contenuto a DB (orchestratore, dopo la merge)

Collection `quests`, con i passi del runbook di `BACKEND-NOTES.md` §3 c (revisione, backup, prova a secco, applicazione dopo merge e riavvio, verifica):

1. **Quest nuova di tipo `magic`** sul POI della città di Valantar (lo stesso POI della study attuale): `requirements.minTitle: 'mage'`, `requiredPoints: null`, `infos.timeToComplete: 72000000` (20 ore), `prizes.spellDraw: true`, `xpPrize` come la study attuale; ripetibile per tipo, nessun costo in monete.
2. **Vecchia «Studi arcani a Valantar»**: `prizes.spellDraw: false`, titolo e descrizione nuovi (da quel momento è una study normale).

Prova a secco attesa: 1 quest inserita, 1 quest aggiornata.
