---
phase: 11-popolamento-del-mondo
plan: 01
subsystem: lore/enemies
tags: [lore, enemies, graphql, schema, BE-CONTENT-03, D-25]
requires: []
provides:
  - "type Lore senza `unlocked` (unica modifica SDL non additiva della fase, D-25)"
  - "src/lore/related-lore.ts: RELATED_LORE_POPULATE, withoutOrphanRelatedLore"
  - "lores / lore(id) / enemys / enemy(id) con relatedLore popolati e orfani scartati"
  - "test/fixtures/lore.fixture.ts: buildLore / persistLore"
affects: [11-13, 11-16, 11-25, 11-26]
tech-stack:
  added: []
  patterns:
    - "populate condiviso (PopulateOptions con model: Lore.name) + filtro dei null riusato da due servizi"
    - "modello Lore registrato anche nel forFeature di EnemiesModule: il populate non dipende dall'ordine dei moduli"
key-files:
  created:
    - src/lore/related-lore.ts
    - src/lore/lore-related.int-spec.ts
    - test/fixtures/lore.fixture.ts
  modified:
    - src/models/lore.model.ts
    - src/lore/lore.service.ts
    - src/enemies/enemies.service.ts
    - src/enemies/enemies.module.ts
    - test/fixtures/index.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "withoutOrphanRelatedLore riassegna relatedLore solo se contiene null/undefined (nessuna scrittura superflua sul documento Mongoose)"
  - "RELATED_LORE_POPULATE tipizzato come PopulateOptions, come QUEST_CATALOG_POPULATE"
metrics:
  duration: "~20 min"
  completed: 2026-11-02
  tasks: 2
  files: 10
---

# Phase 11 Plan 01: rimozione di `Lore.unlocked` e `relatedLore` popolati Summary

`type Lore` perde il flag globale `unlocked` (unica riga `-` dello SDL rispetto a `origin/develop`, dichiarata verbatim nel boot reale) e `LoreService`/`EnemiesService` servono `relatedLore { id name }` popolati col modello `Lore`, scartando i riferimenti pendenti invece di annullare la risposta (`data: null`, RESEARCH Pitfall 1).

## Commit

| Task | Fase TDD | Commit | Subject |
| ---- | -------- | ------ | ------- |
| 1 | RED | e3f3d25 | `test(lore): expect the lore type without the unlocked flag` |
| 1 | GREEN | 501c7cc | `feat(lore): remove the global unlocked flag from the lore` |
| 2 | RED | 1685c4a | `test(lore): expect the related lore served on the wire` |
| 2 | style | 5dbcb85 | `style(enemies): format enemies.module.ts` |
| 2 | GREEN | eda4d70 | `feat(lore): populate the related lore of lores and enemies` |

Ogni commit verificato con `git log -1 --format=%B | grep -ciE "co-authored-by|generated with"` → `0`; subject fra 40 e 58 caratteri.

## Fallimenti attesi (RED)

- Task 1: `writes the lore without the global unlocked flag (11 D-25)` rosso con il diff `+   unlocked: Boolean!` (65 passed, 1 failed); `src/schema.gql` non riscritto dal boot (`git status` pulito oltre allo spec).
- Task 2: i 4 casi di `src/lore/lore-related.int-spec.ts` rossi con `ID cannot represent value: { type: "Buffer", data: [Array] }` sui path `lores.0.relatedLore.0.id`, `lore.relatedLore.0.id`, `enemys.0.relatedLore.0.id` — esattamente il Pitfall 1.

## Verifiche (GREEN)

- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → `Tests: 66 passed, 66 total`.
- `npx jest src/lore test/app.int-spec.ts --selectProjects integration --runInBand` → `Test Suites: 2 passed`, `Tests: 70 passed, 70 total`.
- `npx jest test/fixtures --selectProjects unit` → `Tests: 21 passed, 21 total`.
- Controllo di non regressione sugli altri int-spec che importano `LoreModule`/`EnemiesModule`: `src/graphql/production-surface.int-spec.ts` + `src/validation/catalog-ids.int-spec.ts` → `Tests: 30 passed, 30 total`.
- `git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` → `-  unlocked: Boolean!` (1 riga), righe `+` = 0; `git diff --exit-code src/schema.gql` esce 0 dopo ogni commit.
- `npx tsc --noEmit -p tsconfig.json` esce 0; `pgrep -fl jest` vuoto a fine di ogni task.
- Criteri di accettazione: `path: 'relatedLore'` in `src/lore/related-lore.ts` (1 riga); `RELATED_LORE_POPULATE` 3 volte in ciascun servizio; `Lore.name` in `enemies.module.ts` (1 riga); 4 casi `it('` nell'int-spec.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `style(enemies): format enemies.module.ts` prima della modifica**
- **Found during:** Task 2
- **Issue:** `npx prettier --check src/enemies/enemies.module.ts` falliva già (file fra i non formattati noti).
- **Fix:** commit di sola formattazione Prettier separato, come chiedono le REPO-RULES; `enemies.service.ts` e `lore.service.ts` erano già conformi.
- **Commit:** 5dbcb85

### Note

- Il criterio «`grep -rn "unlocked" src test` non stampa nulla» non può essere letteralmente vero: il titolo del caso imposto dal piano stesso (`writes the lore without the global unlocked flag (11 D-25)`, `test/app.int-spec.ts:429`) contiene la parola. Nessun modello, servizio, input o SDL la contiene più; l'unica occorrenza è quel titolo.
- `npx eslint test/app.int-spec.ts` riporta 1 warning preesistente (riga 816, `no-base-to-string`), fuori scope.
- Nessun caso verde al primo colpo.

## Threat model

- T-11-01 (contratto `type Lore`): mitigato da blocco verbatim nel boot reale + gate sul diff dello SDL; il quick task FE (togliere `unlocked` da `lore_queries.dart` e `lore.dart`) resta un prerequisito della merge, da riportare nell'handoff 11-25.
- T-11-02 (ref pendenti): mitigato da populate + `withoutOrphanRelatedLore`, provato con un `ObjectId` inesistente su lista lore, singola lore, lista e singolo nemico.
- T-11-03: accettato, invariato.

## Self-Check: PASSED

- File creati presenti: `src/lore/related-lore.ts`, `src/lore/lore-related.int-spec.ts`, `test/fixtures/lore.fixture.ts`.
- Commit presenti: e3f3d25, 501c7cc, 1685c4a, 5dbcb85, eda4d70.
