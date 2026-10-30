---
phase: 10-hardening-trasversale
plan: 06
subsystem: validation
tags: [validazione, class-validator, decoratori, D-01, D-02, D-04, C4, C5, BE-HARD-01]
requires:
  - "10-05: IsObjectIdHex, invalidFieldsOf, createValidationPipe, ValidationModule (non montato)"
provides:
  - "decoratori class-validator di sola forma sui 17 input dello SDL (EquipSpellRequest.usages senza decoratore, scartato dalla whitelist)"
  - "src/models/request/transaction-items.model.ts: export const MAX_TRANSACTION_LINES = 100"
  - "src/push/dto/send-test-push.input.ts: export const ADMIN_TEXT_MAX_LENGTH = 2000"
  - "src/models/request/complete-pending-request.model.ts: export const MAX_OVERRIDE_ENTRIES = 50 (spostato da gm-overrides.ts, che lo importa e lo riesporta)"
  - "src/validation/input-decorators.spec.ts: VALIDATED_INPUTS, STRIPPED_FIELDS, confronto con i blocchi input di src/schema.gql"
  - "src/validation/input-rules.spec.ts: un test nominato per ogni regola nuova"
affects: [10-08, 10-09, 10-10, 10-12]
tech-stack:
  added: []
  patterns:
    - "decoratori di sola forma dove esiste un validatore di dominio; i codici di dominio restano (C4)"
    - "ogni input annidato ha @ValidateNested + @Type; la spec di copertura lo prova istanziando con plainToInstance"
    - "tetti condivisi fra modello e service esportati dal modello (strato più basso)"
key-files:
  created:
    - src/validation/input-decorators.spec.ts
    - src/validation/input-rules.spec.ts
  modified:
    - src/models/common/asset-quantity.model.ts
    - src/models/common/coins.model.ts
    - src/models/request/transaction-items.model.ts
    - src/models/request/transaction-request.model.ts
    - src/models/request/equip-item-request.model.ts
    - src/models/request/equip-spell-request.model.ts
    - src/models/request/use-spell-request.model.ts
    - src/models/request/create-character-request.model.ts
    - src/models/request/abandon-quest-request.model.ts
    - src/models/request/accept-quest-request.model.ts
    - src/models/request/travel-request.model.ts
    - src/models/request/complete-pending-request.model.ts
    - src/push/dto/register-push-device.input.ts
    - src/push/dto/send-test-push.input.ts
    - src/quests/outcomes/gm-overrides.ts
key-decisions:
  - "MAX_OVERRIDE_ENTRIES vive nel modello dell'input; gm-overrides.ts lo importa e lo riesporta perché gm-overrides.spec.ts lo importa da lì (spec invariata)"
  - "la verifica di @Type nella spec di copertura è comportamentale (plainToInstance produce un'istanza della classe annidata) invece di leggere lo storage interno di class-transformer, che non ha tipi pubblici sotto moduleResolution nodenext"
requirements-completed: []
duration: 25min
completed: 2026-10-29
---

# Phase 10 Plan 06: decoratori di sola forma sui 17 input Summary

**Decoratori class-validator su tutti i 17 `input` GraphQL (id `@IsObjectIdHex()`, interi non negativi, enum, tetti 100/50/2000), una spec che confronta classi e `src/schema.gql` campo per campo e 16 regole nominate; schema invariato, pipe ancora non montata (10-08).**

## Performance

- **Durata:** circa 25 min
- **Completato:** 2026-10-29
- **Task:** 3
- **File modificati:** 17 (15 di produzione, 2 spec)

## Accomplishments

- I 17 input dello SDL hanno almeno un decoratore su ogni campo; unica eccezione esplicita `EquipSpellRequest.usages` (deprecato, scartato dalla whitelist, D-01).
- Ogni campo annidato (`TransactionRequest.boughtItems/soldItems/total`, `TransactionItems.lootAssets/equipAssets`, `CompletePendingRequestInput.outcomes`, `ParticipantOverrideInput.consumablesUsed/spellsUsed`) ha `@ValidateNested` + `@Type` (T-10-20).
- `MAX_OVERRIDE_ENTRIES = 50` spostato nel modello; il controllo di difesa in profondità di `validateOverrides` resta e la semantica della Phase 9 è invariata (`gm-overrides.spec.ts` 36/36 senza modifiche).
- Decoratori di sola forma dove esiste un validatore di dominio (C4): nome, background, imagePath, età, device/token push.

## Regole per input (forma compatta)

