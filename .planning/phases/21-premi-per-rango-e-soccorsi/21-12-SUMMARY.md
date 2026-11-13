---
phase: 21-premi-per-rango-e-soccorsi
plan: 12
subsystem: quests
tags: [graphql, sdl, wire, prizes, dungeon-turns, tdd]
requires:
  - 21-11
provides:
  - QuestPrizesResolver (src/quests/prizes/quest-prizes.resolver.ts): Quest.prizes per viewer, Quest.rankPrizes
  - QuestRankPrizes @ObjectType (src/quests/prizes/quest-rank-prizes.type.ts)
  - ViewerSubject (HealSubject + title) da ViewerVitalsService.of
  - enum DungeonTurnKind registrato; turnsTotal, turnsCompleted, lastTurn, lastTurnKind sul filo in QuestResult
  - src/schema.gql additivo, verbatim RESEARCH §Q7
affects: [21-13, 21-14]
tech-stack:
  added: []
  patterns:
    - campo risolto per viewer con la memo per viewer dentro la chiave dell'evento (stesso servizio di noEffect, nessuna seconda lettura)
    - "@ResolveField che sovrascrive un @Field della classe senza mutare il parent condiviso del payload WS"
key-files:
  created:
    - src/quests/prizes/quest-prizes.resolver.ts
    - src/quests/prizes/quest-rank-prizes.type.ts
  modified:
    - src/quests/no-effect/viewer-vitals.service.ts
    - src/quests/no-effect/viewer-vitals.service.spec.ts
    - src/quests/quests.module.ts
    - src/quests/quests.resolver.int-spec.ts
    - src/quests/quest-updated.subscription.int-spec.ts
    - src/models/enums/dungeon-turn-kind.enum.ts
    - src/models/quest-result/quest-result.model.ts
    - src/quests/results/quest-result.resolver.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "Quest.prizes = prizeBlockFor(quest, titolo del viewer) ?? premio vuoto; il titolo arriva da ViewerVitalsService (stessa memo per viewer di noEffect); senza personaggio vale il minTitle (D-07, D-18, D-22)"
  - "Quest.rankPrizes = rankBlocksOf(quest) mappato in { title, prizes: blocco }: [] per solitarie e boss legacy (D-22, D-28)"
  - "Premio vuoto di ripiego per un parent senza prizes (PendingQuest.quest non popolato): tutti i campi null, randomLoot []"
  - "QuestRankPrizes.prizes tipizzato in TypeScript come PrizesSnapshot (decoratore QuestPrizes): il blocco si serve com'è, senza cast"
metrics:
  duration: ~45 min
  completed: 2026-11-13
---

# Phase 21 Plan 12: Premio per viewer, blocchi e turni sul filo Summary

