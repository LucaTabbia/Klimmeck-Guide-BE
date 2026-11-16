---
phase: 24-origini-delle-magie-quest-void-e-shamanic
plan: 04
subsystem: gm
tags: [spell-gate, min-level, innkeeper, mission-prizes, fail-closed]
requires: ["24-03"]
provides:
  - "SpellCatalogueEntry.minLevelToLearn e MissionPrizeOptionsInput.level (nessun campo xp residuo)"
  - "learnableSpells filtra con isReachedLevel (isLearnLevel && minLevelToLearn <= level) e magia non nota"
  - "allowanceFor passa level: levelRowFor(status.xp ?? 0).level, mai status.level"
  - "readCatalogue proietta { minLevelToLearn: 1 }"
  - "isLearnLevel esportato da quest-rewards.ts, condiviso da resolution-loader e mission-prizes"
affects: [24-05, 24-07, 24-10]
tech-stack:
  added: []
  patterns: ["un solo predicato del livello minimo letto lean per quest e oste"]
key-files:
  created: []
  modified:
    - src/quests/guided/mission-prizes.ts
    - src/quests/guided/mission-prize-options.service.ts
    - src/quests/outcomes/rewards/quest-rewards.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/guided/mission-prizes.spec.ts
    - src/quests/guided/guided-mission.resolver.int-spec.ts
    - src/quests/guided/mission-draft-save.service.int-spec.ts
    - src/quests/guided/guided-completion.service.int-spec.ts
decisions:
  - "Livello dell'oste = livello PRIMA dell'esito (come prima l'xp prima dell'esito); il cancello finale resta planParticipant"
  - "isLearnLevel spostato da resolution-loader.service.ts a quest-rewards.ts ed esportato: una sola regola di validità per quest e oste"
metrics:
  completed: 2026-11-15
  tasks: 2
  commits: 3
---

# Phase 24 Plan 04: cancello a livello nelle opzioni dell'oste — Summary

Le opzioni dei premi dell'oste offrono una magia solo se il livello del personaggio, derivato dall'xp con la tabella unica (`levelRowFor`), raggiunge il suo `minLevelToLearn`; la stessa `missionPrizeOptionsOf` rivalida al salvataggio della bozza e al completamento. Un livello minimo non intero o sotto 1 non è mai offerto; nessun filtro per origine (story e worldMission non sono scuole); SDL invariato. Sotto `src/quests` il campo vecchio resta solo in `src/quests/quests.resolver.int-spec.ts` (piano 05).

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 44af9bca | test(gm): expect the innkeeper spell options gated on the level |
| 1 GREEN | 394a8402 | feat(gm): gate the innkeeper spell options on the character level |
| 2 | (questo) | docs(phase-24): record plan 04 progress |

## Fallimenti RED attesi e osservati

- **Unit** `mission-prizes.spec.ts` (3 rossi su 13): nessun errore di compilazione (ts-jest qui non li segnala): il codice leggeva ancora `minXpToLearn` (undefined) e `xp` (undefined), quindi nessuna magia offerta. Rossi: «offers spells only to casters at their minimum level and not known yet (D-08)», «offers a spell exactly at its minimum level and not one level below (D-08)», «refuses a prize outside the allowance (D-07)» (la magia `cheap` non era più ammessa).
- **Integration** (5 rossi su 75): Meteora (`minLevelToLearn: 13`) offerta al mago a 20 000 xp perché il servizio guardava `minXpToLearn` della fixture (0): «serves the block and the filtered catalogue of a mage (D-07, D-22)», «offers the innkeeper a spell at the level the character has from the level table (D-08)», «reads the level from the xp and not from the stored level (D-08)»; magia sopra il livello accettata al salvataggio («refuses a chosen spell above the level of the character at save (D-08)») e al completamento («refuses at completion a chosen spell above the level of the character (D-08)»). Come atteso.

## Casi verdi al primo colpo (col motivo)

- `mission-prizes.spec.ts` «never offers a spell whose minimum level is not an integer of at least one (D-08)» (6 `it.each`): col codice vecchio il campo nuovo era ignorato e nessuna magia era offerta, quindi l'assenza era già vera.
- «serves no catalogue spell to a paladin (D-07)» e gli altri casi esistenti delle tre int-spec: il blocco per titolo e il paladino non dipendono dal livello.

## Mappa xp → livello dei valori delle spec

