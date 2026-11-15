---
phase: 24-origini-delle-magie-quest-void-e-shamanic
plan: 06
subsystem: quests
tags: [quest-type, spell-schools, arcane, shamanic, void, repeatable, study-lore]
requires: ["24-05"]
provides:
  - "QuestType.arcane, QuestType.shamanic, QuestType.void al posto di QuestType.magic"
  - "src/quests/spell-schools.ts: SPELL_ORIGIN_BY_QUEST_TYPE (tre coppie esplicite), schoolOriginOf (fail-closed con Object.hasOwn), isSpellSchool"
  - "REPEATABLE_TYPES con le tre scuole; readStudyLorePool per study o scuola"
affects: [24-07, 24-10, 24-12]
tech-stack:
  added: []
  patterns: ["una tabella tipo -> origine in un modulo puro, consumata da ripetibilità, pool dello studio e (piano 07) sorteggio"]
key-files:
  created:
    - src/quests/spell-schools.ts
    - src/quests/spell-schools.spec.ts
  modified:
    - src/models/enums/quest-type.enum.ts
    - src/quests/acceptance/quest-eligibility.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/party/quest-start.service.ts
    - src/quests/outcomes/quest-resolution.sweeper.ts
    - src/quests/acceptance/quest-eligibility.spec.ts
    - src/quests/acceptance/quest-lanes.spec.ts
    - src/quests/outcomes/combatant-plan.spec.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/study-lore-draw.int-spec.ts
    - src/quests/outcomes/study-spell-draw.int-spec.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/quests/generation/generated-prizes.spec.ts
    - src/quests/party/quest-start.service.spec.ts
    - src/spells/spell-catalogue.reporter.spec.ts
decisions:
  - "magic rinominato arcane (D-20); la tabella tipo -> origine resta esplicita anche se i nomi coincidono"
  - "isSpellSchool accetta unknown: un tipo 'magic' letto da DB non è una scuola (nessun lettore lo tollera)"
metrics:
  completed: 2026-11-15
  tasks: 3
  commits: 4
---

# Phase 24 Plan 06: tipi di quest `arcane`, `shamanic`, `void` — Summary