Il filo resta additivo: `Quest.prizes` diventa il blocco del titolo del personaggio corrente del bearer (HTTP e ogni subscriber WS, memo per viewer dentro l'evento), si aggiungono `Quest.rankPrizes`, `type QuestRankPrizes`, `enum DungeonTurnKind` e i quattro contatori dei turni nullable su `QuestResult`; `src/schema.gql` rigenerato dal boot reale di test ha rispetto a `1f9db973` solo righe aggiunte.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 03ff7045 | test(quests): pin the viewer prize block on the wire |
| 1 GREEN | 854bb223 | feat(quests): resolve the prize block for each viewer |
| 2 RED | 83f03125 | test(test): pin the additive schema of the dungeon turns |
| 2 GREEN | 0d3e26dd | feat(quests): expose the dungeon turn counters |
| 3 | (questo commit) | docs(phase-21): record plan 12 progress |

## SDL aggiunto (verbatim RESEARCH §Q7)

```graphql
enum DungeonTurnKind {
  exploration
  fight
}

type Quest {
  id: ID!
  infos: QuestInfos!
  noEffect: Boolean!
  prizes: QuestPrizes!
  rankPrizes: [QuestRankPrizes!]!
  registeredAdventurers: [QuestRegistration!]!
  requirements: QuestRequirements!
}

type QuestRankPrizes {
  prizes: QuestPrizes!
  title: String!
}
```

In `type QuestResult`: `lastTurn: Int` e `lastTurnKind: DungeonTurnKind` dopo `kind`, `turnsCompleted: Int` e `turnsTotal: Int` dopo `titleBefore`. `type QuestPrizes` identico (7 campi), `stagesCleared` / `stagesTotal` invariati.

Diff da `1f9db973`: `git diff 1f9db973 -- src/schema.gql | grep -cE '^-[^-]'` = `0` (verificato dopo ciascuno dei due GREEN; `1f9db973` antenato di HEAD). Il `toContain` di `noEffect: Boolean!` in `test/app.int-spec.ts` non è stato toccato.

## Fallimenti RED attesi

Task 1 (03ff7045):
- unit `viewer-vitals.service.spec.ts`: 2 rossi (il nuovo caso D-18 e il caso legacy aggiornato con `title`): `of` non restituiva il titolo.
- `test/app.int-spec.ts`: 3 rossi (due stringhe esatte di `type Quest` senza `rankPrizes`, `type QuestRankPrizes` assente).
- `quests.resolver.int-spec.ts`: 6 rossi. Blocco per titolo, minTitle senza personaggio, legend → hero e pet orfano: `xpPrize` 10 (campo grezzo) invece del blocco; `rankPrizes`: `GRAPHQL_VALIDATION_FAILED` (campo inesistente); premio vuoto: «Cannot return null for non-nullable field Quest.prizes» su `pendingQuests { quest { prizes } }`.
- `quest-updated.subscription.int-spec.ts`: 1 rosso (blocco per subscriber).
- Verdi al RED, come previsto dal piano (servono a fermare la regressione B1 del campo grezzo): `keeps the single prize of a solo quest on the wire (D-01)` e `keeps the single prize of a solo quest on the event (D-01)`.

Task 2 (83f03125):
- `test/app.int-spec.ts`: 2 rossi (`type QuestResult` senza i quattro campi, `enum DungeonTurnKind` assente).
- `quest-result.resolver.int-spec.ts`: 2 rossi (`Cannot query field "turnsTotal" …` per i quattro campi). Verde al RED: `keeps the rewards of each participant in the same shape (D-08)` (pinna la forma invariata).

## Prove

- HTTP: mage e paladin vedono ognuno il proprio blocco sullo stesso boss misto (monete, xp, loot, pet); utente senza personaggio su `quest(id)` → blocco del minTitle (paladin); legend su boss hero coi soli blocchi hero → blocco hero; `rankPrizes` `[mage, paladin]` nell'ordine a DB, `[]` per hunt e boss legacy; pet orfano in un blocco → lista viva, `pet` null; hunt idratata → `xpPrize` e `randomLoot` intere (toEqual sull'intera lista).
- Parent senza premi: `pendingQuests { quest { prizes } }` (innkeeper, `PendingQuestsModule` aggiunto all'harness) → premio vuoto, nessun errore.
- WS: due subscriber di titolo diverso sullo stesso `questUpdated` ricevono ognuno il proprio blocco; il payload pubblicato (letto da una sottoscrizione interna al PubSub dopo i due eventi) ha ancora `prizes.xpPrize` 10 e i due blocchi intatti: il resolver non muta il parent. Hunt su `questUpdated` → premio unico intero.
- Esiti: dungeon seminata 8/5/5/exploration → i quattro valori; hunt → quattro `null`; `rewards` invariato.

## Esiti

- unit `src/quests/no-effect`: 1 suite / 7 test.
- integration Task 1 (`app.int-spec`, `quests.resolver`, `quest-updated.subscription`, `quest-board`): 4 suite / 146 test.
- integration Task 2 (`app.int-spec`, `quest-result.resolver`, `quest-result-received.subscription`): 3 suite / 123 test.
- non regressione unit `src/models`, `src/quests/outcomes/dungeon`, `src/quests/no-effect`, `src/quests/prizes`: 28 suite / 229 test.
- `npx tsc --noEmit -p tsconfig.json` = 0 a fine di ogni task; prettier ed eslint puliti sui file toccati (unico avviso preesistente in `test/app.int-spec.ts` riga ~1066, `no-base-to-string`, fuori scope).

## Deviations from Plan

- **[Scelta di tipo, nessun effetto sul filo] `QuestRankPrizes.prizes`** è tipizzato in TypeScript `PrizesSnapshot` (decoratore `@Field(() => QuestPrizes)`), e `QuestPrizesResolver.prizes` restituisce `Promise<PrizesSnapshot>`: un `RankPrizeBlock` non è strutturalmente un `QuestPrizes` della classe Mongoose; così niente cast. Lo SDL è quello del contratto.
- **Harness di `quests.resolver.int-spec.ts`**: aggiunto `PendingQuestsModule` agli import per provare il parent senza `prizes` sul percorso reale (`pendingQuests`).

Nessuna spec fuori dai file del piano corretta.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova oltre al threat model: nessun argomento nuovo su `quests`, il titolo arriva solo dal bearer (T-21-36), la scelta del blocco è la stessa `prizeBlockFor` della risoluzione (T-21-37), memo per viewer dentro la chiave dell'evento e parent mai mutato (T-21-35, provato col caso a due subscriber).

## Self-Check: PASSED

- File creati presenti: `src/quests/prizes/quest-prizes.resolver.ts`, `src/quests/prizes/quest-rank-prizes.type.ts`.
- Commit presenti: 03ff7045, 854bb223, 83f03125, 0d3e26dd.
