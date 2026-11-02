---
phase: 12-negozi-per-citta
plan: 08
subsystem: migrations
tags: [migrations, pets, ownedPets, BE-SHOP-06, D-13, D-16, D-24]
requires: ["12-03", "12-07"]
provides:
  - "src/shops/maintenance/owned-pets.migrator.ts: OwnedPetsReport, OwnedPetsMigrator.migrate"
affects: [12-10]
tech-stack:
  added: []
  patterns:
    - "backfill per personaggio sulla collection grezza: filtro con le due forme dell'id (`idForms`) contro i duplicati, `refIdOf` per il pet equipaggiato legacy salvato come stringa"
    - "provider senza hook di boot proprio: lo chiamerà l'orchestratore del 12-10 dopo PetSellableMigrator"
key-files:
  created:
    - src/shops/maintenance/owned-pets.migrator.ts
    - src/shops/maintenance/owned-pets.migrator.int-spec.ts
  modified: []
decisions:
  - "OwnedPetsMigrator non implementa OnApplicationBootstrap e non è registrato in alcun modulo: la registrazione spetta al modulo di manutenzione del 12-10 (il modello Character va dato con forFeature lì)"
  - "Il documento di update del push sulla collection grezza è tipizzato `as never` (previsto dal piano): il driver tipizza il push su Document senza array noti"
  - "Il pet equipaggiato salvato come stringa entra nei posseduti come ObjectId; il campo `assets.pet` resta com'è (nessuna normalizzazione fuori dallo scopo D-16)"
metrics:
  duration: "~5 min"
  completed: 2026-11-02
  tasks: 1
  files: 2
---

# Phase 12 Plan 08: migrazione `assets.pet` → `assets.ownedPets` Summary

`OwnedPetsMigrator.migrate()` aggiunge il compagno equipaggiato di ogni personaggio ai suoi posseduti (D-13, D-16) quando non c'è già, né come ObjectId né come stringa esadecimale; crea la lista sui personaggi legacy che non ce l'hanno, tollera il pet equipaggiato salvato come stringa e non tocca i personaggi senza compagno. Una seconda esecuzione restituisce `{ owned: 0 }` e lascia la collezione identica. Provato solo sull'harness `MongoMemoryReplSet`: il database reale non è stato toccato.

## Task e commit

| Task | Fase | Commit | Descrizione |
| ---- | ---- | ------ | ----------- |
| 1 | RED | b8983b7 | `test(migrations): pin the owned pets backfill` — int-spec con 6 test (D-16) |
| 1 | GREEN | fba6259 | `feat(migrations): backfill the owned pets from the equipped pet` |

## RED osservato

La suite falliva al caricamento: `Cannot find module './owned-pets.migrator'` (modulo inesistente), 0 test eseguiti.

## Firme create

- `export interface OwnedPetsReport { owned: number }`
- `@Injectable() export class OwnedPetsMigrator` — `constructor(@InjectModel(Character.name) private readonly characterModel: Model<CharacterDocument>)`; `async migrate(): Promise<OwnedPetsReport>`
- Interfaccia interna `EquippedPetCharacter { _id: Types.ObjectId; assets?: { pet?: unknown } }`
- Lettura: `collection.find({ 'assets.pet': { $ne: null } }, { projection: { 'assets.pet': 1 } })`; per ogni personaggio `refIdOf(assets?.pet)`, poi `collection.updateOne({ _id, 'assets.ownedPets': { $nin: idForms(petId) } }, { $push: { 'assets.ownedPets': petId } } as never)`; `owned` = somma dei `modifiedCount`
- Log: una sola riga `Compagni: ${owned} personaggi ricevono il compagno equipaggiato fra i posseduti`, solo se `owned > 0`; nessun try/catch (l'errore propaga al chiamante del 12-10)

## Test (src/shops/maintenance/owned-pets.migrator.int-spec.ts, 6 verdi)

- adds the equipped pet to the owned pets (D-16)
- creates the list on a legacy character stored without it (D-16)
- never duplicates a pet already owned as ObjectId or as hex string (D-16)
- tolerates an equipped pet stored as a hex string (D-16)
- leaves the characters without an equipped pet untouched (D-16)
- is idempotent (D-16)

Helper locali: `rawCharacter({ pet, ownedPets })` (da `buildCharacter`, nome unico `Pet Owner N` per l'indice `character_name_active_ci_unique`, senza la chiave `ownedPets` quando non passata), `insertRaw`, `rawOf`, `ownedPetsOf`. I pet non serve crearli: si usano id generati.

## Gate

- `npx tsc --noEmit -p tsconfig.json` esce 0
- prettier ed eslint puliti sui due file
- `src/schema.gql` invariato; contro origin/develop 11 righe aggiunte, 0 tolte
- `pgrep -fl jest` vuoto

## Deviations from Plan

Nessuna deviazione: il cast `as never` sul documento di update era previsto dal piano per il caso in cui tsc rifiutasse il tipo del push (errore TS2322 su `PushOperator<Document>`).

## Threat model

- T-12-10: si aggiunge solo il pet già equipaggiato dal personaggio stesso; la guardia con le due forme dell'id impedisce i duplicati; idempotenza testata.
- T-12-10b: il log riporta solo il conteggio dei personaggi.

## Self-Check: PASSED

- FOUND: src/shops/maintenance/owned-pets.migrator.ts
- FOUND: src/shops/maintenance/owned-pets.migrator.int-spec.ts
- FOUND: b8983b7, fba6259
