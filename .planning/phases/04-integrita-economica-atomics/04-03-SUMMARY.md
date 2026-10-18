---
phase: 04-integrita-economica-atomics
plan: 03
subsystem: characters
tags: [atomics, equipSpell, unequipSpell, equipItem, conditional-update, concurrency, objectid, tdd]
requires:
  - 04-01 (maxActiveSpellsExpression / maxActiveSpellsFor, objectIdFromHex, GameRuleException)
provides:
  - "src/characters/spells/active-spell.updates.ts: equip/unequip/use/recover builders ObjectId-typed, $inc posizionali, 3 classificatori dei rifiuti, ACTIVE_SPELL_SNAPSHOT_PROJECTION + ActiveSpellSnapshot"
  - "src/characters/equipment/equip-item.updates.ts: equipItemFilter / equipItemUpdate / classifyEquipItemFailure"
  - "src/characters/character-id.ts: requireCharacterObjectId (id malformato → NOT_FOUND)"
  - "CharactersService.equipSpell / unequipSpell / equipItem a update singolo condizionale"
affects: [04-05 (useSpell + spell recovery usano useSpellFilter/recoverSpellFilter/$inc e classifyUseSpellFailure), 04-09 (BACKEND-NOTES: unequipSpell NOT_FOUND → SPELL_NOT_ACTIVE, EquipSpellRequest.usages ignorato)]
tech-stack:
  added: []
  patterns:
    - "Il filtro è la regola: updateOne condizionale, matchedCount 0 → rilettura lean proiettata solo per scegliere il codice (fail-closed sul codice di contesa)"
    - "Capacità valutata sul documento vivo: $expr $lt [$size $ifNull activeSpells, $switch(xp)]"
key-files:
  created:
    - src/characters/spells/active-spell.updates.ts
    - src/characters/spells/active-spell.updates.spec.ts
    - src/characters/spells/equip-spell.int-spec.ts
    - src/characters/equipment/equip-item.updates.ts
    - src/characters/equipment/equip-item.updates.spec.ts
    - src/characters/equipment/equip-item.int-spec.ts
    - src/characters/character-id.ts
    - src/characters/character-id.spec.ts
  modified:
    - src/characters/characters.service.ts
    - src/characters/characters.service.spec.ts
    - src/authz/audit/admin-audit.int-spec.ts
    - src/authz/audit/admin-audit.interceptor.spec.ts
    - src/authz/resource-not-found.exception.ts
    - src/authz/resource-not-found.exception.spec.ts
decisions:
  - "classifyUnequipSpellFailure prende solo lo snapshot: l'unica guard di unequip è 'attiva', uno spellId inutilizzato avrebbe richiesto un eslint-disable"
  - "sameId confronta via toString() esplicito (no String(unknown), evita no-base-to-string) per coprire id legacy salvati come stringa"
  - "spellId malformato: equipSpell → SPELL_NOT_KNOWN, unequipSpell → SPELL_NOT_ACTIVE, itemId malformato → ITEM_NOT_OWNED, senza toccare il DB"
metrics:
  duration: ~15 min
  completed: 2026-10-18
  tasks: 3
  files: 14
---

# Phase 4 Plan 03: equipSpell / unequipSpell / equipItem atomici Summary

`equipSpell`, `unequipSpell` ed `equipItem` sono ora ciascuna un solo `updateOne` condizionale sul Character (nessun `findOne` + `save()`): la capacità delle magie attive è valutata dal `$switch` sull'xp vivo nello stesso update, gli usages iniziali arrivano dal catalogo `spell.maxUsages`, `unequipSpell` risponde `SPELL_NOT_ACTIVE`, `equipItem` richiede il possesso in `assets.ownedEquipments`. Tutti i builder ricevono e scrivono `Types.ObjectId`.

## Tasks

| Task | Name | RED commit | GREEN commit |
| ---- | ---- | ---------- | ------------ |
| 1 | Builder ObjectId-typed + classificatori + requireCharacterObjectId | 5672d88 | eb581da |
| 2 | equipSpell / unequipSpell a update singolo, prova SC4 sul wire | 6705e2b | 816202e |
| 3 | equipItem condizionato al possesso + rimozione `activeSpell()` | 2401f8f | 4fa0f1e |

Nessun commit REFACTOR necessario.

## RED evidence

- **Task 1:** `npx jest src/characters/spells src/characters/equipment src/characters/character-id --selectProjects unit` → 3 suite fallite su 3, `Cannot find module './active-spell.updates'` / `'./equip-item.updates'` / `'./character-id'`.
- **Task 2:** `npx jest src/characters/spells/equip-spell.int-spec.ts --selectProjects integration --runInBand` → 8 failed, 3 passed / 11:
  - caso 1: `Expected: 3, Received: 99` (usages del client salvato)
  - casi 2/3/4: `Received: "BAD_REQUEST"` invece di `SPELL_NOT_KNOWN` / `SPELL_ALREADY_ACTIVE` / `MAX_ACTIVE_SPELLS_REACHED`
  - caso 5: `Received: undefined` (nessun NOT_FOUND per spell mancante dal catalogo: il vecchio codice equipaggiava)
  - caso 6: un perdente con `BAD_REQUEST` (fuori da `['MAX_ACTIVE_SPELLS_REACHED', 'SPELL_ALREADY_ACTIVE']`)
  - casi 10/11: `Received: "NOT_FOUND"` invece di `SPELL_NOT_ACTIVE`
  - passati col vecchio codice: caso 7 (6 equip concorrenti a capacità 2: in questa esecuzione il vecchio read-modify-write non ha prodotto overflow, la corsa non è deterministica), caso 8 (parità espressione: non tocca il service), caso 9 (happy path unequip).
  - Unit `characters.service.spec.ts`: 6 failed (nuovi casi equip/unequip), 8 passed. Audit int-spec: 1 failed (`records the error code of a failed on-behalf mutation`, atteso `SPELL_NOT_ACTIVE`).
