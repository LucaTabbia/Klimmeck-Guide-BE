---
phase: 10-hardening-trasversale
plan: 25
subsystem: coverage-gate
tags: [coverage, economy, spells, equipment, acceptance, travel, concurrency, D-16, BE-HARD-04]
requires:
  - "10-24: `test:cov`, `coverageThreshold` per cartella (8 chiavi), `coverage/coverage-summary.json`"
  - "10-22: avvio da soli sul marker (D-22) già coperto in `travel-completion.int-spec.ts` e `quest-acceptance.service.int-spec.ts`"
  - "10-18: `FAILED_JOBS_KEPT` (limite dei falliti di Bull)"
provides:
  - "test nominati di concorrenza e failure mode per economia, magie, equipaggiamento, accettazione e viaggi (checklist F6)"
  - "nuova spec unit `src/travel/travel-scheduler.service.spec.ts`"
  - "soglie `coverageThreshold` alzate a floor(misura nuova − 2), mai sotto il 10-24"
affects: [10-26, 10-27, 10-28, 10-29, 10-31]
tech-stack:
  added: []
  patterns:
    - "snapshot stantio simulato avvolgendo `exec` della query reale di `findOne` (stesso schema della spia su `cities.exists`)"
    - "gara vendita/equip ripetuta a round con invariante «mai venduto e ancora indossato» espressa come `toContainEqual` su due stati ammessi"
key-files:
  created:
    - src/travel/travel-scheduler.service.spec.ts
  modified:
    - package.json
    - src/economy/trade/shop-transaction.service.int-spec.ts
    - src/economy/trade/catalog-prices.reader.int-spec.ts
    - src/economy/trade/do-transaction.int-spec.ts
    - src/characters/spells/spell-recovery.service.int-spec.ts
    - src/characters/spells/spell-recovery.processor.spec.ts
    - src/characters/spells/spell-state.migrator.int-spec.ts
    - src/characters/equipment/equip-item.int-spec.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/travel/travel-sweeper.spec.ts
    - src/travel/travel-completion.int-spec.ts
decisions:
  - "Soglie nuove = floor(misura nuova − 2) per metrica; nessuna è scesa sotto il 10-24 (16 righe cambiate, tutte in aumento salvo equipaggiamento invariato a 98/98/98)"
  - "I rami ancora scoperti sono quasi tutti metadati dei decoratori dei costruttori (`typeof X === 'undefined'` emessi da TypeScript): non coperti di proposito, nessun test artificiale"
  - "Nessun file di produzione toccato: tutti i test nuovi sono nati verdi, nessun bug trovato"
metrics:
  duration: "~20 min (più 2 run di test:cov da ~5 min)"
  completed: "2026-10-30"
  tasks: 2
  files: 12
---

# Phase 10 Plan 25: test di concorrenza e failure mode delle aree atomiche e dei viaggi, soglie alzate Summary

