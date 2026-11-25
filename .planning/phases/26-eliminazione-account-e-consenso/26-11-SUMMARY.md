---
phase: 26-eliminazione-account-e-consenso
plan: 11
subsystem: users, account, cloudinary
tags: [account-deletion, cloudinary, outbox, sweeper, privacy]
requires: ["26-10"]
provides:
  - "src/account/deletion/portrait/portrait-public-id.ts: PORTRAIT_FOLDER, portraitPublicIdOf(imagePath: unknown): string | null"
  - "src/account/deletion/portrait/portrait-store.ts: abstract class PortraitStore { destroy(publicId): Promise<void> }"
  - "CloudinaryService.destroyPortrait(publicId): uploader.destroy(publicId, { resource_type: 'image', invalidate: true })"
  - "src/account/deletion/portrait/portrait-deletion.model.ts: PortraitDeletion / PortraitDeletionSchema, collection portrait_deletions { publicId unico, queuedAt, attempts }"
  - "PortraitDeletionService.enqueueWithin(session, publicIds, now) e flush(): Promise<number>"
  - "PortraitDeletionSweeper (QUEST_CONFIG.sweepIntervalMs, single-flight, boot + periodico)"
  - "test/account/fake-portrait-store.ts: FakePortraitStore { destroyed, failNext(times = 1) }"
affects: [26-12, 26-13, 26-14]
tech-stack:
  added: []
  patterns:
    - "outbox transazionale per un effetto esterno dopo il commit, con sweeper sul pattern di prison-release.sweeper"
key-files:
  created:
    - src/account/deletion/portrait/portrait-public-id.ts
    - src/account/deletion/portrait/portrait-public-id.spec.ts
    - src/account/deletion/portrait/portrait-store.ts
    - src/account/deletion/portrait/portrait-deletion.model.ts
    - src/account/deletion/portrait/portrait-deletion.service.ts
    - src/account/deletion/portrait/portrait-deletion.service.int-spec.ts
    - src/account/deletion/portrait/portrait-deletion.sweeper.ts
    - src/account/deletion/portrait/portrait-deletion.sweeper.spec.ts
    - test/account/fake-portrait-store.ts
  modified:
    - src/rest/cloudinary/cloudinary.service.ts
    - src/rest/cloudinary/cloudinary.service.spec.ts
decisions:
  - "Un URL di ritratto vale solo se il parser non lo riscrive (`new URL(x).href === x`): segmenti con punti anche codificati, maiuscole nell'host e porte esplicite cadono tutti a null"
  - "Il WARN di un tentativo fallito porta l'id della riga dell'outbox e `describeError`, mai il public id né l'URL"
  - "`flush` legge le righe in ordine di `queuedAt` (indice dedicato) e le prova in serie; una riga chiusa due volte (flush dopo il commit e sweeper insieme) è innocua: Cloudinary risponde «not found», che vale «fatto»"
metrics:
  duration: "~25 min"
  completed: 2026-11-25
---

# Phase 26 Plan 11: infrastruttura dei ritratti Summary

Id Cloudinary dei soli ritratti caricati dall'app, porta `PortraitStore` con l'adattatore `CloudinaryService.destroyPortrait`, outbox `portrait_deletions` senza legame all'utente, servizio che accoda nella transazione del chiamante e chiude le righe dopo il commit senza mai lanciare, sweeper che ritenta al boot e a ogni `QUEST_CONFIG.sweepIntervalMs`.

## Task

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | spec dell'id e di `destroyPortrait` | `12a2a63b` |
| 1 GREEN | `portraitPublicIdOf`, `PortraitStore`, `destroyPortrait`, `FakePortraitStore` | `4b60be71` |
| 2 RED | int-spec dell'outbox e spec dello sweeper | `8264ad30` |
| 2 GREEN | modello, `PortraitDeletionService`, `PortraitDeletionSweeper` | `dbfc8f01` |
| 3 | bookkeeping | commit `docs(phase-26): record plan 11 progress` |

## Fallimenti RED

