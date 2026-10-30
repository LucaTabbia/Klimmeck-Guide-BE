---
phase: 10-hardening-trasversale
group: C
reviewed: 2026-10-30T14:51:24Z
depth: standard
files_reviewed: 46
files_reviewed_list:
  - src/cities/cities.resolver.ts
  - src/cities/cities.service.ts
  - src/enemies/enemies.resolver.ts
  - src/enemies/enemies.service.ts
  - src/equipmentItems/equipment-items.resolver.ts
  - src/equipmentItems/equipment-items.service.ts
  - src/lootItems/loot-items.resolver.ts
  - src/lootItems/loot-items.service.ts
  - src/lore/lore.resolver.ts
  - src/lore/lore.service.ts
  - src/models/character/character-assets.model.ts
  - src/models/character/character-quests.model.ts
  - src/models/character/character-status.model.ts
  - src/models/character/character.model.ts
  - src/models/city.model.ts
  - src/models/common/active-spell.model.ts
  - src/models/common/asset-quantity.model.ts
  - src/models/common/coins.model.ts
  - src/models/common/equipment.model.ts
  - src/models/enemy.model.ts
  - src/models/equipment-item.model.ts
  - src/models/lore.model.ts
  - src/models/pending-quest.model.ts
  - src/models/pending-request.model.ts
  - src/models/point-of-interest.model.ts
  - src/models/quest/quest-infos.model.ts
  - src/models/quest/quest.model.ts
  - src/models/request/abandon-quest-request.model.ts
  - src/models/request/accept-quest-request.model.ts
  - src/models/request/complete-pending-request.model.ts
  - src/models/request/create-character-request.model.ts
  - src/models/request/equip-item-request.model.ts
  - src/models/request/equip-spell-request.model.ts
  - src/models/request/transaction-items.model.ts
  - src/models/request/transaction-request.model.ts
  - src/models/request/travel-request.model.ts
  - src/models/request/use-spell-request.model.ts
  - src/models/user.model.ts
  - src/pets/pets.resolver.ts
  - src/pets/pets.service.ts
  - src/pointsOfInterest/point-of-interest.resolver.ts
  - src/pointsOfInterest/point-of-interest.service.ts
  - src/roads/roads.resolver.ts
  - src/schema.gql
  - src/spells/spells.resolver.ts
  - src/spells/spells.service.ts
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---
# Phase 10: Code Review Report — gruppo C

## Summary

Revisione standard dei 46 file del gruppo C (ritipizzazione dei ref `Mixed`, decoratori sui 17 input, indici con nome, liste del catalogo, catalogo con pipe e `NOT_FOUND` con factory, `roads`, `spells`, `schema.gql`). Non ci sono bug di correttezza né problemi di sicurezza bloccanti. Verifiche fatte:

- **Ritipizzazione.** Ogni `@Prop` ritipizzato usa `MongooseSchema.Types.ObjectId` (o la lista) con `ref` coerente col modello referenziato; `@Field`, tipi TS, `default` e `required` sono invariati. Nessun `Types.ObjectId` residuo come `type` di un `@Prop` nei modelli del gruppo. I 34 percorsi di `MIXED_REF_PATHS` (conteggio rifatto a mano: 1 users, 1 pendingquests, 17 characters, 6 quests, 2 cities, 2 pointsofinterest, 1 enemies, 1 lore, 1 equipmentitems, 2 questresults) corrispondono ai campi ritipizzati; i 9 slot di `Equipment`, `ActiveSpell.spell`, `AssetQuantity.item` (con `refPath: 'itemType'`) e `CharacterAssets.pet` sono coperti. Probe con `@nestjs/mongoose` (script nello scratchpad, nessun accesso a DB né a `.env`): `type: Types.ObjectId` e `[Types.ObjectId]` producono `Mixed`, mentre `[{ type: Types.ObjectId, ref }]` era già `ObjectId`; quindi `City.pointsOfInterest` giustamente non è fra i 34 percorsi (il suo cambio è solo di forma).
- **Liste.** `Enemy.locations` e `PointOfInterest.type` sono `[String]` con `enum` e `default: []`; probe: l'`enum` su `type: [String]` valida gli elementi (`locations.0`) e un valore scalare legacy viene letto come lista di un elemento.
- **Decoratori.** Opzionali con `@IsOptional`, annidati con `@ValidateNested` + `@Type`, array con `@ArrayMaxSize` (50 per gli override, 100 per le righe di transazione, come da C5), id con `@IsObjectIdHex`, `EquipSpellRequest.usages` volutamente senza decoratori (scartato dalla whitelist, D-01). I soli `@InputType` usati come argomento sono le richieste decorate: gli altri input dei modelli (`CityInput`, `LoreInput`, `EnemyInput`, ...) non sono argomenti di nessuna operazione, quindi la whitelist non li svuota.
- **Indici.** Gli 8 indici con nome sono sui campi giusti (percorsi verificati negli schemi), nessun duplicato né conflitto con gli indici preesistenti; `status.spellStates.recoveries` è l'unica chiave array di quell'indice composto (nessun parallel array).
- **Catalogo.** `ObjectIdPipe` su tutti gli id scalari e su `from`/`to` di `getPath`, `ObjectIdListPipe` (tetto 100, esadecimale minuscolo) su `lootItemsByIds` e `equipmentItemsByIds`, factory `ResourceNotFoundException` per ogni servizio (messaggio di `lore` corretto: prima diceva «Quest»). `ResourceNotFoundException` estende `NotFoundException`, quindi `auth-session.service.ts` continua a intercettarla.
- **`src/schema.gql`.** Il diff contro `origin/develop` è la sola riga `+  pendingQuest: ID` in `type PendingRequestCharacter`.
- ESLint mirato sui 45 file sorgente: nessun errore o warning. Nessuna spec eseguita (ragionamento + probe Node sullo schema).

