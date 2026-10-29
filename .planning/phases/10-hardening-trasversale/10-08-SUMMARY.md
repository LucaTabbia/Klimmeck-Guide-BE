---
phase: 10-hardening-trasversale
plan: 08
subsystem: validation
tags: [validation, ValidationPipe, BAD_USER_INPUT, D-01, D-02, D-03, D-04, C4, C5, BE-HARD-01]
requires:
  - "10-02: ordine dei codici sul completamento del GM (la pipe gira prima del service)"
  - "10-05: ValidationModule (APP_PIPE con createValidationPipe), BadUserInputException, messaggio 'Input non valido: <percorsi>'"
  - "10-06: decoratori su tutti gli input, MAX_OVERRIDE_ENTRIES = 50, EquipSpellRequest.usages senza decoratore"
  - "10-07: RuntimeConfigModule negli imports base dell'harness"
provides:
  - "src/app.module.ts: ValidationModule negli imports subito dopo AuthzModule"
  - "test/auth/auth-test-app.ts: ValidationModule negli imports base subito dopo AuthModule (ogni harness derivato la eredita)"
  - "test/app.int-spec.ts: caso 'mounts the global validation pipe'"
  - "tabella dei codici spostati sul filo (prima → dopo) per i handoff del piano 10-30"
affects: [10-09, 10-10, 10-12, 10-30]
tech-stack:
  added: []
  patterns:
    - "la pipe globale è un provider APP_PIPE importato da AppModule e dall'harness base, mai useGlobalPipes in main.ts"
    - "gli interceptor dell'audit girano prima delle pipe: un input malformato di una mutation admin è registrato con esito BAD_USER_INPUT"
key-files:
  created: []
  modified:
    - src/app.module.ts
    - test/auth/auth-test-app.ts
    - test/app.int-spec.ts
    - src/validation/validation-pipe.int-spec.ts
    - src/economy/trade/do-transaction.int-spec.ts
    - src/characters/equipment/equip-item.int-spec.ts
    - src/characters/spells/equip-spell.int-spec.ts
    - src/characters/spells/use-spell.int-spec.ts
    - src/characters/creation/character-creation.resolver.int-spec.ts
    - src/push/push.resolver.int-spec.ts
    - src/quests/acceptance/accept-quest.resolver.int-spec.ts
    - src/travel/travel.resolver.int-spec.ts
    - src/travel/teleport.resolver.int-spec.ts
    - src/quests/pending-requests/complete-pending-request.resolver.int-spec.ts
key-decisions:
  - "ValidationModule montato in AppModule dopo AuthzModule e nell'harness base dopo AuthModule; main.ts resta senza useGlobalPipes"
  - "unequipSpell con spellId malformato passa da SPELL_NOT_ACTIVE a BAD_USER_INPUT (codice spostato non previsto dal piano, trovato dalla regressione)"
  - "sendTestPush con targetUserId malformato passa da NOT_FOUND a BAD_USER_INPUT anche per streamerLive: il caso del broadcast usa ora un id ben formato inesistente per continuare a provare che il bersaglio è ignorato"
requirements-completed: []
duration: ~45 min
completed: 2026-10-29
---

# Phase 10 Plan 08: Montaggio globale della ValidationPipe Summary

**`ValidationModule` (APP_PIPE) montato in `AppModule` e nell'harness base: ogni input GraphQL è validato prima del service; id malformati, numeri negativi e override fuori forma rispondono `BAD_USER_INPUT` sul filo, mentre i codici di dominio (`INVALID_QUANTITY` per lo 0, `CHARACTER_NAME_INVALID`, `PUSH_INVALID_DEVICE_ID`, `OUTCOME_OVERRIDE_INVALID`) restano.**

## Performance

- **Durata:** ~45 min
- **Completato:** 2026-10-29
- **Task:** 3 (2 RED + 1 GREEN, più un commit RED aggiuntivo per un codice spostato non previsto)
- **File modificati:** 14

## Accomplishments

