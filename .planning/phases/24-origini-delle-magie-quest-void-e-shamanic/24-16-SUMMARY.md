---
phase: 24-origini-delle-magie-quest-void-e-shamanic
plan: 16
subsystem: push
tags: [spells, learning, research, push, fcm, tdd]
requires: ["24-15"]
provides:
  - "PushEventType.spellResearchSucceeded e PushEventType.spellResearchFailed (SDL: due righe aggiunte)"
  - "durationLabelOf: durata in italiano per i corpi dei push"
  - "builder spellResearchSucceeded(resultId, spellName, learnTimeMs) e spellResearchFailed(resultId)"
  - "CommittedResult.researchFailed; OutcomeWriter.deliver sceglie il push per voce"
affects: ["24-17", "24-18"]
tech-stack:
  added: []
  patterns: ["messaggio del push costruito da funzioni pure per voce, un solo notify best-effort con WARN di soli tipo e id"]
key-files:
  created:
    - src/push/duration-label.ts
    - src/push/duration-label.spec.ts
  modified:
    - src/push/push-event-type.enum.ts
    - src/push/push-events.ts
    - src/push/push-events.spec.ts
    - src/push/push.exception.spec.ts
    - src/push/transport/fcm-message.spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
    - src/quests/outcomes/outcome-writer.service.ts
    - src/quests/outcomes/outcome-writer.spec.ts
    - src/quests/outcomes/study-spell-draw.int-spec.ts
    - src/quests/outcomes/spell-learning.int-spec.ts
    - src/quests/outcomes/boss-resolution.int-spec.ts
decisions:
  - "Ricerca riuscita: push spellResearchSucceeded con id = QuestResult della ricerca (foglio con spellFound), dopo la pianificazione del job; nessun questEnd in quel momento (D-29, D-31)"
  - "Ricerca senza magia (spellResearchFailed vero sul foglio): push spellResearchFailed AL POSTO di questEnd, anche nei gruppi e per chi non è mago (D-29)"
  - "Fine dell'apprendimento: questEnd col secondo foglio, invariato dal piano 15 (D-31)"
metrics:
  completed: 2026-11-16
  tasks: 3
  commits: 5
---

# Phase 24 Plan 16: push di fine «Fase di ricerca» — Summary