Restano un warning (campi stringa di `CreateCharacterInput` senza tetto, contro l'emendamento C4) e tre info (lacune di test e di forma).

## Critical

Nessuno.

## Warnings

### C-WR-01: `CreateCharacterInput` senza `@MaxLength`, contro l'emendamento C4 di D-04

**File:** `src/models/request/create-character-request.model.ts:12-14, 36-44` (anche `src/validation/input-rules.spec.ts:161-182`)

**Problem:** D-04, rivisto con C4, dice che dove esiste un validatore di dominio i decoratori controllano «solo la forma» con `@IsString`, `@IsInt`, `@IsEnum` e `@MaxLength` generosi. Qui `name`, `background` e `imagePath` hanno solo `@IsString`: nessun tetto alla lunghezza. Il test della regola (`checks only the shape of the character creation fields`) usa anzi `'A'.repeat(40)` e `'b'.repeat(600)` come casi che devono passare, ma nessun caso «troppo lungo anche per il tetto generoso». Per contrasto `SendTestPushInput.id` ha `@MaxLength(ADMIN_TEXT_MAX_LENGTH)` e il test lo nomina.

**Scenario:** un utente autenticato invia `createCharacter` con `name` o `background` di centinaia di KB (il limite pratico è solo quello del body parser). Prima del controllo di dominio, `normalizeCharacterName` esegue `normalize('NFC')`, `replace` e `trim` sull'intera stringa, e `normalizeBackground` fa `trim` sull'intera stringa; il rifiuto arriva comunque (`CHARACTER_NAME_INVALID` / `backgroundTooLong`) ma dopo aver lavorato sull'input intero, e il codice di errore non è `BAD_USER_INPUT` come per gli altri input oversize. Impatto basso (rifiuto garantito dal dominio), ma è un tetto previsto e non implementato. Da verificare con la config effettiva del body parser di Apollo (non nel gruppo C).

**Fix:** Aggiungere tetti ben sopra i limiti di dominio, riusando le costanti esistenti:

```ts
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { BACKGROUND_MAX_CODE_UNITS, IMAGE_PATH_MAX_LENGTH } from 'src/characters/creation/create-character-input.validator';
import { CHARACTER_NAME_MAX_CODE_UNITS } from 'src/characters/creation/character-name';

@IsString() @MaxLength(CHARACTER_NAME_MAX_CODE_UNITS * 2) name: string;
@IsOptional() @IsString() @MaxLength(BACKGROUND_MAX_CODE_UNITS * 2) background?: string | null;
@IsOptional() @IsString() @MaxLength(IMAGE_PATH_MAX_LENGTH * 2) imagePath?: string | null;
```

Test TDD da scrivere prima, in `input-rules.spec.ts`: `name` di 41 unità non passa solo se oltre il tetto, `'a'.repeat(MAX+1)` risponde `['name']` (e analogo per `background`/`imagePath`), mentre i casi esistenti da 40 e 600 restano `[]`. Se il tetto non si vuole, documentare la scelta come deroga a C4 («decisione da confermare»: C4/D-04).

## Info

### C-IN-01: `Enemy.locations` come lista non ha un test che rifiuti un valore fuori enum

**File:** `src/models/catalog-list-fields.schema.spec.ts:30-49` (modello: `src/models/enemy.model.ts:21-23`)

**Problem:** La spec nomina D-17b e prova default `[]`, `PoiType` come lista e lettura del valore scalare legacy per `PointOfInterest`, ma per `Enemy` verifica solo che `locations` sia un `Array` con default `[]`. Il rifiuto di un elemento fuori da `PoiType` è provato solo per `PointOfInterest.type` (`type.0`). Il probe fatto in review conferma che l'`enum` funziona anche su `Enemy.locations`, ma una regressione (es. `type: [String]` senza `enum` dopo un refactor) non romperebbe alcun test.

**Fix:** Aggiungere in `catalog-list-fields.schema.spec.ts` un caso gemello: `new EnemyProbe({ name: 'Goblin', locations: ['nope'] }).validateSync()` con `Object.keys(error?.errors ?? {})` uguale a `['locations.0']`, e un `hydrate({ locations: PoiType.city })` che torna `[PoiType.city]`. Scriverlo prima (RED sarebbe la rimozione dell'`enum`).

### C-IN-02: la spec di copertura dei decoratori accetta anche il solo `@IsOptional`

**File:** `src/validation/input-decorators.spec.ts:100-118`

**Problem:** Il test `validates every schema field of %s` confronta i nomi di proprietà con almeno un metadato di validazione, ma `@IsOptional()` è esso stesso un metadato condizionale per quella proprietà: un campo con il solo `@IsOptional()` (nessuna regola) risulterebbe «decorato». Le regole vere sono provate dalle `input-rules.spec.ts` per campi scelti, non per tutti (es. `EquipItemRequest.slotType`, `CoinsInput.gold/silver/copper` hanno copertura solo indiretta o parziale).

**Fix:** Nel filtro dei metadati escludere `ValidationTypes.CONDITIONAL_VALIDATION` (il tipo di `@IsOptional`) prima di costruire `decorated`, così ogni campo deve avere una regola reale. Test TDD: aggiungere in una classe sentinella un campo con il solo `@IsOptional()` e verificare che il controllo lo segnali.

### C-IN-03: `IsObjectIdHex` e costanti dei tetti duplicati come numeri nei modelli di richiesta

**File:** `src/models/request/complete-pending-request.model.ts:19`, `src/models/request/transaction-items.model.ts:6` (e `src/validation/object-id.pipe.ts:5`)

**Problem:** Il tetto di 100 compare in tre posti con nomi diversi (`MAX_TRANSACTION_LINES` e `MAX_ID_LIST` valgono entrambi 100 per la stessa regola D-04 «array ≤ 100», `MAX_OVERRIDE_ENTRIES` vale 50 per C5). Non è un bug, ma una modifica di D-04 va fatta in due punti. Boy Scout non fatto, trascurabile.

**Fix:** Esportare un unico `MAX_INPUT_LIST` (100) da `src/validation/` e farlo riusare da `ObjectIdListPipe` e `TransactionItems`; lasciare `MAX_OVERRIDE_ENTRIES = 50` separato perché deroga documentata (C5). Nessun test nuovo oltre a quelli esistenti che nominano il tetto 100.

## Observed but not flagged (decisioni di CONTEXT/RESEARCH)

- `CoinsInput`, `AssetQuantityInput.quantity` e `ItemUsageInput.quantity` hanno `@Min(0)` ma non un massimo: voluto da C5/D-04 («solo forma», 0 e limiti dipendenti dal personaggio restano `INVALID_QUANTITY` / `OUTCOME_*` del service); il tetto naturale è l'`Int` GraphQL a 32 bit.
- `CreateCharacterInput.age` ha solo `@IsInt`: l'età per razza resta del dominio (C4).
- `EquipSpellRequest.usages` senza decoratori e scartato dalla whitelist: D-01.
- Lettori tolleranti `refIdOf`/`idForms`/`sameId`/`objectIdFromHex` non rimossi: C14, backlog v1.1.
- Non formattati secondo Prettier `src/models/request/*`, `coins.model.ts`, i `*.module.ts` del catalogo: noti.
- `MIXED_REF_PATHS` non contiene `cities.pointsOfInterest` perché era già `ObjectId` (probe) e non contiene `quests.activeStoryQuest`/`activeWorldMissionQuest` perché già `MongooseSchema.Types.ObjectId` a `origin/develop`: coerente con C14 e con la spec dell'inventario.
- `ObjectIdPipe`/`ObjectIdListPipe` rifiutano l'esadecimale maiuscolo (scelta consapevole di D-02/C3, `BAD_USER_INPUT`).
- Il cambio di messaggio e di codice (`NotFoundException` grezza a `ResourceNotFoundException` con `NOT_FOUND`) è D-11; i messaggi sono ora in italiano e senza id nel testo.

---

_Reviewed: 2026-10-30T14:51:24Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
