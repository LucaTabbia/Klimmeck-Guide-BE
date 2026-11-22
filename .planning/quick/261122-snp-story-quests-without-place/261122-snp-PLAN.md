---
phase: quick-261122-snp
plan: 01
type: tdd
autonomous: true
branch: fix/story-quests-without-place
files_modified:
  - src/models/quest/quest-infos.model.ts
  - src/schema.gql
  - src/models/quest/quest-place.schema.spec.ts
  - src/quests/quest-board.int-spec.ts
  - src/quests/acceptance/quest-acceptance.service.int-spec.ts
  - src/quests/pending-requests/pending-requests.resolver.int-spec.ts
  - src/quests/guided/guided-completion.service.int-spec.ts
  - test/app.int-spec.ts
---

# Quick 261122-snp: una story può vivere senza luogo

## Parole dell'utente (2026-11-22)

Il gioco ha quattro quest `story` permanenti, una per rango (`requirements.minTitle` rookie, adventurer, paladin, mage), «vuote»: niente premi, niente nemici, NESSUN luogo.

> «Le uniche quest senza markerLocation sono queste story quest. Tutto il resto ha sempre la posizione.»

Si accettano da qualunque città (già vero: l'accettazione salta `locationInQuestCity` per la corsia story e `autoRequestOf` non crea movimento senza marker).

## Stato di partenza

- `QuestInfos.markerLocation` è `PointOfInterest!` sul filo e `required: true` nel prop Mongoose: una story senza luogo non si può salvare e, scritta a mano, annullerebbe l'intero Tabellone di ogni personaggio di quel rango.
- Il secondo `markerLocation: PointOfInterest!` dello SDL è `City.markerLocation`: non c'entra e resta com'è.
- `QuestInput`/`QuestInfosInput` non sono usati da nessuna mutation (lo SDL non li contiene, lo afferma `test/app.int-spec.ts`): l'unica validazione della creazione di una quest è lo schema Mongoose.

## Design

1. **Filo:** `QuestInfos.markerLocation: PointOfInterest` (nullable). Unico cambio dello SDL.
2. **Modello:** `required` condizionale: obbligatorio per ogni tipo tranne `story`. Una non-story senza luogo fallisce ancora la validazione Mongoose.
3. **Input:** `QuestInfosInput.markerLocation` facoltativo (nessuna mutation lo usa: resta allineato al modello, la regola la applica lo schema).
4. **Lettori:** audit di ogni lettore di `infos.markerLocation` sui percorsi di una story; si cambia solo ciò che non tollera il null. Nessuna regola nuova: dove serve un luogo (pool dei nemici della bozza guidata) resta la regola di oggi, luogo della bozza o posizione del personaggio.
5. Nessun migratore, nessun seeder, nessun file di contenuto.

## Task

1. **Documenti** — questo piano.
2. **RED** (`test(quests): …`), titoli con «(quick 261122-snp)»:
   - `quest-place.schema.spec.ts`: story senza luogo valida; ogni altro tipo senza luogo rifiutato; story con luogo valida.
   - `test/app.int-spec.ts`: `markerLocation: PointOfInterest` nel blocco `QuestInfos`.
   - `quest-board.int-spec.ts`: story senza luogo sul Tabellone del suo rango con `markerLocation` null e nessun errore; non-story senza luogo rifiutata alla creazione.
   - `quest-acceptance.service.int-spec.ts`: story senza luogo accettata da una città, nessun viaggio, corsia presa, punti spesi.
   - `pending-requests.resolver.int-spec.ts`: la story senza luogo arriva nella coda dell'oste.
   - `guided-completion.service.int-spec.ts`: bozza → `completeGuidedMission`, rango avanzato, quest non conclusa e ancora accettabile da un altro.
3. **GREEN** (`fix(quests): …`) con `src/schema.gql` rigenerato da `test/app.int-spec.ts`.
4. **Chiusura** — SUMMARY e riga in «Quick Tasks Completed» di `.planning/STATE.md`.

## Vincoli

- Il BE dell'utente gira da `dist/` sulla 3001: niente `npm run build/lint/format`, DB reale e processo non si toccano; prettier ed eslint sui soli file toccati; `npx tsc --noEmit -p tsconfig.json` a 0.
