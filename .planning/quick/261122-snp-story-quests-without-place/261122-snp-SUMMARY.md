---
phase: quick-261122-snp
plan: 01
subsystem: quests
tags: [quests, story, board, graphql, schema]
key-files:
  created:
    - src/models/quest/quest-place.schema.spec.ts
  modified:
    - src/models/quest/quest-infos.model.ts
    - src/schema.gql
    - src/quests/quest-board.int-spec.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/quests/pending-requests/pending-requests.resolver.int-spec.ts
    - src/quests/guided/guided-completion.service.int-spec.ts
    - src/quests/outcomes/gm-completion.service.int-spec.ts
    - test/app.int-spec.ts
commits:
  - { hash: ff53ae13, message: "docs(quick-261122-snp): plan the story quests without a place" }
  - { hash: 79daea77, message: "test(quests): expect a story to live without a place" }
  - { hash: 638d583a, message: "fix(quests): let a story quest live without a place" }
  - { hash: bc24e7de, message: "test(quests): prove the plain completion of a story without a place" }
metrics:
  started: 2026-11-22
  completed: 2026-11-22
---

# Quick 261122-snp: una story può vivere senza luogo

`QuestInfos.markerLocation` è nullable sul filo e obbligatorio a DB per ogni tipo tranne `story`: una story senza luogo si salva, compare sul Tabellone del suo rango con `markerLocation: null`, si accetta da una città, arriva nella coda dell'oste e si completa (guidata o semplice) senza chiudersi.

## Parole dell'utente (2026-11-22)

Quattro quest `story` permanenti, una per rango, «vuote»: niente premi, niente nemici, nessun luogo.

> «Le uniche quest senza markerLocation sono queste story quest. Tutto il resto ha sempre la posizione.»

## Decisioni

1. **Filo:** `@Field(() => PointOfInterest, { nullable: true })`. Il secondo `markerLocation: PointOfInterest!` dello SDL è `City.markerLocation`: non toccato.
2. **Modello:** `required: requiresPlace` (funzione sul sottodocumento: vero se `type` non è `story`). Una story può anche tenere un luogo; ogni altro tipo senza luogo (assente o `null`) fallisce con `ValidationError` su `infos.markerLocation`.
3. **Input:** `QuestInfosInput.markerLocation` facoltativo. `QuestInput`/`QuestInfosInput` non sono usati da nessuna mutation e non sono nello SDL: la sola validazione della creazione è lo schema Mongoose (nessun errore di regola di gioco da aggiungere, perché non esiste una mutation che crei quest).
4. **Nessun lettore cambiato.** Audit di ogni lettore di `infos.markerLocation` sui percorsi di una story, tutti già tolleranti:
   - Tabellone (`quest-board.ts`, `QuestsService`): la story entra dal ramo `infos.type` + `minTitle`, non dal marker; `QUEST_CATALOG_POPULATE` popola un ref assente come assente; `QuestFacedEnemiesResolver` ricostruisce `infos` solo per le aid.
   - Accettazione: la corsia story salta `locationInQuestCity`; `autoRequestOf` senza marker non crea movimento; `previewTravel` risponde null.
   - Coda dell'oste (`pending-requests/`): legge tipo, titolo e posti della quest e la posizione del personaggio, mai il marker.
   - Flusso guidato (`guided/`): non legge mai il marker della quest; la bozza nasce con `place: null` e la lista dei nemici usa `draft.place ?? posizione del personaggio` (regola di oggi, invariata).
   - Completamento semplice e guidato, esiti e `questresults`: della quest scrivono id, tipo e titolo; `questUpdateOf` non tocca una story (non registrata), quindi non si conclude.
   - Avvio (`quest-start.service.ts`), sweeper e risoluzioni: solo corsia standard. Aid (`aid-quest.ts`, `rescue-resolution.service.ts`): nascono solo da hunt e dungeon.
   - Generatore: `hexOf(quest.infos?.markerLocation)` filtra i null; l'indice unico parziale sul marker vale solo per le generate.
   - Archivio del personaggio e refresher dei change stream: nessuna lettura del marker.
5. Nessun migratore, nessun seeder, nessun file di contenuto.

## SDL

`git diff develop -- src/schema.gql` mostra solo:

```
 type QuestInfos {
-  markerLocation: PointOfInterest!
+  markerLocation: PointOfInterest
```

## RED osservati (`79daea77`)

- Unit `quest-place.schema.spec.ts`: 2 falliti su 31 (story senza luogo, story con luogo `null`); verdi già in RED come guardie i 14 tipi rifiutati senza luogo.
- Integration: 8 falliti — stringa dello SDL, 3 del Tabellone, accettazione, coda dell'oste, 2 del completamento guidato; tutti per `Path markerLocation is required`. Verdi già in RED come guardie le 3 creazioni rifiutate di hunt, worldMission e dungeon.
- `bc24e7de` (completamento semplice) è una prova scritta dopo il fix: nasce verde.

## Gate

- `npx tsc --noEmit -p tsconfig.json`: 0.
- `npx jest --selectProjects unit`: 314 suite / 4746 test verdi (4715 + 31).
- `npx jest --selectProjects integration --runInBand --forceExit`: 163 suite / 2709 test verdi (11 aggiunti qui; la base indicata era 2692, la differenza di 6 non è stata misurata su `develop`).
- prettier ed eslint sui file toccati: puliti (unico warning `no-base-to-string` di `test/app.int-spec.ts`, preesistente).

## Note per la FE

- `Quest.infos.markerLocation` può arrivare `null`, solo per le story. Nessun campo nuovo, nessuna selezione da cambiare.
- Una story senza luogo compare anche a un personaggio in viaggio (ramo per titolo del Tabellone, come ogni story).

## Aperto

- Le quattro story vanno scritte a DB dall'utente (nessun seeder nel repo). Scritte a mano devono avere `infos.type: 'story'`; il campo `infos.markerLocation` assente o `null`.
- La lista nemici della bozza guidata di una story senza luogo parte dalla posizione del personaggio finché l'oste non sceglie un luogo: regola esistente, non nuova.
