---
phase: 19-revisione-dei-modelli
plan: 17
subsystem: characters
tags: [spellStates, active, migratore, D-07, D-16, D-12, D-08]
requires: [19-16]
provides:
  - "`SpellState.active: Boolean!` su modello (default `false`) e SDL, additivo: nessun lettore né scrittore lo usa ancora"
  - "`mergeSpellLists` (pura) e `SpellStatesStep` (nono e ultimo in `STEPS`), builder `legacyCharacterWithSpells` in `legacy-fixtures.ts`"
affects: [19-18, 19-19, 19-20, 19-23]
tech-stack:
  added: []
  patterns: [funzione pura di fusione a tabella + passo a una sola scrittura per documento col driver nativo]
key-files:
  created:
    - src/migrations/model-review/spell-states.step.ts
    - src/migrations/model-review/spell-states.step.spec.ts
    - src/migrations/model-review/spell-states.step.int-spec.ts
  modified:
    - src/models/character/spell-state.model.ts
    - src/models/character/spell-state.schema.spec.ts
    - src/migrations/model-review/legacy-fixtures.ts
    - src/migrations/model-review/model-review.module.ts
    - test/app.int-spec.ts
    - src/schema.gql
    - src/quests/outcomes/quest-resolution.service.int-spec.ts
    - src/quests/outcomes/quest-combat.int-spec.ts
    - src/quests/outcomes/gm-completion.service.int-spec.ts
    - src/quests/outcomes/study-spell-draw.int-spec.ts
decisions:
  - "Quando la lista delle equipaggiate esiste è lei la verità di `active` (un flag già presente sulla voce viene ricalcolato); solo se la lista è già stata tolta a mano il flag della voce resta com'è"
  - "`droppedStates` conta ogni voce di stato non usata dalla fusione: magia non conosciuta, ref illeggibile, voce doppia della stessa magia"
  - "Una magia ripetuta nella lista delle conosciute produce una sola voce (la prima occorrenza fissa la posizione)"
  - "Oltre alla riga dei conteggi il passo scrive una riga di avviso per personaggio con anomalie: solo `_id` del personaggio e i tre conteggi"
metrics:
  completed: 2026-11-11
  tasks: 3
  files: 13
---

# Phase 19 Plan 17: `SpellState.active` additivo e passo della lista unica — Summary

Le voci di stato delle magie portano il flag `active` su modello e SDL senza che nulla lo legga ancora, e il migratore ha il suo nono passo: `mergeSpellLists` fonde conosciute, stati ed equipaggiate in un'unica lista in ordine di apprendimento e `SpellStatesStep` la scrive togliendo i due campi vecchi nella stessa scrittura. Primo di quattro piani di BE-MODEL-06 (D-07): nessun lettore, scrittore, né la riparazione permanente è stata toccata.

## Commit