Economia, magie, equipaggiamento, accettazione e viaggi hanno ora test nominati per le gare (vendita dell'ultima copia contro `equipItem`, equip concorrenti sullo stesso slot) e per i failure mode (snapshot stantio respinto dalla guard della scrittura, migrazione per personaggio fallita, job anticipati o malformati, accodamento del viaggio fallito o senza risposta → WARN e sweep, sweep fallito o interrotto). Le soglie per cartella sono alzate alla nuova misura − 2 e `npm run test:cov` esce 0.

## Commit

| Task | Nome | Commit | Tipo |
| ---- | ---- | ------ | ---- |
| 1 | economia: gara vendita/equip, snapshot stantio, scambio a saldo zero, legacy | ac90832 | test |
| 1 | magie: memoria degli increditabili, migrazione fallita, job legacy/malformati | c46bc6e | test |
| 1 | equipaggiamento: equip concorrenti, id malformato oltre la pipe, rilettura popolata | 69d9d06 | test |
| 1 | accettazione: personaggio senza posizione, quest legacy senza lista registrati | 08d4896 | test |
| 2 | viaggi: scheduler (nuova spec), sweeper, completamento con PendingQuest incompleta | a71e1f2 | test |
| 2 | soglie alzate | e6fb9ac | test |

## Test per voce della checklist (RESEARCH F6)

Tutti verdi al primo colpo: il comportamento era già corretto, i test sono di caratterizzazione dei rami e delle gare scoperti dalla coverage del 10-24 (nessun commit GREEN, nessun file di produzione cambiato).

**Economia**
- Vendita concorrente dell'ultima copia contro `equipItem` — `doTransaction (wire)` › «sells the last copy or equips it, never both, under concurrency» (6 round; stato finale sempre «venduto, slot vuoto, +75» oppure «tenuto e indossato»).
- Fallimento dopo la scrittura delle monete con rollback — già coperto: «leaves no partial state when the transaction fails after both writes» (piano 04).
- Guard della scrittura dell'inventario (riga 204) — «pays nothing when the sold copy is gone at write time (INSUFFICIENT_ITEM_QUANTITY)».
- Ramo `netCopper` zero — «settles a trade that nets to zero without touching the wallet».
- Inventario legacy — «buys for a legacy character stored without an inventory»; le stringhe legacy erano già coperte da «sells a legacy entry whose item id was stored as a string».
- `catalog-prices.reader.ts` — «reads a legacy catalog entry stored without prices as untradable», «reads equipment and loot in one call, each from its own catalog» (gli unici rami scoperti erano metadati dei decoratori).

**Magie**
- `spell-recovery.service.ts` — «forgets the oldest uncreditable pair beyond the memory limit and warns about it again» (righe 121-122), «credits nothing and lets the error through when the per-character migration fails», «credits nothing and warns when the legacy job names a spell missing from the catalog» (ramo 79).
- Processor con job anticipato — già coperto dal piano 08 («a job fired a couple of seconds early…», «waits for a job early by exactly the tolerance», «leaves a job early by more than the tolerance to the sweep…»); aggiunti «tolerates a recovery job that fires early up to the tolerance, not one millisecond more», «ignores a malformed job with a warning naming only its id, without crediting», «routes a job queued before the deploy, without an instant, to the legacy credit at once».
- Migrator con fallimento — già coperto: «never blocks the boot when the migration fails»; aggiunto «leaves the states of a catalog spell with an invalid maxUsages as stored, without warnings» (ramo 168).

**Equipaggiamento**
- «equips one item per slot under concurrent equips».
- `itemId` malformato → `BAD_USER_INPUT` — già coperto dal piano 10-08 («rejects a malformed item id with BAD_USER_INPUT (D-02)»), non duplicato; aggiunto il ramo del servizio oltre la pipe: «rejects a malformed item id that reaches the service past the pipe with ITEM_NOT_OWNED» (`characters.service.ts` righe 171-172).
- «reads the equipped item back populated from the owned equipments» (`characters.service.ts` riga 136).

**Accettazione**
- «rejects a world mission of a character without a location with QUEST_NOT_IN_CITY and writes nothing» (ramo 328).
- «registers the first adventurer of a legacy quest stored without the registration list» (ramo 389).
- Avvio da soli sul marker — già coperto dal piano 10-22 («starts a solo quest accepted on its marker at the commit (D-22)»), non duplicato.

**Viaggi**
- `travel-scheduler.service.ts` (spec nuova, 11 test): «warns and relies on the sweep when the travel job cannot be enqueued», «warns and relies on the sweep when the queue does not answer within the timeout», «enqueues the completion trigger at the travel end, keeping a bounded failed history (D-17a)» (verifica `FAILED_JOBS_KEPT`, piano 10-18), «fires at once for a travel already over», `cancel` (rimozione, job assente, rimozione fallita, rimozione senza risposta), «warns once per process with %s and no connection details» (codice errno, nome senza codice, nessun errore).
- `travel-sweeper.ts`: «logs %s when a completion fails without a code» (nome dell'errore, valore nudo, null), «logs only the code when the boot sweep fails to read the due travels» (riga 103), «sweeps again on the next tick after a failed sweep», «finishes the sweep in flight when the module is destroyed, then stops ticking», «does not count a stale completion as completed». Lo sweep spento con 0 era già coperto.
- `travel-completion.service.ts`: describe «pending quests stored incomplete» › «starts a solo quest with a zero waiting time when the pending quest stores none» (ramo 152), «records the arrival of a pending quest without a quest and starts nothing» (rami 137/147).

## Soglie (tabella finale)

| Area | Baseline RESEARCH (S / B / L) | Misura 10-24 | Soglia 10-24 | Misura finale | Soglia finale |
| --- | --- | --- | --- | --- | --- |
| `./src/auth/` | 99.66 / 85.05 / 99.81 | 99.66 / 85.04 / 99.80 | 97 / 83 / 97 | 99.83 / 86.71 / 100 | 97 / 84 / 98 |
| `./src/economy/` | 99.62 / 91.84 / 99.57 | 99.62 / 91.83 / 99.56 | 97 / 89 / 97 | 100 / 93.88 / 100 | 98 / 91 / 98 |
| `./src/characters/spells/` | 98.53 / 88.56 / 98.89 | 98.52 / 88.55 / 98.89 | 96 / 86 / 96 | 99.26 / 90.05 / 99.45 | 97 / 88 / 97 |
| `./src/characters/equipment/` | 100 / 100 / 100 | 100 / 100 / 100 | 98 / 98 / 98 | 100 / 100 / 100 | 98 / 98 / 98 |
| `./src/characters/characters.service.ts` | 96.24 / 86.20 / 96.77 | 96.52 / 86.53 / 98.13 | 94 / 84 / 96 | 98.26 / 90.38 / 100 | 96 / 88 / 98 |
| `./src/quests/acceptance/` | 99.39 / 91.94 / 100 | 99.10 / 91.66 / 100 | 97 / 89 / 98 | 99.41 / 93.25 / 100 | 97 / 91 / 98 |
| `./src/eventsub/` | 98.80 / 91.64 / 99.32 | 98.79 / 91.64 / 99.32 | 96 / 89 / 97 | 99.40 / 94.03 / 99.49 | 97 / 92 / 97 |
| `./src/travel/` | 99.53 / 85.10 / 99.48 | 99.09 / 84.05 / 99.49 | 97 / 82 / 97 | 99.55 / 86.96 / 100 | 97 / 84 / 98 |

Verifica «mai abbassate» (T-10-89): `git diff HEAD~1 -- package.json` sul commit e6fb9ac mostra 16 righe `-`/`+` di soglia, ogni `+` è maggiore o uguale alla `-` corrispondente; `package.json` resta JSON valido a 2 spazi (modificato con `JSON.stringify(obj, null, 2)` e un controllo che rifiuta valori più bassi). Misura letta da `coverage/coverage-summary.json` aggregando covered/total per chiave come fa Jest. Secondo `npm run test:cov` con le soglie nuove: exit 0, 273 suite / 3603 test, ~5 min.

## Verifica

- Task 1: `npx jest src/economy src/characters/spells src/characters/equipment src/quests/acceptance --selectProjects unit` 17 suite / 369 test; stesso insieme `--selectProjects integration --runInBand` 14 suite / 272 test.
- Task 2: `travel-sweeper.spec.ts` + `travel-scheduler.service.spec.ts` 22 test; `travel-completion.int-spec.ts` 30 test.
- `npm run test:cov` (2 run): exit 0, 273 suite / 3603 test; `npx tsc --noEmit -p tsconfig.json` 0; `npm run build` 0; `git diff --exit-code src/schema.gql` 0 e nessuna riga rimossa rispetto a `origin/develop`; nessun jest residuo.
- Il test instabile del boot reale (`test/app.int-spec.ts`) non si è ripresentato nei due run.

## Deviations from Plan

None - plan executed exactly as written. Annotazioni:
- Nessun ciclo RED/GREEN: tutti i test nuovi sono verdi al primo colpo perché coprono comportamenti già corretti (rami e gare scoperti, non regole nuove); nessun bug trovato, nessun `it.todo`.
- I rami restanti scoperti nelle aree (costruttori con `@InjectModel`/`@InjectQueue`/`@Inject`, `characters.service.ts` 229/279 di `unequipSpell`/`useSpell` fuori dai file del piano, `spell-state.migrator.ts` 127 irraggiungibile perché il filtro richiede gli stati) restano scoperti di proposito.

## Self-Check: PASSED
