---
phase: 24-origini-delle-magie-quest-void-e-shamanic
plan: 08
subsystem: spells
tags: [spell-lore, related-lore, unlocked-lore, origin]
requires: ["24-07"]
provides:
  - "Spell.relatedLore: [Lore!]! su schema (lista di id, default []) e filo, filtrata per viewer da SpellRelatedLoreResolver"
  - "SpellCandidate.relatedLore? e RewardCatalog.spells con le lore; lettura sanificante con relatedLoreIdsOf"
  - "Sblocco della lore della magia imparata in planParticipant, dentro l'unica knowledgeUpdateOf"
affects: [24-10, 24-12]
tech-stack:
  added: []
  patterns: ["lore di una magia ricalcata sulla lore dei pet: id a DB, VisibleLoreLoader sul filo, sblocco nello stesso update dell'esito"]
key-files:
  created: []
  modified:
    - src/models/spell.model.ts
    - src/lore/related-lore.resolvers.ts
    - src/lore/lore-visibility.module.ts
    - src/schema.gql
    - src/quests/outcomes/rewards/quest-rewards.ts
    - src/quests/guided/chosen-rewards.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/lore/lore-related.int-spec.ts
    - src/spells/spell-fields.int-spec.ts
    - test/app.int-spec.ts
    - src/quests/outcomes/rewards/quest-rewards.spec.ts
    - src/quests/guided/chosen-rewards.spec.ts
    - src/quests/outcomes/resolution-loader.service.spec.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/study-spell-draw.int-spec.ts
    - src/quests/outcomes/quest-resolution.service.int-spec.ts
    - src/quests/guided/guided-completion.service.int-spec.ts
decisions:
  - "Cambio SDL additivo: una sola riga `relatedLore: [Lore!]!` in type Spell"
  - "Ordine in knowledgeUpdateOf: nemici, studio, pet vinto, magia imparata (estende la D-09 della Phase 16)"
  - "RewardCatalog.spells tipizzata come Omit<SpellCandidate, 'spellId'>: una sola forma per candidato e voce di catalogo"
metrics:
  completed: 2026-11-15
  tasks: 3
  commits: 5
---

# Phase 24 Plan 08: lore dell'origine, `Spell.relatedLore` — Summary