- Pipe globale montata in app (`AppModule`) e harness (`createAuthTestApp`); il boot reale la vede (`mounts the global validation pipe`).
- Tutti i codici spostati (C5) sono provati sul filo con codice e messaggio `Input non valido: <percorso>`, e per le mutation admin anche con il record di audit.
- I codici di dominio di forma (C4/C5) sono protetti da casi che passano attraverso la pipe.
- `EquipSpellRequest.usages` inviato da un client vecchio non cambia nulla (D-01).
- Chiavi `undefined` dopo `transform` riverificate sul filo: verdi i casi esistenti che omettono `itemId` (`clears the slot when itemId is omitted or null`), `background`/`imagePath` (`defaults a missing image to null and a missing background to empty`), `targetUserId`/`id` di `sendTestPush` (`sends to the caller by default…`, `reports an empty delivery…`), `outcomes` e i campi opzionali degli override (`lets the innkeeper complete a story and audits it`, `rejects an invalid override…`), `item` delle transazioni.

## Task Commits

1. **Task 1 (RED): economia, equipaggiamento, magie, creazione, push** — `85db7b0` (test)
2. **Task 2 (RED): quest, viaggio, teleport, completamento del GM, boot reale** — `a046941` (test)
3. **Task 3 (RED aggiuntivo da regressione): unequipSpell** — `d7bef28` (test)
4. **Task 3 (GREEN): montaggio globale** — `e701e8e` (feat)

## Fallimenti RED osservati

- Task 1 — 8 rossi su 96: `doTransaction` quantità negativa (ricevuto `INVALID_QUANTITY`), item id malformato (ricevuto `ITEM_NOT_FOUND`), monete negative nel totale (ricevuto `TRANSACTION_TOTAL_MISMATCH`); `equipItem` itemId malformato (ricevuto `ITEM_NOT_OWNED`); `equipSpell` spellId malformato (ricevuto `SPELL_NOT_KNOWN`); `useSpell` spellId malformato (ricevuto `SPELL_NOT_ACTIVE`); `sendTestPush` targetUserId malformato (ricevuto `NOT_FOUND`); `sendTestPush` id di 2001 caratteri (nessun errore: la chiamata riusciva).
- Task 1 — verdi al primo colpo (codici o comportamenti che restano): `keeps INVALID_QUANTITY for a zero quantity behind the global pipe (C5)`, `ignores the deprecated usages sent by an old client (D-01)` (il service ignorava già `usages`; ora non arriva più), `keeps the domain codes of the creation behind the global pipe (C4)`, `keeps PUSH_INVALID_DEVICE_ID behind the global pipe (C4)`.
- Task 2 — 5 rossi su 115: `acceptQuest` questId malformato, `startTravel`/`travelPreview` poiId malformato, `teleportCharacter` id malformati, override malformati (tutti ricevuto `NOT_FOUND`: il primo caso della sequenza è il `pendingQuestId` malformato), `mounts the global validation pipe` (`false`). Verde al primo colpo: `keeps OUTCOME_OVERRIDE_INVALID for a zero quantity behind the global pipe (C5)`.
- Regressione dopo il montaggio — 1 rosso non previsto: `unequipSpell` con spellId malformato (atteso `SPELL_NOT_ACTIVE`, ricevuto `BAD_USER_INPUT`): riga aggiornata in `d7bef28` prima del commit GREEN.

## Codici spostati sul filo (prima → dopo)

