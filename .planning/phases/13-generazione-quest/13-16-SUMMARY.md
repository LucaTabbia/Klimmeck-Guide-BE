---
phase: 13-generazione-quest
plan: 16
subsystem: quests (combattimento: contesto; manutenzione: gioielli)
tags: [quests, combat, maintenance, migrations, jewels, BE-QGEN-11, D-24, D-26]
requires: ["13-15"]
provides:
  - "`CombatEquipment.equipType: EquipType | null` e `CombatEquipment.accessoryUseTypes: AccessoryUseType[] | null` in src/quests/outcomes/combat/combat-resolver.ts"
  - "`CombatEquipmentSnapshot { damages?; equipType?; accessoryUseTypes? }` (export) e `CombatHydration.equipment: ReadonlyMap<string, CombatEquipmentSnapshot>` in combat-context.ts"
  - "projection del catalogo dell'equipaggiamento `{ damages: 1, equipType: 1, accessoryUseTypes: 1 }` nel `ResolutionLoader`"
  - "`JewelAccessoryMigrator.migrate(): Promise<JewelAccessoryReport>` e `JEWEL_ACCESSORY_USE_TYPES` (42 voci) in src/quests/maintenance/jewel-accessory.migrator.ts — UNA TANTUM, da rimuovere dopo il primo boot reale"
  - "passo `fasi d'uso dei gioielli (una tantum)` del `QuestMaintenanceBoot` dopo la migrazione dei nemici"
affects: [13-17, 13-19, 13-20]
tech-stack:
  added: []
  patterns:
    - "Normalizzatori del contesto fail-closed: solo valori dell'enum, lista malformata ⇒ null (non lista vuota)"
    - "Migratore una tantum chiamato dall'orchestratore del boot, senza hook proprio; scrive solo dove il campo manca"
key-files:
  created:
    - src/quests/maintenance/jewel-accessory.migrator.ts
    - src/quests/maintenance/jewel-accessory.migrator.int-spec.ts
  modified:
    - src/quests/outcomes/combat/combat-resolver.ts
    - src/quests/outcomes/combat/combat-context.ts
    - src/quests/outcomes/combat/combat-context.spec.ts
    - src/quests/outcomes/combat/placeholder-combat-resolver.spec.ts
    - src/quests/outcomes/quest-combat.int-spec.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/maintenance/quest-maintenance.boot.ts
    - src/quests/maintenance/quest-maintenance.boot.spec.ts
    - src/quests/maintenance/quest-maintenance.module.ts
decisions:
  - "Le 42 voci di `JEWEL_ACCESSORY_USE_TYPES` sono state generate da uno script dalla tabella `13-JEWELS-REVIEW.md` (stato APPROVATA il 2026-11-04) e confrontate con lo skeleton del piano: identiche (42/42, stessi `_id` e stessi tipi)"
  - "`accessoryUseTypes` nel contesto è normalizzato indipendentemente da `equipType` (il filtro ring/necklace sta nel migratore, la cura a DB vince); `equipType` sconosciuto ⇒ null"
  - "`missing` del report = id della tabella senza alcun documento a DB (qualunque `equipType`): un id presente come arma non è «mancante», semplicemente non riceve il campo"
metrics:
  duration: "~30 min"
  completed: 2026-11-04
  tasks: 2
  files: 11
---

# Phase 13 Plan 16: Fasi d'uso dei gioielli nel combattimento e migratore una tantum Summary

Il contesto del `CombatResolver` porta per ogni pezzo indossato `equipType` e `accessoryUseTypes` (solo valori degli enum, null dove assenti o malformati) letti dal catalogo con la projection estesa; il `JewelAccessoryMigrator` una tantum, chiamato dal `QuestMaintenanceBoot` dopo la migrazione dei nemici, scrive i tipi della tabella APPROVATA sui 42 anelli e collane solo dove il campo manca e segnala con WARN di soli id quelli non trovati a DB.

**Il migratore `src/quests/maintenance/jewel-accessory.migrator.ts` e la sua int-spec sono DA RIMUOVERE dopo il primo boot reale** (Phase 12 D-25): insieme a loro vanno tolti il parametro `jewels` del costruttore e il passo del boot, il provider e la voce `EquipmentItem` del forFeature di `QuestMaintenanceModule`, e i tre casi `(D-26)` di quest-maintenance.boot.spec.ts.

## Commit

| Task | Tipo | Hash | Subject |
|------|------|------|---------|
| 1 | RED | 08abd6b | test(combat): pin the jewel use types in the combat context |
| 1 | GREEN | 5ea841a | feat(combat): carry the jewel use types into the combat context |
| 2 | RED | db00a76 | test(migrations): pin the one-off jewel use types migration |
| 2 | GREEN | 7a5b642 | feat(migrations): write the approved jewel use types once |

## Nomi e firme creati

