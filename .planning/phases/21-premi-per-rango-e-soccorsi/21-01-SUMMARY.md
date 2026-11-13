---
phase: 21-premi-per-rango-e-soccorsi
plan: 01
subsystem: rewards
tags: [rewards, spells, titles, pure-functions, tdd]
requires: []
provides:
  - canLearnSpell(candidate, xpAfter, knownSpells, title) con isSpellCaster come primo cancello
  - drawLearnableSpell(draw, xpAfter, knownSpells, title) con lo stesso cancello
  - planParticipant passa titleAfter alle due funzioni pure
affects: [21-02, 21-03, 21-04, 21-05, 21-06, 21-07, 21-08, 21-09, 21-10, 21-11, 21-12, 21-13, 21-14]
tech-stack:
  added: []
  patterns:
    - titolo come ultimo parametro obbligatorio (nessun default silenzioso), il type check scova i chiamanti
key-files:
  created: []
  modified:
    - src/quests/outcomes/rewards/quest-rewards.ts
    - src/quests/outcomes/rewards/quest-rewards.spec.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/study-spell-draw.int-spec.ts
    - src/quests/outcomes/quest-resolution.service.int-spec.ts
decisions:
  - "Il cancello del titolo sta prima di gate, xp e magie note in entrambe le funzioni pure; i tiri di gate e roll restano consumati in drawRewards (D-05b, D-25)"
  - "Il titolo usato è titleAfter di planParticipant: una story vinta che porta a mage insegna la magia del premio (D-25)"
metrics:
  duration: ~10 min
  completed: 2026-11-13
  tasks: 2
  files: 6
---

# Phase 21 Plan 01: Magia solo ai titoli ≥ mage Summary

Cancello `isSpellCaster` come primo controllo di `canLearnSpell` e `drawLearnableSpell`, col titolo dopo l'esito passato dall'unico chiamante `planParticipant`: nessun rookie, adventurer o paladin impara una magia da nessun percorso (fissa, sorteggiata, completamento del GM) e la study di Valantar vinta da un non caster finisce nel ramo della lore dello studio, con gli stessi tiri di prima.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 2f8fdd18 | test(rewards): pin spell learning to caster titles |
| 1 GREEN | 0f069784 | feat(rewards): teach spells only to caster titles |
| 2 | (questo commit) | docs(phase-21): record plan 01 progress |

## Firme nuove

```typescript
export function canLearnSpell(candidate: SpellCandidate | null, xpAfter: number, knownSpells: readonly unknown[], title: TitleType | null | undefined): Types.ObjectId | null;
export function drawLearnableSpell(draw: SpellDraw | null, xpAfter: number, knownSpells: readonly unknown[], title: TitleType | null | undefined): SpellCandidate | null;
```

`npx tsc` dopo il GREEN: nessun altro chiamante oltre a `planParticipant` (come da RESEARCH §Q6).

## RED (fallimenti attesi)

- `quest-rewards.spec.ts` (`describe('spell learning by title')`): 7 rossi — fissa a rookie, adventurer, paladin, `null`, `undefined`; sorteggio a rookie e paladin (tutti imparavano ancora la magia).
- `outcome-plan.spec.ts` (`describe('spell learning by title')`): 4 rossi — i tre percorsi del rookie (fissa, sorteggio con gate 0.1, `gmCompleted`) e la study vinta dal paladin che doveva andare alla lore.
- `study-spell-draw.int-spec.ts`: 1 rosso — `teaches the Valantar spell only to a caster (D-05b, D-25): rookie` (il rookie imparava la magia).

Verdi al primo colpo (motivo):
- `teaches a fixed spell only to a caster title`: mage, hero, legend — il comportamento di oggi per i caster è già quello voluto.
- `draws a learnable spell only for a caster title`: mage — idem (con `roll` 0.99 sceglie il secondo candidato come oggi).
- `keeps the xp and known spell gates for casters (D-05b)` — pinna i cancelli già esistenti.
- `uses the title after the outcome to teach a spell (D-25)` — senza cancello la story insegnava già la magia; il caso diventa significativo solo col GREEN (prova che il cancello usa `titleAfter` e non il titolo di partenza paladin).
- `teaches the Valantar spell only to a caster (D-05b, D-25): mage` — comportamento di oggi; pinna anche i 4 tiri `[0, 0, 0.1, 0]` (sorteggio e lore dello studio consumati comunque).

## Spec portate a mage

- `outcome-plan.spec.ts`: helper `asMage(overrides)` in testa; usato in `composes spending and learning in one spell state`, in tutto `describe('spell learning on a won study')` (helper `studyWith`, più `learns the drawn spell when the quest draws one (D-31)` e `never draws a spell that already has a state (D-07, D-31)`), e in `learns no study lore when a spell is learned (D-08)`.
- `study-spell-draw.int-spec.ts`: il quester di base (`quester()`) è un mage (`title: 'mage'` sopra `FRESH_STATUS`, sovrascrivibile); tocca tutti i casi del file, il nuovo caso passa `rookie` esplicitamente.
- `quest-resolution.service.int-spec.ts`: costante `CASTER_TITLE = 'mage'` usata in `cures and teaches on a study that carries a cure (D-07)`, `teaches the study spell when the xp after the prize is enough`, `teaches no spell whose catalog entry has no max usages`, `teaches nothing when the xp after the prize is not enough` (gli ultimi due a mage perché continuino a provare il loro cancello e non quello del titolo).

Nessuna spec fuori dai file del piano è caduta: `study-lore-draw.int-spec.ts` e `gm-completion.service.int-spec.ts` verdi senza modifiche (nessun loro caso insegna una magia a un rookie).

## Verifica

- `npx jest src/quests/outcomes --selectProjects unit`: 35 suite, 669 test verdi.
- `npx jest study-spell-draw, study-lore-draw, quest-resolution.service, gm-completion.service --selectProjects integration --runInBand`: 4 suite, 65 test verdi.
- `npx tsc --noEmit -p tsconfig.json`: 0. Prettier ed ESLint puliti sui file toccati. `git diff --exit-code src/schema.gql`: vuoto.
- Accettazione: `isSpellCaster` in `quest-rewards.ts` = 3 (import + due usi); `titleAfter` in `outcome-plan.ts` da 4 a 6; `D-25)` = 2 in `quest-rewards.spec.ts`, 1 in `study-spell-draw.int-spec.ts`; `D-05c)` = 1 in `outcome-plan.spec.ts`; `pgrep -fl 'bin/jest'` vuoto.

## Comportamento nuovo da dichiarare nel handoff

Una study di Valantar (o una `magic` col sorteggio) vinta da un non caster non impara la magia e, se lo studio ha un pool di lore, sblocca la lore dello studio al suo posto (RESEARCH §Q6 effetto (a)).

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File modificati presenti; commit 2f8fdd18 e 0f069784 presenti in `git log`.