Due tipi di push personali (TTL 1 h, con id, validi per `sendTestPush`) e una funzione pura per la durata in italiano. Dopo il commit `OutcomeWriter.deliver` manda `spellResearchSucceeded` per ogni ricerca riuscita (id del foglio della ricerca, nome della magia, durata dell'apprendimento) e `spellResearchFailed` al posto di `questEnd` per ogni foglio con `spellResearchFailed` vero; la fine dell'apprendimento continua a mandare `questEnd` col secondo foglio. Payload FCM data-only con le chiavi di oggi.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 (RED) | 6a7e059d | test(push): expect the research outcome pushes |
| 1 (GREEN) | 013b10b0 | feat(push): add the research outcome pushes |
| 2 (RED) | d8599260 | test(quests): expect the research outcome pushes after the commit |
| 2 (GREEN) | 0232708a | feat(quests): push the outcome of the research |
| 3 | (questo) | docs(phase-24): record plan 16 progress |

## Copy finale

| Tipo | title | body del catalogo (push di prova) | body del builder |
|------|-------|-----------------------------------|------------------|
| `spellResearchSucceeded` | `Ricerca riuscita` | `Hai scoperto una magia: comincia l'apprendimento.` | `Hai scoperto «<nome>»: l'apprendimento dura <durata>.`; senza nome `Hai scoperto una magia: l'apprendimento dura <durata>.` |
| `spellResearchFailed` | `Ricerca conclusa` | `Nessuna magia scoperta: scopri com'è andata la missione.` | uguale al catalogo |

Durata (`durationLabelOf`): minuti arrotondati al più vicino, minimo 1; `1 minuto`, `30 minuti`, `1 ora`, `1 ora e 30 minuti`, `2 ore e 1 minuto`, `12 ore`.

## SDL

Due righe aggiunte in `enum PushEventType`, nessuna tolta; l'ordine di `sortSchema` coincide col pin del piano:

```
+  spellResearchFailed
+  spellResearchSucceeded
```

## RED

- Task 1: atteso compilazione di ts-jest; osservato a runtime (diagnostica di ts-jest disattivata): `spellResearchSucceeded is not a function` (push-events e fcm-message) e `Could not locate module src/push/duration-label`. Il blocco SDL del boot non è stato eseguito in RED (il pin di `test/app.int-spec.ts` è stato aggiornato prima, insieme alle spec unit).
- Task 2, unit: 4 falliti su 28 (i quattro casi nuovi). Integration: 3 falliti su 48 (successo e fallimento della ricerca in `study-spell-draw`, i due push in `spell-learning`).
- Verdi al primo colpo (motivo): `keeps the quest end push for a study without a draw (D-29)` e `keeps the quest end push when the fixed spell wins over the draw (D-29, D-30)`: casi di non regressione, `questEnd` era già il push di questi fogli.

## Gate

- `npx jest src/push --selectProjects unit`: 11 suite, 179 / 179.
- `npx jest src/push/push.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand`: 2 suite, 128 / 128; `src/schema.gql` rigenerato col solo diff delle due righe, committato in `013b10b0`.
- `npx jest src/quests/outcomes/outcome-writer.spec.ts src/push --selectProjects unit`: 207 / 207.
- `npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/spell-learning.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/outcomes/boss-resolution.int-spec.ts src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand`: 5 suite, 122 / 122.
- Controllo più largo: `npx jest src/quests/outcomes --selectProjects integration --runInBand` 17 suite, 277 / 277; `--selectProjects unit` 43 suite, 993 / 993.
- `npx tsc --noEmit -p tsconfig.json`: 0. Prettier ed ESLint puliti sui file toccati. Nessun jest rimasto.
- Accettazione: `export function durationLabelOf` 1, `export const spellResearchSucceeded` 1, `export const spellResearchFailed` 1; `git diff HEAD~2 -- src/schema.gql` dopo il task 1: 2 righe aggiunte, 0 tolte; `spellResearchSucceeded` nel writer 2, `spellResearchFailed` 4; `D-29)` in `push-events.spec.ts` 4, in `study-spell-draw.int-spec.ts` 3.

## Deviations from Plan

1. **[Rule 3] `src/push/push.exception.spec.ts` aggiornato nel commit GREEN del task 1:** pinna `Object.values(PushEventType)` per intero; non era fra i file del piano e l'ho visto fallire solo dopo aver aggiunto i valori all'enum. Due voci in coda, nessuna logica cambiata.
2. **[Rule 1] `boss-resolution.int-spec.ts` aggiornato nel commit GREEN del task 2:** il caso del piano 14 `keeps only the member whose research found a spell engaged on the learning part` attendeva un `questEnd` per il membro che ha mancato il sorteggio; per contratto (D-29) quel foglio manda ora `spellResearchFailed`. L'attesa diventa la lista esatta dei due push (`spellResearchFailed` per b, `spellResearchSucceeded` per a) e il titolo prende `D-29`.
3. **Spec della fine dell'apprendimento:** `researched()` è stato spezzato in `persistResearcher()` + `research(subject)` per registrare il device PRIMA della ricerca (il caso nuovo conta anche il push della ricerca); comportamento degli altri casi invariato.
4. **Caso esistente del writer** `schedules the end of the learning part … and sends no quest end push for the research sheet (D-26, D-31)`: l'attesa «nessun push» diventa «nessun `questEnd`» (ora parte `spellResearchSucceeded`).
5. **Caso in più:** `keeps a generic research success body for the test push (D-29)` (il push di prova usa il corpo del catalogo).
6. **Grep di accettazione impossibili come scritti:** `grep -c "D-29)" spell-learning.int-spec.ts` ≥ 1 e `outcome-writer.spec.ts` ≥ 4: i titoli imposti dal piano stesso hanno `(D-29, D-31)`, quindi `D-29)` conta 0 e 3. Con `D-29[,)]` i conteggi sono 1 e 4.
7. **VALIDATION allineata alle revisioni (richiesta dell'orchestratore):** righe `24-17-01` e `24-18-01` con `researchResult` al posto di `learningResult`; `24-17-02` col controllo di `spellFound: Spell` in `type QuestResult`; `24-18-01` con sei righe aggiunte invece di cinque; `24-18-02` col controllo di `spellFound: Spell` nel handoff.

## Threat Flags

Nessuna superficie nuova oltre al piano: T-24-53 (data-only, chiavi di oggi; nel corpo solo nome di catalogo e durata), T-24-55 (consegna best-effort: caso `warns with ids only when the research push fails (D-29)` prova che il job e le altre consegne restano, WARN senza nome né errore) e T-24-56 (pin prima, SDL dal boot di test) mitigati; T-24-54 accettato (stessa mutation e guardia).

## Self-Check: PASSED