- combat-resolver.ts: `CombatEquipment { itemId; slot; damages; equipType: EquipType | null; accessoryUseTypes: AccessoryUseType[] | null }`
- combat-context.ts: `export interface CombatEquipmentSnapshot { damages?: unknown; equipType?: unknown; accessoryUseTypes?: unknown }`; private `equipTypeOf(value)`, `accessoryUseTypesOf(value)` (set `KNOWN_EQUIP_TYPES`, `KNOWN_ACCESSORY_USE_TYPES`)
- resolution-loader.service.ts: `ResolutionCatalog.equipment: ReadonlyMap<string, CombatEquipmentSnapshot>`; `find({ _id: { $in: refs.equipmentIds } }, { damages: 1, equipType: 1, accessoryUseTypes: 1 })`
- jewel-accessory.migrator.ts: `export interface JewelAccessoryReport { written: number; missing: string[] }`; `export const JEWEL_ACCESSORY_USE_TYPES: ReadonlyMap<string, readonly AccessoryUseType[]>` (26 defense, 8 attack, 8 entrambi); `@Injectable() export class JewelAccessoryMigrator` con ctor `(@InjectModel(EquipmentItem.name) equipmentItemModel)`, `migrate()`, privata `missingJewels()`; log `Gioielli: ${written} valorizzati` (solo se > 0) e WARN `Gioielli: ${k} della tabella non trovati a DB: ${id, …}` (id nell'ordine della tabella)
- quest-maintenance.boot.ts: ctor `(enemies: QuestEnemiesMigrator, jewels: JewelAccessoryMigrator)`; passo `await this.step("fasi d'uso dei gioielli (una tantum)", () => this.jewels.migrate())` dopo i nemici
- quest-maintenance.module.ts: forFeature + `{ name: EquipmentItem.name, schema: EquipmentItemSchema }`; providers `[QuestEnemiesMigrator, JewelAccessoryMigrator, QuestMaintenanceBoot]`

## RED osservati

- Task 1 (unit, 4 rossi su combat-context.spec): i tre casi `(D-24)` (le voci di `equipment` senza `equipType`/`accessoryUseTypes`) e `keeps only catalogued equipment, spells with damage and owned loot`, aggiornato alla forma nuova (`equipType: null, accessoryUseTypes: null`).
- Task 2: quest-maintenance.boot.spec 3 rossi su 5 (il secondo argomento del costruttore era ignorato: `migrate` mai chiamato); jewel-accessory.migrator.int-spec rossa con `Cannot find module './jewel-accessory.migrator'`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug di spec] Attese del contesto con la forma nuova fuori da `files_modified`**
- **Found during:** Task 1
- **Issue:** `quest-combat.int-spec.ts` asserisce con `toEqual` le voci `equipment` del contesto catturato dal resolver scriptato.
- **Fix:** aggiunti `equipType: 'weapon'` e `accessoryUseTypes: null` all'attesa; `placeholder-combat-resolver.spec.ts` (letterale `weapon()`) aggiornato come chiedeva il piano.
- **Commit:** 5ea841a

**2. [Rule 2] Casi in più nel boot spec**
- `keeps running the jewels step after a failed enemies step (D-26)` e `logs a failed jewels step by name and keeps booting (D-26)` (il piano chiedeva l'ordine e «un passo fallito non ferma i successivi»).
- Nella int-spec, il caso dell'arma verifica anche che l'id presente come arma non finisca in `missing`.

**3. Grep di accettazione spezzato da Prettier**
- `grep -cE "^\s+\['[0-9a-f]{24}', \[" src/quests/maintenance/jewel-accessory.migrator.ts` stampa `34`: Prettier spezza su più righe le 8 voci con entrambi i tipi. Il conteggio alternativo previsto dal piano `grep -cE "'[0-9a-f]{24}'"` stampa `42`. Nessuna riformattazione a mano.

## Gates

- `npx tsc --noEmit -p tsconfig.json` 0 a fine di ogni task.
- Unit `src/quests src/models test/fixtures`: 65 suite / 885 test verdi (879 + 6).
- Integration `src/quests/outcomes src/quests/results src/quests/generation src/quests/maintenance`: 22 suite / 204 test verdi.
- `test/app.int-spec.ts` (real boot): 72 verdi; il boot su DB vuoto esegue il passo dei gioielli (WARN con i 42 id mancanti, atteso sull'harness). `git diff --exit-code src/schema.gql` 0; vs origin/develop tolte solo le due righe `  enemy: Enemy`.
- prettier --check ed eslint puliti sugli 11 file toccati.
- `grep -rln "jewel-accessory.migrator" src test | grep -v "src/quests/maintenance/"` = 0; `UNA TANTUM` 1; `D-26)` nell'int-spec 4; `D-24)` nel combat-context.spec 3; `accessoryUseTypes: 1` nel loader 1; `accessoryUseTypes` nel segnaposto 0.

## Per il handoff / runbook

- Al primo boot reale dal branch il log atteso è `Gioielli: 42 valorizzati` e nessun WARN (se un WARN elenca id, sono gioielli della tabella assenti dal DB: da verificare a mano); al secondo boot nessuna riga. Poi rimuovere il migratore come sopra.

## Known Stubs

Nessuno.

## Threat Flags

Nessuno: T-13-18 (filtro `_id` + ring/necklace + campo assente, idempotente, WARN di soli id, provato solo sull'harness) e T-13-18b (solo valori dell'enum, lista malformata ⇒ null) mitigati come da registro.

## Self-Check: PASSED