| Input | Regole |
|---|---|
| `AssetQuantityInput` | `item` opzionale + `@IsObjectIdHex()`; `quantity` `@IsInt() @Min(0)` (decoratori solo sulla classe input, non su `AssetQuantity`) |
| `CoinsInput` | `gold`/`silver`/`copper` `@IsInt() @Min(0)` |
| `TransactionItems` | `lootAssets`/`equipAssets` `@IsArray() @ArrayMaxSize(MAX_TRANSACTION_LINES)` + nested `AssetQuantityInput` |
| `TransactionRequest` | `id` hex; `boughtItems`/`soldItems` nested `TransactionItems`; `total` nested `CoinsInput`; `isTotalPositive` `@IsBoolean()` |
| `EquipItemRequest` | `id` hex; `itemId` opzionale hex; `slotType` `@IsEnum(SlotType)` |
| `EquipSpellRequest` | `id`, `spellId` hex; `usages` nessun decoratore |
| `UseSpellRequest` | `characterId`, `spellId` hex |
| `CreateCharacterInput` | `name` `@IsString()`; `sex`/`pronoun`/`race`/`classType` `@IsEnum`; `age` `@IsInt()`; `background`/`imagePath` `@IsOptional() @IsString()` |
| `AcceptQuestRequest`, `AbandonQuestRequest` | `id`, `questId` hex |
| `TravelRequest` | `id`, `poiId` hex |
| `RegisterPushDeviceInput` | `deviceId`, `token` `@IsString()`; `platform` `@IsEnum(PushPlatform)` |
| `SendTestPushInput` | `type` `@IsEnum(PushEventType)`; `targetUserId` opzionale hex; `id` opzionale `@IsString() @MaxLength(ADMIN_TEXT_MAX_LENGTH)` |
| `CompletePendingRequestInput` | `pendingQuestId` hex; `outcomes` opzionale, array ≤ `MAX_OVERRIDE_ENTRIES`, nested `ParticipantOverrideInput` |
| `ParticipantOverrideInput` | `characterId` hex; `hpAfter` opzionale `@IsInt() @Min(0)`; `injuries` opzionale, ≤ 50, `@IsEnum(InjuryType, { each: true })`; `consumablesUsed`/`spellsUsed` opzionali, ≤ 50, nested |
| `ItemUsageInput` / `SpellUsageInput` | `item`/`spell` hex; `quantity`/`usages` `@IsInt() @Min(0)` |

## Task Commits

1. **Task 1: formattazione e RED della copertura** — `f839127` (style), `21041d0` (test)
2. **Task 2: economia, equipaggiamento, magie e creazione** — `467c14f` (test, RED), `3fd21ea` (feat, GREEN)
3. **Task 3: quest, viaggio, push, completamento del GM** — `adcdb28` (test, RED), `3d27aad` (feat, GREEN)

## TDD: rossi osservati

