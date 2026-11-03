---
phase: 12-negozi-per-citta
plan: 07
subsystem: migrations
tags: [migrations, pets, sellable, BE-SHOP-06, D-10, D-16, D-24]
requires: ["12-02", "12-05", "12-06"]
provides:
  - "src/shops/maintenance/pet-sellable.migrator.ts: PetSellableReport, PetSellableMigrator.migrate"
affects: [12-09, 12-10, 12-11]
tech-stack:
  added: []
  patterns:
    - "migrazione idempotente con filtro sul solo campo assente o null (`{ sellable: { $nin: [true, false] } }`): un valore curato a DB non si sovrascrive mai"
    - "provider senza hook di boot proprio: lo chiamerà l'orchestratore ShopBoot (12-10)"
key-files:
  created:
    - src/shops/maintenance/pet-sellable.migrator.ts
    - src/shops/maintenance/pet-sellable.migrator.int-spec.ts
  modified: []
decisions:
  - "PetSellableMigrator non implementa OnApplicationBootstrap e non è registrato in alcun modulo: la registrazione spetta al modulo di manutenzione del 12-10"
  - "Il log (una sola riga, solo conteggi) si emette solo se almeno un pet è stato valorizzato; nessun try/catch nel migratore: la gestione dell'errore con describeError resta al chiamante"
metrics:
  duration: "~6 min"
  completed: 2026-11-02
  tasks: 1
  files: 2
---

# Phase 12 Plan 07: migrazione di Pet.sellable Summary

`PetSellableMigrator.migrate()` valorizza `sellable` a `true` sui 4 pet in vendita di D-10 (`SELLABLE_PET_IDS`) e a `false` su tutti gli altri, solo dove il campo manca o è `null` (D-16, la mano vince); una seconda esecuzione restituisce `{ sellable: 0, questOnly: 0 }` e non cambia nulla. Provato solo sull'harness `MongoMemoryReplSet`: il database reale non è stato toccato.

## Task e commit

| Task | Fase | Commit | Descrizione |
| ---- | ---- | ------ | ----------- |
| 1 | RED | 7347d66 | `test(migrations): pin the pet sellable backfill` — int-spec con 6 test (D-10, D-16) |
| 1 | GREEN | 5246ed4 | `feat(migrations): backfill the sellable flag of the pets` |

## RED osservato

La suite falliva al caricamento: `Cannot find module './pet-sellable.migrator' from 'src/shops/maintenance/pet-sellable.migrator.int-spec.ts'` (0 test eseguiti, modulo assente), come atteso.

## Firme create

```typescript
export interface PetSellableReport { sellable: number; questOnly: number }
@Injectable()
export class PetSellableMigrator {
    constructor(@InjectModel(Pet.name) petModel: Model<PetDocument>);
    migrate(): Promise<PetSellableReport>;
}
```

Log: `Compagni: <n> in vendita e <m> solo da quest valorizzati` (solo se n + m > 0).

## Test (src/shops/maintenance/pet-sellable.migrator.int-spec.ts)

- `marks the four shop pets sellable where the field is missing (D-10, D-16)`
- `marks every other pet quest-only where the field is missing (D-10, D-16)`
- `fills a null sellable too (D-16)`
- `never overwrites a sellable chosen in the database (D-16)` — Cavallo leggero `false` resta `false`, Pegaso `true` resta `true`
- `is idempotent (D-16)` — documenti grezzi ordinati per `_id` `toEqual` dopo la seconda esecuzione
- `logs counts only (D-16)` — un solo messaggio, nessun id di 24 caratteri esadecimali

Fixture: i 4 pet di vendita con `persistPet(PetModel, { _id: new Types.ObjectId(id), name })`, più Pegaso e Worg con id nuovi; il `null` scritto con `PetModel.collection.updateOne`.

## Gate

- `npx jest src/shops/maintenance/pet-sellable.migrator.int-spec.ts --selectProjects integration --runInBand`: 6/6 verdi
- `npx tsc --noEmit -p tsconfig.json`: 0
- prettier + eslint sui due file: puliti
- `src/schema.gql` invariato; contro origin/develop 11 righe aggiunte, 0 tolte
- `pgrep -fl jest` vuoto

## Deviations from Plan

Nessuna: piano eseguito come scritto. Il tsc dopo il RED non è stato lanciato (l'unico errore possibile era il modulo assente, atteso); lanciato dopo il GREEN: 0.

## Threat Flags

Nessuna superficie nuova: T-12-09 (filtro sul campo assente o null, test dedicato e di idempotenza) e T-12-09b (log con soli conteggi, test dedicato) mitigati.

## Self-Check: PASSED

- FOUND: src/shops/maintenance/pet-sellable.migrator.ts
- FOUND: src/shops/maintenance/pet-sellable.migrator.int-spec.ts
- FOUND: 7347d66, 5246ed4