| Task | Commit | Subject (caratteri) |
|------|--------|---------------------|
| 1 RED | `524746a2` | `test(models): pin the active flag of a spell state` (50) |
| 1 GREEN | `b6d1bd3c` | `feat(models): add the active flag to the spell state` (52) |
| 2 RED | `86d0011d` | `test(migrations): pin the merge of the three spell lists` (56) |
| 2 GREEN | `03660ed5` | `feat(migrations): add the spell lists merge step` (48) |
| 1 (coda) | `6e6d03f2` | `test(quests): expect the active flag on stored spell states` (59) |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 17`, `docs(phase-19): record plan 17 progress` |

Ogni subject contato PRIMA del commit; nessun trailer (controllo a `0` dopo ognuno).

## Evidenza RED

**`524746a2` (Task 1):**
- Unit, 2 rossi su 7 in `spell-state.schema.spec.ts`: `defaults a spell state to not active (D-07)` (la voce non ha il campo) e `keeps the active flag of a stored spell state (D-07)` (lo strict scarta il flag passato al costruttore).
- Boot reale, 1 rosso su 90: `writes the spell state contract into the generated schema` (blocco esatto con `active: Boolean!` contro lo SDL vecchio).
- Nota: la prima stesura del secondo caso usava `hydrate` ed era verde al primo colpo (l'idratazione non scarta i campi fuori schema): riscritto col costruttore prima del commit, così è rosso per il motivo giusto.

**`86d0011d` (Task 2):** le due spec non si caricano (`Cannot find module './spell-states.step'`): 14 casi unitari e 9 di integrazione non eseguiti. Nessun caso verde al primo colpo.

## Cosa è cambiato

- **Modello e SDL (`b6d1bd3c`):** `@Field(() => Boolean) @Prop({ type: Boolean, default: false }) active` dopo `recoveries`, con il commento sulla regola (una sola lista in ordine di apprendimento, D-07, D-16). `git diff` dello SDL: la sola riga `active: Boolean!` in `type SpellState`; `type ActiveSpell` invariato. Nel boot reale l'asserzione di `SpellState` è ora il blocco esatto (`match(...)?.[0]` con `toBe`).
- **`mergeSpellLists(lists, maxUsagesOf)` (`03660ed5`):**
  - conosciute = `status.spells` nell'ordine (ref illeggibile saltato, stringa esadecimale legacy letta come id); se il campo NON è una lista, le conosciute sono le magie delle voci di stato, nell'ordine;
  - voce = quella dello stesso indice se punta alla stessa magia, altrimenti la prima con lo stesso id; `recoveries` conservati (lista vuota se assenti);
  - usi = quelli della voce; se diversi da quelli dell'equipaggiata vince la voce e `usageConflicts` sale; voce mancante: usi dell'equipaggiata, poi `maxUsages` del catalogo, poi 0 (la regola della riparazione di oggi);
  - `active` = magia presente nella lista delle equipaggiate; equipaggiata di una magia non conosciuta: nessuna voce, `unknownActive` sale; stato di una magia non conosciuta: lasciato fuori, `droppedStates` sale.
- **`SpellStatesStep`:** label `lista delle magie`; driver nativo, collection da `connection.model(Character.name).collection`, nessun filtro sugli archiviati; catalogo delle magie letto una volta (`_id`, `maxUsages`, solo interi ≥ 0); guardia = `status.spells` o `assets.activeSpells` presenti (mai `active`); per documento UNA scrittura che imposta `status.spellStates` e toglie `status.spells`, `assets.activeSpells` e `status.maxActiveSpells`. Report: `found` = personaggi della collection, `migrated` = personaggi scritti, `alreadyDone` = `found − migrated`, `unmatched` = somma dei tre conteggi. `forFeature` del modulo invariato (`Character` e `Spell` c'erano già).
- **Fixture:** `legacyCharacterWithSpells({ spells, spellStates, activeSpells }, overrides)` sopra `legacyCharacterWithPets`: una lista non data resta assente; gli override di `status` e `assets` si fondono con quelli di base.

## `STEPS` dopo questo piano (nove passi, ordine di D-13 — per il runbook del 19-23)

| # | Classe | Label nel log |
|---|--------|---------------|
| 1 | `EnemyWeaknessesStep` | `debolezze dei nemici` |
| 2 | `EnemySpellsStep` | `magie dei nemici` |
| 3 | `PetCatalogStep` | `catalogo dei pet` |
| 4 | `OwnedPetsStep` | `pet posseduti` |
| 5 | `PoiQuestStep` | `back-link dei POI` |
| 6 | `CityShopStep` | `pool dei negozi` |
| 7 | `LoreImagePathStep` | `immagini delle lore` |
| 8 | `WornEquipmentStep` | `equipaggiamento indossato` |
| 9 | `SpellStatesStep` | `lista delle magie` |

`forFeature`: `Enemy`, `Spell`, `Pet`, `Character`, `PointOfInterest`, `City`, `Lore` (invariato).

## Riga attesa alla prova a secco e al boot reale (inventario dell'11 novembre)

7 personaggi, 2 con magie (al più 8), liste sempre della stessa lunghezza, 3 magie attive, nessuna sconosciuta, nessun conflitto di usi, `maxActiveSpells` mai persistito:

```
Revisione dei modelli, lista delle magie: trovati 7, migrati 7, già a posto 0, senza corrispondenza 0
```

- `migrati` conta i personaggi che hanno ANCORA almeno uno dei due campi vecchi, anche come lista vuota (non «quelli con magie»): 7 se, come ci si aspetta dai default dello schema pre-19, i due campi esistono su tutti. L'inventario ha contato i personaggi con magie, non la presenza dei campi: **nella prova a secco contare i documenti con `status.spells` o `assets.activeSpells` presenti** — quel numero è il `migrati` atteso (minimo 2).
- Dopo il passo: 3 voci con `active: true` in tutto, somma delle voci = somma delle conosciute di prima, nessuna riga di avviso.
- Secondo boot: `trovati 7, migrati 0, già a posto 7, senza corrispondenza 0`.

## AVVERTENZA di runtime per il runbook (fra questo piano e il 19-18)

A questo commit il passo una tantum e la riparazione permanente (`SpellStateMigrator`, Phase 9.1) **coesistono e sono incompatibili**: il passo toglie `status.spells`; al boot la riparazione permanente, che ricostruisce gli stati a partire da quella lista, vedrebbe «nessuna magia conosciuta» e **svuoterebbe `status.spellStates`** (e lo stesso farebbero i lettori e gli scrittori, ancora sulle liste vecchie). Inoltre il taglio permanente riscrive una voce fuori dai limiti con i soli `spell`, `usages`, `recoveries`: perderebbe `active` (da correggere nel 19-18, D-21).

È innocuo SOLO perché a metà fase non si costruisce e non si avvia nulla: **build e boot soltanto dalla HEAD della fase** (dopo 19-20), mai da un commit intermedio 19-17..19-19, e mai codice pre-19 sul database migrato. Nei test non si incontra: il boot reale di test gira su collection vuote e gli harness non importano il modulo del migratore.

## Esito delle prove

- `npx jest --selectProjects unit` → **272 suite, 3447 test** verdi, eseguita prima di ogni commit GREEN (271 / 3431 dopo il piano 16: +1 suite; +2 casi dello schema, +14 della fusione).
- Progetto integration intero, a pezzi, in primo piano, un jest alla volta, nessun comando spostato in background — **147 suite, 2022 test, tutti verdi** (146 / 2013 dopo il piano 16; +1 suite, +9 casi del passo):
  - `src/characters test/app.int-spec.ts` → 24 suite, 472 test (77 s); boot reale 90 test, `git diff --exit-code src/schema.gql` a 0.
  - `src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures` → 29 suite, 419 test (102 s).
  - `src/quests` → 35 suite, 512 test (161 s) dopo `6e6d03f2` (vedi deviazione 1).
  - resto (`src/migrations` compreso) → 59 suite, 619 test (113 s).
- Verifiche mirate dei task: `test/app.int-spec.ts src/characters/spells` → 8 suite, 170 test; `src/migrations/model-review test/app.int-spec.ts` → 10 suite, 142 test.
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni commit di codice. Prettier ed eslint sui file toccati, uno per uno: puliti (resta l'avviso preesistente di `test/app.int-spec.ts`). `pgrep -fl 'bin/jest'` vuoto a fine di ogni task.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| `active: Boolean!` nel blocco `type SpellState` di `src/schema.gql` | 1 |
| righe tolte dallo SDL (`git diff HEAD~2 -- src/schema.gql`, dopo il GREEN del Task 1) | 0 |
| `grep -c "D-07)"` in `spell-state.schema.spec.ts` | 2 |
| `grep -c "export function mergeSpellLists"` in `spell-states.step.ts` | 1 |
| `grep -c "D-07)"` / `"D-16)"` in `spell-states.step.spec.ts` | 11 / 1 |
| `grep -c "D-07)"` / `"D-08)"` in `spell-states.step.int-spec.ts` | 7 / 1 |
| `grep -c "ACTIVE_CHARACTER_FILTER"` in `spell-states.step.ts` | 0 |
| `grep -cE "Step\b"` in `model-review.module.ts`; file senza l'intestazione una tantum | 21; nessuno |

## Deviazioni dal piano

**1. [Regola 1] quattro attesi di `src/quests/outcomes` aggiornati in un commit a parte (`6e6d03f2`)**
- **Trovato durante:** corsa dell'intero progetto integration prima del SUMMARY.
- **Problema:** quattro int-spec fuori da `files_modified` confrontano con `toEqual` le voci di stato rilette dal documento idratato, che ora porta il default `active: false`: `quest-resolution.service.int-spec.ts` (`teaches the study spell when the xp after the prize is enough`), `quest-combat.int-spec.ts` (`spends the spell usages and schedules their recovery`), `gm-completion.service.int-spec.ts` (`schedules a recovery for every spell use the game master reports`), `study-spell-draw.int-spec.ts` (`teaches a spell drawn among the unknown learnable ones (D-31)`).
- **Fix:** `active: false` aggiunto alle sei voci attese (il piano lo prevedeva: «aggiornare l'atteso e annotarlo»). Nessun codice di produzione.
- **Conseguenza:** la verifica mirata del Task 1 (unit intero + `test/app.int-spec.ts src/characters/spells`) era verde e non copriva `src/quests`: i commit `b6d1bd3c`..`03660ed5` hanno queste quattro int-spec rosse; da `6e6d03f2` tutto verde. Nessun amend possibile.
- Le spec esistenti delle magie (`src/characters/spells`) NON sono state toccate.

**2. [Regola 2] casi e regole in più rispetto al `<behavior>`**
- Unit: `keeps the flag of the state when the equipped list is already gone (D-07)` (simmetrico alla regola delle conosciute assenti: senza la lista delle equipaggiate non si spegne nulla) e `reads absent lists as a character without spells (D-07)`.
- Integration: `fills a missing state from the catalogue maximum (D-07)` (prova il key link col catalogo sul replica set) e `counts the anomalies of a character and logs them with its id only (D-07)` (riga di avviso con il solo `_id` e i tre conteggi: «contato e riportato nel log»).
- `droppedStates` conta anche le voci doppie o illeggibili, e una conosciuta ripetuta dà una sola voce: nulla esce dalla lista senza essere contato (T-19-67).

**3. [Ordine dei commit di chiusura e forma di STATE] come nei piani 01–16**
- SUMMARY in un commit suo prima del bookkeeping; `Plan: 17 of 23`.

Nessuna decisione architetturale (Regola 4).

## Problemi rimandati (fuori scope, non corretti)

- Restano dai piani precedenti: `CLAUDE.md` del repo BE con il nome vecchio dell'equipaggiamento nella sezione generata; `cities { pointsOfInterest { id } }` non popolato da `findAll`.

## Note per i piani successivi

- **19-18 (scrittori + riparazione):** il taglio permanente (`spellStatesTrimPipeline`, `spell-state.migration.ts`) ricostruisce la voce fuori dai limiti con tre soli campi: deve conservare `active` (D-21). La coerenza e la riparazione leggono `status.spells`: vanno tolte nello stesso piano degli scrittori, come da regole dure.
- **Filo:** `spellsOnTheWire` (`spell-state.mapper.ts`) filtra le voci ma le passa intere: con il documento idratato `active` esce già col default `false`. Una lettura lean di una voce pre-migrazione NON ha il campo: chi serve `active: Boolean!` da una lettura lean prima del boot reale deve passare dal default (nessuna selezione del campo esiste oggi nei test del filo).
- **Attesi con `toEqual` sulle voci di stato:** ogni voce riletta da un documento idratato porta `active`; quando gli scrittori lo imposteranno, gli stessi quattro casi di `src/quests/outcomes` (deviazione 1) e quelli di `src/characters/spells` andranno rivisti.
- **Fixture:** `legacyCharacterWithSpells` scrive ancora il campo vecchio dell'equipaggiamento (viene da `legacyCharacterWithPets`): nelle chiavi attese di `assets` dell'int-spec del passo compare quel nome, voluto.
- **19-20:** `CHARACTER_ASSETS_BLOCK` porta ancora la riga delle equipaggiate e il blocco `type CharacterStatus` la lista delle conosciute; `type ActiveSpell` è ancora pinnato esatto nel caso `writes the spell state contract into the generated schema`.
- **19-23 (runbook):** tabella dei nove passi, riga attesa e AVVERTENZA di runtime qui sopra; controllo in più della prova a secco: numero di documenti con uno dei due campi vecchi presenti.
- **Conteggi:** unit 272 suite / 3447 test; integration 147 suite / 2022 test (pezzi 24/472, 29/419, 35/512, 59/619); boot reale 90 test; registro dei ref invariato (34).

## Stub noti

Nessuno. `SpellState.active` è volutamente senza lettori né scrittori fino ai piani 19-18 e 19-19 (catena dichiarata nel piano).

## Threat flags

Nessuna superficie nuova fuori dal threat model: T-19-67 (tabella pura: indice, id, voce mancante, conflitto; anomalie contate), T-19-68 (guardia sui campi vecchi tolti nella stessa scrittura, caso dedicato su `active`, seconda corsa a zero), T-19-69 (equipaggiata non conosciuta: nessuna voce) e T-19-70 (blocco esatto, diff di sole aggiunte) mitigati.

## Self-Check: PASSED

- `src/migrations/model-review/spell-states.step.ts`, `.spec.ts`, `.int-spec.ts` esistono; i commit `524746a2`, `b6d1bd3c`, `86d0011d`, `03660ed5`, `6e6d03f2` sono in `git log`; `git status --short` vuoto prima di questo documento.
