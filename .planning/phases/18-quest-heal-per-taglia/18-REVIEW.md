---
phase: 18-quest-heal-per-taglia
reviewed: 2026-11-10
depth: standard (due reviewer paralleli per area — A cura delle quest e heal senza effetto; B pozioni dal Diario, lore per viewer, codici e formatter)
files_reviewed: 58
findings:
  critical: 0
  warning: 3
  info: 11
  total: 14
status: issues_found
---

# Code review — Phase 18 Quest heal per taglia (piani 18-01..18-10)

I due report di gruppo sono la fonte: [`18-REVIEW-A.md`](./18-REVIEW-A.md) (0 critical, 1 warning, 4 info) e [`18-REVIEW-B.md`](./18-REVIEW-B.md) (0 critical, 2 warning, 7 info). Il ruling dell'orchestratore per ogni finding è in [`18-REVIEW-RULINGS.md`](./18-REVIEW-RULINGS.md); i fix sono registrati in `18-REVIEW-FIX.md`.

| ID | Severità | File | Affermazione |
|----|----------|------|--------------|
| A-WR-01 | warning | `src/models/quest/quest-prizes.model.ts` | la cura servita sul filo non è sanificata come le altre letture |
| A-IN-01 | info | `src/quests/no-effect/viewer-vitals.service.ts` | nessuna prova per il personaggio legacy né per la parità rifiuto ↔ campo |
| A-IN-02 | info | `src/quests/quest-updated.subscription.int-spec.ts` | fra due eventi cambia solo la lista delle ferite, mai la vita |
| A-IN-03 | info | `src/quests/no-effect/viewer-vitals.service.ts` | scheletro della memo duplicato e un campo di proiezione forse superfluo |
| A-IN-04 | info | `src/quests/quests.resolver.int-spec.ts` | asserzione fragile sul numero di letture dell'utente |
| B-WR-01 | warning | `src/characters/items/item-use.plan.ts` | il filtro di scrittura diverge dal piano su dati scritti a mano |
| B-WR-02 | warning | `src/models/loot-item.model.ts` | tempi di ricarica senza tetto a 32 bit |
| B-IN-01 | info | `src/characters/items/item-use.plan.ts` | una bevuta può abbassare la vita se supera il massimo |
| B-IN-02 | info | `src/characters/items/item-use.service.int-spec.ts` | prova della corsa non deterministica |
| B-IN-03 | info | `src/graphql/production-surface.int-spec.ts` | il rifiuto con la data non è provato su graphql-ws |
| B-IN-04 | info | `src/models/loot-item.model.ts` | commento stantio |
| B-IN-05 | info | `src/characters/items/item-use.service.ts` | lore orfane nel personaggio e lettura dopo il commit |
| B-IN-06 | info | `src/models/loot-item.model.ts` | input senza superficie (deciso da D-24) |
| B-IN-07 | info | `src/graphql/production-surface.int-spec.ts` | costante duplicata della data della sonda |