- **Task 1 (`input-decorators.spec.ts`):** verde `covers exactly the inputs of the generated schema (D-01)` (l'elenco di RESEARCH coincide con lo schema); rossi i 17 casi `validates every schema field of <Classe>` e i 4 casi `declares @Type on every nested input of` `CompletePendingRequestInput`, `ParticipantOverrideInput`, `TransactionItems`, `TransactionRequest` (21 rossi su 35). Gli altri 13 casi `declares @Type` sono verdi al primo colpo perché quelle classi non hanno campi annidati (asserzione vacua per costruzione).
- **Task 2 (`input-rules.spec.ts`):** 8 rossi su 9; verde al primo colpo `leaves a zero quantity to the domain rule (D-04, C5)`, perché senza decoratori nessun campo è invalido e lo 0 deve restare valido anche dopo. Dopo il GREEN restavano rossi in `input-decorators.spec.ts` solo gli 11 casi delle 9 classi del Task 3 (atteso).
- **Task 3:** 7 rossi su 7 nuovi casi.

## Verde finale

- `npx jest src/validation --selectProjects unit`: 7 suite, 73 test (di cui `input-decorators.spec.ts` 35 = 1 + 17 + 17, `input-rules.spec.ts` 16)
- `npx jest src/quests/outcomes/gm-overrides.spec.ts --selectProjects unit`: 36/36 (spec invariata)
- `npx jest src/push --selectProjects unit`: 10 suite, 148 test
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 51/51 (dopo il Task 2 e dopo il Task 3)
- `npm run build`: 0; `git diff --exit-code src/schema.gql`: 0; contro `origin/develop` l'unica riga aggiunta resta `+  pendingQuest: ID`, nessuna rimossa

## Files Created/Modified

- `src/validation/input-decorators.spec.ts` — rete di sicurezza: `VALIDATED_INPUTS` contro i blocchi `input` di `src/schema.gql`; per ogni classe i `propertyName` dei metadati di class-validator sono uguali ai campi dello schema meno `STRIPPED_FIELDS`; per ogni campo il cui tipo è un altro input c'è un metadato `nestedValidation` e `plainToInstance` produce un'istanza della classe annidata
- `src/validation/input-rules.spec.ts` — 16 regole nominate (D-01, D-02, D-04, C4, C5)
- 14 file di input e `gm-overrides.ts` — vedi tabella sopra

## Note per il montaggio della pipe (10-08)

- **Codici che si sposteranno sul filo (C5)**, oggi provati solo a livello unit: quantità negativa in `doTransaction` (era `INVALID_QUANTITY`, lo 0 resta), id di item malformato nelle transazioni (era `ITEM_NOT_FOUND`), `itemId` malformato in `equipItem` (era `ITEM_NOT_OWNED`), `spellId` malformato in equip/use spell (era `SPELL_NOT_KNOWN`), `characterId` malformato negli override (era `OUTCOME_NOT_PARTICIPANT`), numeri negativi e più di 50 voci negli override (erano `OUTCOME_OVERRIDE_INVALID`; lo 0, il massimo di HP, i duplicati e i possessi restano `OUTCOME_*`), `pendingQuestId` malformato (era `NOT_FOUND`), `questId`/`poiId` malformati, `targetUserId` malformato e `id` oltre 2000 caratteri in `sendTestPush`, `race`/`platform` fuori enum (già rifiutati dalla coercizione GraphQL).
- **Chiavi `undefined` dopo `transform`** (target esnext): i campi opzionali `AssetQuantityInput.item`, `EquipItemRequest.itemId`, `CreateCharacterInput.background`/`imagePath`, `SendTestPushInput.targetUserId`/`id`, `CompletePendingRequestInput.outcomes`, `ParticipantOverrideInput.hpAfter`/`injuries`/`consumablesUsed`/`spellsUsed`, e `EquipSpellRequest.usages` (scartato). Ricerca nel codice di produzione: nessun servizio fa spread di questi input negli update né usa `'campo' in input`; i consumatori usano `== null` / `??` (`characters.service.ts` `equipItem`, `gm-overrides.ts`, `push.service.ts`, `create-character-input.validator.ts`), quindi tollerano la chiave `undefined`. Il 10-08 lo riverifica sul filo.

## Decisions Made

- `MAX_OVERRIDE_ENTRIES` è dichiarato nel modello e `gm-overrides.ts` usa `import { MAX_OVERRIDE_ENTRIES } from 'src/models/request/complete-pending-request.model'` più `export { MAX_OVERRIDE_ENTRIES }`, perché `gm-overrides.spec.ts` lo importa da `gm-overrides` (la riesportazione era prevista dal piano in questo caso).

## Deviations from Plan

**1. [Rule 3 - Blocking] Verifica di `@Type` comportamentale invece che sullo storage interno di class-transformer**
- **Trovato durante:** Task 1
- **Problema:** il piano suggeriva `defaultMetadataStorage.findTypeMetadata(Classe, campo)`; lo storage è esportato solo da un percorso interno (`class-transformer/cjs/storage`) senza dichiarazioni di tipo raggiungibili con `moduleResolution: nodenext`.
- **Soluzione:** per ogni campo annidato la spec costruisce `plainToInstance(Classe, { campo: {} | [{}] })` e verifica che il valore annidato sia un'istanza della classe dello schema (senza `@Type` resterebbe un oggetto semplice), oltre al metadato `nestedValidation`. La prova è più forte (verifica anche la classe di destinazione).
- **File:** `src/validation/input-decorators.spec.ts`
- **Commit:** `21041d0`

Altrimenti il piano è stato eseguito come scritto.

## Issues Encountered

Nessuno.

## Threat Flags

Nessuna superficie nuova: solo decoratori su input esistenti, nessun campo SDL nuovo.

## Next Phase Readiness

Tutti i 17 input sono decorati e coperti dalla spec di copertura: il 10-08 può montare `ValidationModule` in `AppModule` e in `createAuthTestApp` e portare sul filo i codici spostati elencati sopra.

## Self-Check: PASSED

- File creati presenti: `src/validation/input-decorators.spec.ts`, `src/validation/input-rules.spec.ts`
- Commit presenti: `f839127`, `21041d0`, `467c14f`, `3fd21ea`, `adcdb28`, `3d27aad`