| Operazione | Input | Prima | Dopo | Messaggio | Spec / caso |
|---|---|---|---|---|---|
| `doTransaction` | quantità negativa | `INVALID_QUANTITY` | `BAD_USER_INPUT` | `Input non valido: boughtItems.equipAssets.0.quantity` | `do-transaction.int-spec.ts` › `rejects a negative quantity with BAD_USER_INPUT before the service (D-04, C5)` |
| `doTransaction` | item id malformato | `ITEM_NOT_FOUND` | `BAD_USER_INPUT` | `Input non valido: boughtItems.equipAssets.0.item` | `do-transaction.int-spec.ts` › `rejects a malformed item id with BAD_USER_INPUT before the service (D-02, C5)` |
| `doTransaction` | monete negative nel totale | `TRANSACTION_TOTAL_MISMATCH` | `BAD_USER_INPUT` | `Input non valido: total.copper` | `do-transaction.int-spec.ts` › `rejects negative coins in the total with BAD_USER_INPUT before the service (D-04, C5)` |
| `doTransaction` | quantità 0 | `INVALID_QUANTITY` | `INVALID_QUANTITY` (invariato) | `Quantità non valida` | `keeps INVALID_QUANTITY for a zero quantity behind the global pipe (C5)` |
| `equipItem` | itemId malformato | `ITEM_NOT_OWNED` | `BAD_USER_INPUT` | `Input non valido: itemId` | `equip-item.int-spec.ts` › `rejects a malformed item id with BAD_USER_INPUT (D-02)` |
| `equipSpell` | spellId malformato | `SPELL_NOT_KNOWN` | `BAD_USER_INPUT` | `Input non valido: spellId` | `equip-spell.int-spec.ts` › `rejects an unknown spell with SPELL_NOT_KNOWN and a malformed spell id with BAD_USER_INPUT (D-02)` |
| `unequipSpell` | spellId malformato | `SPELL_NOT_ACTIVE` | `BAD_USER_INPUT` | `Input non valido: spellId` | `equip-spell.int-spec.ts` › `answers SPELL_NOT_ACTIVE for an inactive spell and BAD_USER_INPUT for a malformed spell id (D-02)` |
| `useSpell` | spellId malformato | `SPELL_NOT_ACTIVE` | `BAD_USER_INPUT` | `Input non valido: spellId` | `use-spell.int-spec.ts` › `answers SPELL_NOT_ACTIVE for a known inactive spell and BAD_USER_INPUT for a malformed spell id (D-02)` |
| `acceptQuest` | questId malformato | `NOT_FOUND` | `BAD_USER_INPUT` | `Input non valido: questId` | `accept-quest.resolver.int-spec.ts` › `rejects a malformed quest id with BAD_USER_INPUT` |
| `startTravel` / `travelPreview` | poiId malformato | `NOT_FOUND` | `BAD_USER_INPUT` | `Input non valido: poiId` | `travel.resolver.int-spec.ts` › `rejects a malformed point of interest id with BAD_USER_INPUT and writes nothing` |
| `teleportCharacter` | poiId malformato | `NOT_FOUND` | `BAD_USER_INPUT` | `Input non valido: poiId` | `teleport.resolver.int-spec.ts` › `answers BAD_USER_INPUT for malformed ids (D-02)` (audit `BAD_USER_INPUT`) |
| `teleportCharacter` | id del personaggio malformato | `NOT_FOUND` | `BAD_USER_INPUT` | `Input non valido: id` | stesso caso (innkeeper, nessuna ownership: l'id passa dalla pipe) |
| `completePendingRequest` | pendingQuestId malformato | `NOT_FOUND` | `BAD_USER_INPUT` | `Input non valido: pendingQuestId` | `complete-pending-request.resolver.int-spec.ts` › `rejects malformed override shapes with BAD_USER_INPUT and audits them (D-04, C5)` |
| `completePendingRequest` | `outcomes[].characterId` malformato | `OUTCOME_NOT_PARTICIPANT` | `BAD_USER_INPUT` | `Input non valido: outcomes.0.characterId` | stesso caso |
| `completePendingRequest` | `hpAfter` negativo | `OUTCOME_OVERRIDE_INVALID` | `BAD_USER_INPUT` | `Input non valido: outcomes.0.hpAfter` | stesso caso |
| `completePendingRequest` | 51 voci in `outcomes` | `OUTCOME_OVERRIDE_INVALID` | `BAD_USER_INPUT` | `Input non valido: outcomes` | stesso caso (audit `BAD_USER_INPUT` per tutti e quattro) |
| `completePendingRequest` | consumo con quantità 0 | `OUTCOME_OVERRIDE_INVALID` | invariato | — | `keeps OUTCOME_OVERRIDE_INVALID for a zero quantity behind the global pipe (C5)` |
| `sendTestPush` | targetUserId malformato | `NOT_FOUND` | `BAD_USER_INPUT` | `Input non valido: targetUserId` | `push.resolver.int-spec.ts` › `answers NOT_FOUND for a missing target and BAD_USER_INPUT for a malformed one, auditing both (D-02)` |
| `sendTestPush` | `id` oltre 2000 caratteri | nessun errore | `BAD_USER_INPUT` | `Input non valido: id` | `push.resolver.int-spec.ts` › `rejects a test push id longer than 2000 characters with BAD_USER_INPUT (D-04)` |
| `sendTestPush` (`streamerLive`) | targetUserId malformato | ignorato (broadcast) | `BAD_USER_INPUT` | `Input non valido: targetUserId` | il caso del broadcast usa ora un id ben formato (vedi deviazioni) |

Restano invariati (C4): nome di una lettera → `CHARACTER_NAME_INVALID`; `imagePath` `http://` → `BAD_USER_INPUT` del dominio con messaggio `L'immagine deve essere un URL https valido`; `deviceId` con spazi → `PUSH_INVALID_DEVICE_ID`; override con HP oltre il massimo, duplicati e possessi → `OUTCOME_*`. Restano `NOT_FOUND` (li cambia il piano 10-09, le guard girano prima delle pipe): id del personaggio malformato in `acceptQuest`, `startTravel`/`travelPreview` e nelle altre ownership.

## Test

- Spec mirate dopo il GREEN: 12 suite / 218 test verdi (le 11 del piano più `validation-pipe.int-spec.ts`).
- Regressione completa in foreground: `npm run test:unit` 148 suite / 2109 test verdi; `npm run test:int` 85 suite / 1133 test verdi (≈ 3,5 min).
- `npm run build` 0; `git diff --exit-code src/schema.gql` 0; `git diff origin/develop -- src/schema.gql` aggiunge solo `+  pendingQuest: ID` e non rimuove nulla; `grep -c "useGlobalPipes" src/main.ts` = 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Codice spostato non previsto] `unequipSpell` con spellId malformato**
- **Found during:** Task 3 (regressione completa)
- **Issue:** la riga `codeOf(await unequip(player, 'abc'))` attendeva `SPELL_NOT_ACTIVE`; con la pipe la risposta è `BAD_USER_INPUT`.
- **Fix:** riga aggiornata (codice e messaggio, titolo parlante) in un commit `test(validation): …` prima del GREEN, invece di un commit `fix(validation): …`, perché la correzione tocca solo il test.
- **Files modified:** src/characters/spells/equip-spell.int-spec.ts
- **Commit:** d7bef28