Ogni magia porta a DB la lista `relatedLore` (id, default vuoto), servita sul filo solo per le lore che il viewer ha sbloccato (l'oste le vede tutte) da `SpellRelatedLoreResolver`, gemello di quello dei pet. Quando una magia viene imparata, per qualunque via, le sue lore entrano nell'unica `knowledgeUpdateOf` di `planParticipant`: `$addToSet` su `status.unlockedLore` per le sole novità e `QuestResult.loreUnlocked` con le stesse. La prima magia di un'origine sblocca quindi la lore dell'origine; le successive non aggiungono nulla. Nessun tiro nuovo, nessun secondo scrittore.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | cd49f43f | test(spells): expect the related lore of a spell on the wire |
| 1 GREEN | 8812bc44 | feat(spells): serve the related lore of a spell |
| 2 RED | 9dd8fbf3 | test(quests): expect a learned spell to unlock its lore |
| 2 GREEN | d304dc0c | feat(quests): unlock the lore of a learned spell |
| 3 | (questo) | docs(phase-24): record plan 08 progress |

## Riga aggiunta allo SDL

`git diff src/schema.gql` del GREEN del Task 1 mostra SOLO `+  relatedLore: [Lore!]!` in `type Spell`, fra `recoveryTime` e `requiredLearnTime` (blocco ora a undici campi, pinnato in `test/app.int-spec.ts`). Additivo: nessun client esistente si rompe.

## Come la lore sbloccata arriva al client, per via

| Via | Percorso | Provato da |
|-----|----------|------------|
| Sorteggio della quest (scuola o study con `spellDraw`) | `readSpellPool` → pool con `relatedLore` → `drawLearnableSpell` → `planParticipant` | `outcome-plan.spec` «…learned from the draw», int «unlocks the origin lore with the first spell of an origin and nothing with the second» |
| Magia fissa `prizes.spell` | `readFixedSpells` → `spellCandidateOf` → `planParticipant` | `quest-rewards.spec`, `outcome-plan.spec` «…learned fixed spell», int `quest-resolution` «unlocks the lore of the fixed spell of a quest» |
| Blocco premio per titolo | `prizeBlockFor` → `drawRewards` → `spellCandidateOf` → `planParticipant` | `outcome-plan.spec` «…learned from a rank prize block» |
| Premio dell'oste | `readRewardCatalogFor(refs, null)` → `chosenSpellOf` → `planParticipant` | `chosen-rewards.spec`, int `guided-completion` «unlocks the lore of the spell the innkeeper awards» |

In tutti i casi: `$addToSet` `status.unlockedLore` (filo: `CharacterStatus.unlockedLore: [ID!]!`, quindi subscription del personaggio) e `QuestResult.loreUnlocked: [Lore!]!` sul foglio del risultato. Anche il completamento del GM e le quest con combattimento passano da `drawRewards` + `planParticipant` (stesso meccanismo, non provato a parte).

## Fallimenti RED attesi e osservati

- **Task 1** (integration, 9 rossi su 152): i sette casi del filo → `GRAPHQL_VALIDATION_FAILED` «Cannot query field "relatedLore" on type "Spell".»; `spell-fields` → `relatedLore` assente dal documento salvato (schema strict); pin di `type Spell` senza la riga.
- **Task 2 unit** (18 rossi su 331): i casi nuovi di `quest-rewards`, `chosen-rewards` e del loader (candidato e proiezione senza `relatedLore`); in `outcome-plan.spec` i quattro casi che si aspettano la lore (fissa, sorteggio, blocco per titolo, ordine); 5 casi esistenti del loader con l'attesa aggiornata (proiezione con `relatedLore: 1`, voci con `relatedLore: []`). ts-jest non segnala i tipi: tutti rossi a runtime.
- **Task 2 integration** (3 rossi su 77): `status.unlockedLore` vuoto invece della lore dell'origine in tutte e tre le int-spec.

## Casi verdi al primo colpo (col motivo)

- `outcome-plan.spec` «unlocks nothing new when the origin lore is already unlocked (D-24)» e i quattro «unlocks no spell lore when the spell is not learned (D-24)» (sotto livello, già nota, paladin, quest persa): prima del piano non si sbloccava mai la lore di una magia, quindi l'assenza era già vera; il GREEN la conserva.

## Deviations from Plan

- **[Rule 1 - Bug di test]** il caso «on a lost quest» lanciava «failure outcome requires an aid quest»: aggiunto `aid` all'input (prima del commit RED).
- **Spec esistenti del loader aggiornate nel RED** (5 casi: proiezione e voci con `relatedLore: []`): `learnableSpellOf` porta sempre la lista sanificata, come previsto dal piano («campo assente → lista vuota»).
- `RewardCatalog.spells` tipizzata come `Omit<SpellCandidate, 'spellId'>` invece di ripetere l'oggetto letterale (zero duplicazione); `readFixedSpells` usa il resto dello spread.
- Int «unlocks the origin lore…»: la lore dell'origine è di tipo `region` (fuori dal pool dello studio) così ogni esito consuma due tiri soli; la seconda quest per lo stesso personaggio è creata con quest e richiesta nuove e la corsia standard riassegnata (helper `nextDrawingQuestFor`).
- In più rispetto al piano: «serves an empty list for a spell written without the field (D-24)» usa `insertOne` grezzo; il caso del loader prova anche una voce `null`.

## Verifiche

- `npx jest src/lore/lore-related.int-spec.ts src/spells/spell-fields.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand`: 3 suite, 152/152; `git diff --exit-code src/schema.gql` pulito dopo il commit.
- `npx jest src/quests/outcomes/rewards src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/resolution-loader.service.spec.ts src/quests/guided --selectProjects unit`: 14 suite, 331/331; `npx jest src/quests src/lore src/spells --selectProjects unit`: 94 suite, 1608/1608.
- `npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/guided/guided-completion.service.int-spec.ts --selectProjects integration --runInBand`: 3 suite, 77/77; in più `gm-completion.service.int-spec.ts` e `mission-draft.service.int-spec.ts`: 2 suite, 42/42.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier pulito ed eslint senza errori sui file toccati (warning preesistente `no-base-to-string` in `test/app.int-spec.ts`).
- Accettazione: `export class SpellRelatedLoreResolver` 1; `SpellRelatedLoreResolver` nel modulo 2; riga SDL 1; `D-24)` 7 in `lore-related.int-spec.ts`, 7 in `outcome-plan.spec.ts`, 5 in `guided-completion.service.int-spec.ts`, 1 in `study-spell-draw.int-spec.ts`; `spellLore` 2; `relatedLore: 1` 3; `knowledgeUpdateOf(` 1; `chance.next(` toccati 0; `pgrep -fl 'bin/jest'` vuoto.

## Threat model

T-24-23 (lore servita solo a chi l'ha sbloccata: casi giocatore, oste, utente senza personaggio), T-24-24 (`relatedLoreIdsOf` sanificante, lore inesistente scartata sul filo) e T-24-25 (sblocco solo con `spellLearned`, `it.each` sui quattro casi) mitigati come da piano.

## Note per i piani seguenti

- Nessun migratore per il campo: `default: []` e lettori che trattano l'assenza come «nessuna lore». Le tre lore delle origini e i collegamenti delle magie li scrive a DB l'orchestratore (handoff del piano 12).
- Per la FE: `Spell.relatedLore { id name … }` è selezionabile ovunque compaia una `Spell`; lo sblocco arriva da `status.unlockedLore` e da `QuestResult.loreUnlocked`, come per le lore dei pet.

## Self-Check: PASSED