`QuestType.magic` non esiste più: al suo posto i tre tipi di scuola `arcane`, `shamanic`, `void`, identici fra loro (ripetibili, non registrati, corsia standard, avvio all'arrivo, nessun soccorso alla sconfitta, pool di lore dello studio). La tabella esplicita tipo → origine vive in `src/quests/spell-schools.ts`, pronta per il sorteggio per origine del piano 07. Lo SDL non cambia (il tipo di quest è `String!` sul filo; boot reale senza diff).

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | e821d24a | test(quests): expect the arcane, shamanic and void school types |
| 1 GREEN | efdcdcf7 | feat(quests): rename magic to arcane and add the shamanic and void types |
| 2 | 52f48946 | test(quests): cover the start on arrival of the school types |
| 3 | (questo) | docs(phase-24): record plan 06 progress |

## Fallimenti RED attesi e osservati

- **Unit** (3 suite rosse su 10, 3 test rossi su 426): `spell-schools.spec.ts` → «Cannot find module './spell-schools'»; `quest-lanes.spec.ts` «the lane table covers every QuestType» e `quest-eligibility.spec.ts` «the repeatability table covers every QuestType» + «isRepeatable(undefined) is true» (ts-jest qui non segnala gli errori di tipo: `QuestType.arcane` vale `undefined` a runtime, quindi niente errore di compilazione ma chiavi `undefined` nelle tabelle esaustive).
- **Integration** (17 rossi su 176, 3 suite): `ValidationError` di Mongoose su `infos.type` (`arcane` 7, `shamanic` 5, `void` 5 volte: «is not a valid enum value for path `type`»), come atteso.

## Casi verdi al primo colpo (col motivo)

- `combatant-plan.spec.ts` «concludes a lost %s without aid at one life point (D-19)» sui tre tipi e `outcome-plan.spec.ts` «never teaches a spell to a rookie…» con `questOf(QuestType.arcane)`: al RED il tipo era `undefined`, che le regole trattano come un tipo qualsiasi non hunt/boss/aid; le attese non dipendono dal nome.
- `quest-eligibility.spec.ts` «a %s quest with minTitle mage admits a %s: %s (D-09, D-11)»: `meetsTitle` confronta solo i titoli, il tipo non entra (il tipo era `undefined` al RED).
- Task 2, `quest-start.service.spec.ts`: la lista `SOLO_TYPES` esisteva ma NON conteneva `magic` (lista non esaustiva). Aggiunti «starts a solo %s school quest at its arrival (D-09)» sui tre tipi e «sorts every quest type into exactly one start list (D-09)» (le quattro liste coprono `Object.values(QuestType)`): verdi al primo colpo perché la regola deriva da corsia standard + non registrata, già vera dal Task 1. Avvio all'arrivo quindi coperto da una lista (caso aggiunto), non solo per derivazione.

## Voci di `magic` fuori elenco

- `src/quests/outcomes/study-spell-draw.int-spec.ts:291`: un secondo `questOfType('magic', …)` nel caso «teaches no spell from a learnable pool when the 30% gate misses (quick 261111-sdc)» (l'interfaces del piano ne elencava uno solo): convertito ad `arcane`.
- `src/quests/outcomes/outcome-plan.spec.ts`: la riga era la 2075, non la 1977 (spostata dai piani 03-04).
- `src/spells/spell-catalogue.reporter.spec.ts` (creato nel piano 05) usava `origin: 'magic'` come origine non valida: cambiato in `'fire'` nel commit GREEN, così il grep di gate del piano resta limitato alle tre prove negative previste.

## Verifiche

- `npx jest src/quests/spell-schools.spec.ts src/quests/acceptance/quest-eligibility.spec.ts src/quests/acceptance/quest-lanes.spec.ts src/quests/outcomes/combatant-plan.spec.ts src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/aid src/quests/generation/generated-prizes.spec.ts src/spells/spell-catalogue.reporter.spec.ts --selectProjects unit`: 12 suite, 493/493.
- `npx jest src/quests/outcomes/study-lore-draw.int-spec.ts src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand`: 3 suite, 176/176.
- `npx jest src/quests/party src/quests/acceptance --selectProjects unit`: 7 suite, 275/275.
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 105/105, subito dopo `git diff --exit-code src/schema.gql` esce 0.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier ed eslint puliti sui file toccati; `grep -rn "QuestType.magic" src test` vuoto; `grep -rn "'magic'" src test` solo in `spell-origin.enum.spec.ts` e `spell-fields.int-spec.ts` (prove negative dell'origine) e `spell-schools.spec.ts`; `magic` 0 in `quest-type.enum.ts`; `isSpellSchool(` 1 in `resolution-loader.service.ts`; `QuestType.shamanic` 1 in `quest-eligibility.ts`; `pgrep -fl 'bin/jest'` vuoto.

## Deviations from Plan

- Caso di ripetibilità a livello di servizio scritto ricalcando «accepts a completed hunt again» (stessa spec): personaggio mage con la quest fra le `completedQuests`, `minTitle: mage`.
- Task 2: aggiunto oltre alla lista il caso di copertura esaustiva delle liste d'avvio (Boy Scout: la lista era rimasta senza `magic`).
- Il commento di `readSpellPool` non nominava `magic` già prima: non toccato.

## Note per il piano 07

- `schoolOriginOf(quest.infos?.type)` dà l'origine da filtrare in `readSpellPool` (oggi pesca ancora l'intero catalogo per ogni `spellDraw: true`); `null` = nessun filtro (comportamento attuale per gli altri tipi).
- I dati a DB con `infos.type: 'magic'` (la quest «Iniziazione arcana a Valantar» e le copie persistite) restano da riscrivere col migratore del piano 10: fino ad allora quei documenti falliscono la validazione enum in scrittura e non sono scuole per nessun lettore.

## Self-Check: PASSED