**2. [Rule 1 - Riga esistente] `sendTestPush` con targetUserId malformato**
- **Found during:** Task 1
- **Issue:** due righe esistenti usavano `targetUserId: 'nope'`: il caso NOT_FOUND (ora `BAD_USER_INPUT`) e il broadcast `streamerLive` che «ignora il bersaglio» (con la pipe il bersaglio malformato è rifiutato prima del service).
- **Fix:** il primo caso ora attende `BAD_USER_INPUT` e l'audit di entrambi gli esiti; il caso del broadcast usa un id ben formato inesistente (`64b0000000000000000000ff`), così continua a provare che il bersaglio è ignorato. Aggiunto anche il caso dell'`id` oltre 2000 caratteri (C5 del 10-06).
- **Files modified:** src/push/push.resolver.int-spec.ts
- **Commit:** 85db7b0

**3. [Boy Scout] import ridondante in `validation-pipe.int-spec.ts`**
- **Found during:** Task 3
- **Issue:** la spec del 10-05 importava esplicitamente `ValidationModule`, ora già nell'harness base.
- **Fix:** rimosso l'import (file fuori da `files_modified`); la spec resta verde.
- **Files modified:** src/validation/validation-pipe.int-spec.ts
- **Commit:** e701e8e

**4. Righe spostate dentro casi nuovi**
- `equip-item.int-spec.ts`: l'asserzione `itemId: 'abc'` stava nel caso `ITEM_NOT_OWNED`; è passata nel nuovo caso `rejects a malformed item id with BAD_USER_INPUT (D-02)` (stessa chiamata, codice nuovo), non cancellata.
- `do-transaction.int-spec.ts`: il file non aveva righe sul filo per quantità negativa e id malformato (erano provate solo a livello unit, come annota il 10-06): aggiunta una tabella `SHAPE_CASES` separata da `REJECTIONS` (che deriva il twitchId dal codice), più la riga delle monete negative nel totale (prima `TRANSACTION_TOTAL_MISMATCH`).
- `complete-pending-request.resolver.int-spec.ts`: il caso degli override malformati include anche il `pendingQuestId` malformato (C5).

## Issues Encountered

Nessuno oltre alle deviazioni.

## Next Phase Readiness

- 10-09 può cambiare i tre rami `!isObjectIdHex` di `CharacterAccessPolicy`: le righe `'a malformed character id'` di accettazione e viaggio sono ancora `NOT_FOUND`.
- 10-30 trova qui la tabella completa dei codici spostati per i handoff.

## Self-Check: PASSED

- File e commit verificati: `85db7b0`, `a046941`, `d7bef28`, `e701e8e` presenti; i 14 file modificati esistono.