| Spec | Vecchio `minXpToLearn` | Nuovo `minLevelToLearn` | Significato conservato |
|------|------------------------|-------------------------|------------------------|
| mission-prizes.spec | `costly` 500 / `cheap` 100 / `exact` 300 / `known` 50 / `malformed` `'100'` | 8 / 2 / 6 / 1 / `'2'` | `optionsOf` di base passa da `xp = 300` a `level = 6`: `exact` è il confine esatto, `costly` sopra |
| mission-prizes.spec (paladino) | xp 99999 | livello 20 | nessuna magia a un non caster |
| guided-mission.resolver.int-spec (mago a 20 000 xp = livello 12) | Scintilla 100 / Meteora 999999 / Lampo 100 / Benedizione 0 | 2 / 13 / 2 / 1 | Meteora sopra il livello del mago |
| mission-draft-save.service.int-spec (mago a 20 000 xp) | Scintilla 100 / Benedizione 0 | 2 / 1 | |
| guided-completion.service.int-spec (mage a 0 xp = livello 1) | Scintilla 0 | 1 | |

## Casi nuovi

- `mission-prizes.spec.ts`: confine livello 6 / 5 su `exact` e `it.each` fail-closed su `'2'`, `0`, `2.5`, `null`, `undefined`, `NaN` anche a livello 20.
- `guided-mission.resolver.int-spec.ts`: Tempesta a livello 12 offerta e Meteora a 13 no al mago a 20 000 xp; con `status.level: 20` scritto a mano Meteora resta fuori (Pitfall 5).
- `mission-draft-save.service.int-spec.ts`: magia a livello 13 scelta per il mago → `OUTCOME_OVERRIDE_INVALID`, bozza invariata.
- `guided-completion.service.int-spec.ts`: magia scelta al livello 1, poi portata a livello 2 a DB → completamento rifiutato con `OUTCOME_OVERRIDE_INVALID`, nessuna scrittura (stesso schema del caso esistente «refuses a prize no longer allowed without writing»).

## Verifiche

- `npx jest src/quests/guided --selectProjects unit`: 10 suite, 80/80; con `src/quests/outcomes/resolution-loader.service.spec.ts src/quests/outcomes/rewards` (per lo spostamento di `isLearnLevel`): 13 suite, 186/186.
- `npx jest src/quests/guided/guided-mission.resolver.int-spec.ts src/quests/guided/mission-draft-save.service.int-spec.ts src/quests/guided/guided-completion.service.int-spec.ts --selectProjects integration --runInBand`: 3 suite, 75/75.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier ed eslint puliti sui file toccati; `git diff --exit-code src/schema.gql` pulito; `grep -rl minXpToLearn src/quests` → solo `src/quests/quests.resolver.int-spec.ts`; `levelRowFor(` 1 e `status.level` 0 in `mission-prize-options.service.ts`; `pgrep -fl 'bin/jest'` vuoto.

## Deviations from Plan

- **[Boy Scout / zero duplicazione] `isLearnLevel` condiviso:** il predicato «intero ≥ 1» del piano 03 era locale a `resolution-loader.service.ts`; per non duplicarlo in `mission-prizes.ts` è stato spostato ed esportato da `src/quests/outcomes/rewards/quest-rewards.ts` (già importato da entrambi). Due file fuori da `files_modified` (`quest-rewards.ts`, `resolution-loader.service.ts`), comportamento invariato, provato dalle spec del piano 03 (unit verdi). `mission-prizes.ts` lo compone in `isReachedLevel(minLevelToLearn, level)`.
- Il caso del livello salvato scrive `status.level: 20` con un update diretto sulla collection invece di un parametro nuovo di `mageAndPaladin`.

Nessun'altra deviazione.

## Note per i piani seguenti

- Piano 05: sotto `src/quests` resta solo `src/quests/quests.resolver.int-spec.ts` con `minXpToLearn` (documento GraphQL); fuori da `src/quests` restano modello, SDL, `buildSpell` (default `minXpToLearn: 0`) e `test/app.int-spec.ts` / `src/spells/spell-fields.int-spec.ts`. Nessun lettore di produzione legge più `minXpToLearn` fuori dal modello.
- `isLearnLevel` è in `quest-rewards.ts`: il reporter del catalogo del piano 05 e il migratore del piano 10 possono riusarlo.

## Self-Check: PASSED