- Task 1: `portrait-public-id.spec.ts` → `Cannot find module './portrait-public-id'`; `cloudinary.service.spec.ts` → 3 casi nuovi con `TypeError: service(...).destroyPortrait is not a function` (i 2 esistenti verdi).
- Task 2: `portrait-deletion.sweeper.spec.ts` → `Cannot find module './portrait-deletion.sweeper'`; `portrait-deletion.service.int-spec.ts` → `Cannot find module './portrait-deletion.model'` (fallisce all'import, prima di aprire Mongoose: nessun jest appeso).

## Forma esatta dell'URL accettato

`https://res.cloudinary.com/<cloud>/image/upload/[v<cifre>/]characters_profile/<id>.<ext>` con `<cloud>` e `<id>` in `[A-Za-z0-9_-]+`, `<ext>` in `[A-Za-z0-9]+`, nessuna query, nessun frammento, e l'URL identico alla sua forma normalizzata da `URL`. Risultato `characters_profile/<id>`. Tutto il resto → `null`: cartelle diverse, sottocartelle di `characters_profile`, host diversi (anche `res.cloudinary.com.<altro>`), `http://`, `..` in chiaro o codificato `%2e%2e`, query, frammento, senza estensione, `video/upload`, stringa vuota, `null`, `undefined`, numeri.

## Risposta di Cloudinary trattata come «fatto»

Ogni risoluzione della promessa di `uploader.destroy` (risultato `ok`, `not found` o qualsiasi altro valore senza errore) chiude la riga (Assunzione A2 della ricerca). Un rigetto passa da `rethrowProviderError`: `Error` di nome `CloudinaryError` con il solo `http_code` come `code` e messaggio fisso, mai il payload.

## Verifiche

- unit: `portrait-public-id.spec.ts` + `cloudinary.service.spec.ts` 2 suite / 7 test verdi; `portrait-deletion.sweeper.spec.ts` 1 suite / 4 test verdi.
- integration: `portrait-deletion.service.int-spec.ts` 1 suite / 5 test verdi (`--runInBand`).
- `npx tsc --noEmit -p tsconfig.json` 0; prettier ed eslint file per file: 0 errori (i 22 warning `no-unsafe-*` di `cloudinary.service.ts` stanno in `listResources` / `listSubfoldersResources`, di prima).
- Accettazione: `export function portraitPublicIdOf` 1; `invalidate: true` dopo `async destroyPortrait` 1; `collection: 'portrait_deletions'` 1; `setTimeout(` / `Date.now` assenti da servizio e sweeper; `store.destroy(` e `.destroy(` presenti (Prettier ha lasciato la chiamata Cloudinary come `cloudinary.uploader\n.destroy(`, il pattern di key-link trova `.destroy(`); `pgrep -fl 'bin/jest'` vuoto a fine task.

## Deviations from Plan

Nessuna deviazione dal codice previsto. Aggiunte minori dentro lo scope:

- **[Rule 2] indice `{ queuedAt: 1 }`** sull'outbox: `flush` ordina per `queuedAt`.
- **[Rule 2] conteggio del tentativo protetto**: se anche l'incremento di `attempts` fallisce, un secondo WARN e nessun lancio (regola dura 5, T-26-46).
- Lo sweeper scrive un LOG col solo conteggio quando chiude almeno una riga (come quello delle prigioni); non tiene un flag `stopping` perché il servizio fa un solo `flush` per giro.

## Note per i piani seguenti (12)

- **`useExisting` non basta così com'è**: la porta chiede `destroy(publicId)`, `CloudinaryService` espone `destroyPortrait(publicId)` (nome fissato dal contratto del piano). `{ provide: PortraitStore, useExisting: CloudinaryService }` darebbe un'istanza senza `destroy`: nel piano 12 serve un `useFactory` che adatta (`(cloudinary: CloudinaryService) => ({ destroy: (id) => cloudinary.destroyPortrait(id) })`, `inject: [CloudinaryService]`) oppure un metodo `destroy` delegato su `CloudinaryService`. Decisione del piano 12 / dell'orchestratore.
- Il modulo deve registrare `MongooseModule.forFeature([{ name: PortraitDeletion.name, schema: PortraitDeletionSchema }])`, importare `CloudinaryModule` e fornire `QUEST_CONFIG` (oggi solo `questConfigProvider` locale di `QuestOutcomesModule`).
- `createAuthTestApp` registra un mock di `CloudinaryService`: nelle int-spec del piano 12 conviene sovrascrivere `PortraitStore` con `FakePortraitStore`.
- `enqueueWithin` deduplica la lista da sé; la guardia dei sopravvissuti (stesso `imagePath` su un personaggio non cancellato) resta del piano 12.

## Known Stubs

Nessuno: i provider non sono ancora in un modulo dell'app per scelta del piano (collegamento nel piano 12).

## Threat Flags

Nessuna superficie nuova oltre al registro delle minacce del piano (T-26-43..T-26-46).

## Self-Check: PASSED

- File creati presenti (9) e `cloudinary.service.ts` modificato.
- Commit `12a2a63b`, `4b60be71`, `8264ad30`, `dbfc8f01` presenti nella storia del ramo.