- **Task 3:** `npx jest src/characters/equipment/equip-item.int-spec.ts --selectProjects integration --runInBand` → 2 failed (casi 2 e 4: `Expected: "ITEM_NOT_OWNED", Received: undefined`, il vecchio codice equipaggia qualunque id), 2 passed. Unit: 2 failed (archived equipItem via `updateOne`/`exists`, nuovo ITEM_NOT_OWNED).

## Verification (GREEN)

- Task 1: unit 3 suite / 26 test; `tsc --noEmit -p tsconfig.build.json` ok; eslint pulito sui 6 file.
- Task 2: `npx jest src/characters src/authz --selectProjects integration --runInBand` 12 suite / 182 test; `npx jest src/characters --selectProjects unit` 14 suite / 159 test; tsc ok; eslint 0 errori (solo warning pre-esistenti di change stream / doTransaction / useSpell).
- Task 3: integration `src/characters src/authz` 13 suite / 186 test (ownership, archived visibility, subscription, audit inclusi); unit `src/characters src/authz` 22 suite / 236 test; tsc ok; eslint 0 errori.
- Plan verification: `npx jest src --selectProjects unit` 51 suite / 567 test; `git diff --exit-code develop -- src/schema.gql` = 0.
- **Concorrenza (SC4):** 4 `equipSpell` concorrenti a capacità 1 → 1 successo, 3 rifiuti in `{MAX_ACTIVE_SPELLS_REACHED, SPELL_ALREADY_ACTIVE}`, `activeSpells.length === 1`; 6 concorrenti a capacità 2 → 2 successi, 2 spell distinte; 3 `unequipSpell` concorrenti → 1 successo, 2 `SPELL_NOT_ACTIVE`. Parità `$switch` ↔ `maxActiveSpellsFor` su 9 soglie di xp.
- Acceptance grep (con `grep -F` per i pattern con `$`): `$ifNull: ['$assets.activeSpells', []]` 1, `maxActiveSpellsExpression()` 1, `$.usages': -1` 1, `$.usages': 1` 1, `usages: { $lt: maxUsages }` 1, classificatori esportati 3, `'assets.ownedEquipments.item': itemId` 1, `requireCharacterObjectId(` 1, `as any` 0; `equipSpellFilter(characterId, spellId)` / `unequipSpellFilter(characterId, spellId)` / `equipItemFilter(characterId, itemId)` 1 ciascuno (dopo prettier gli argomenti sono a capo dentro `.updateOne(`), `request.usages` 0, vecchi messaggi inglesi 0, `Promise.all` 3, `'SPELL_NOT_ACTIVE'` nell'audit 2, `activeSpell()` in src/test 0, `.save()` nel service 2, `'ITEM_NOT_OWNED'` 3, `$type: 'objectId'` 1; int-spec equip-spell 407 righe (≥ 150).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Clean Code] `classifyUnequipSpellFailure(snapshot)` senza secondo parametro**
- **Found during:** Task 1 GREEN
- **Issue:** il plan prevede `(snapshot, spellId)`, ma lo spellId non è usato (eslint `no-unused-vars`); tenerlo richiedeva un `eslint-disable`.
- **Fix:** firma a un solo argomento; spec del Task 1 e chiamata nel service adeguate. Comportamento invariato.
- **Files modified:** src/characters/spells/active-spell.updates.ts, src/characters/spells/active-spell.updates.spec.ts
- **Commit:** eb581da

**2. [Rule 1 - Lint] `sameId` senza `String(unknown)`**
- **Found during:** Task 1 GREEN
- **Issue:** `String(value)` su `unknown` dava warning `no-base-to-string`.
- **Fix:** `(value as { toString(): string }).toString()`, come `documentIdOf` in `src/mongo/document-id.ts`.
- **Commit:** eb581da

**3. [Boy Scout] Import inutilizzato `BadRequestException` rimosso da `characters.service.spec.ts`** (i test che lo usavano sono stati riscritti). Commit 6705e2b.

Note minori: le modifiche di `resource-not-found.exception.spec.ts` e `admin-audit.interceptor.spec.ts` (da `activeSpell()` a `spell()`) sono nel commit RED del Task 3 perché sono solo test; la rimozione della factory è nel GREEN.

## Known Stubs

None.

## Threat Flags

None: nessuna superficie nuova oltre al threat model (schema invariato, nessun resolver nuovo). T-04-03-01..05 e 07 mitigati come da piano (casi wire 1, 2, 4, 6, 7; ITEM_NOT_OWNED casi 2 e 4; asserzioni `$type: 'objectId'`; messaggi costanti senza id; `deletedAt: null` in ogni builder).

## Notes for later plans

- 04-05: `useSpellFilter`, `recoverSpellFilter`, `DECREMENT_/INCREMENT_ACTIVE_SPELL_USAGE`, `classifyUseSpellFailure(snapshot, spellId)` e il privato `readActiveSpellSnapshot` del service sono pronti; `useSpell` usa ancora `findOne` + `save()` e `BadRequestException`.
- 04-09 (BACKEND-NOTES / FE): `unequipSpell` su magia non attiva passa da `NOT_FOUND` a `SPELL_NOT_ACTIVE`; `EquipSpellRequest.usages` resta nello schema ma è ignorato; `equipItem` su oggetto non posseduto ora risponde `ITEM_NOT_OWNED` (prima equipaggiava qualunque id).
- Deferred (fuori scope): compatibilità `equipType` ↔ slot.

## Self-Check: PASSED
