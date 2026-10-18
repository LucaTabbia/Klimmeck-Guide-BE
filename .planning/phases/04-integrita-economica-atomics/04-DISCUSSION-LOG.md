# Phase 4: Integrità Economica (Atomics) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-18
**Phase:** 04-integrita-economica-atomics
**Mode:** `--auto` — l'utente ha chiesto di proseguire il piano GSD sui due repo senza sessione interattiva; per ogni domanda è stata scelta l'opzione raccomandata (prima opzione). Tutte le aree individuate sono state incluse.
**Areas discussed:** Modello del saldo e atomicità, `doTransaction` (fattibilità e prezzo), Accettazione quest, Equip/magie/usages, Errori e contratto wire

---

## Modello del saldo e meccanismo di atomicità

| Option | Description | Selected |
|--------|-------------|----------|
| Tre denominazioni invariate + calcolo in rame + update condizionale a pipeline (`$expr` sul rame totale) | Nessun cambio di contratto FE/DB; un solo update atomico per saldo; transazione solo per multi-documento | ✓ |
| Campo canonico `totalCopper` a DB, denominazioni derivate | `$inc` + `$gte` semplicissimo, ma cambia lo schema a DB e richiede migrazione + doppia scrittura per il wire | |
| Transazione + rilettura in sessione + `save()` per ogni saldo | Uniforme ma dipende dalla topologia replica-set anche per scritture a documento singolo; resta read-modify-write "dentro" la transazione | |

**Auto choice:** opzione 1 (raccomandata). `twitchPoints` scalare → `$inc` condizionale `$gte`.
**Notes:** research flag su `$expr` nel filtro di update e pipeline update con Mongoose 8 / MongoDB 8.0.4; fallback = opzione 3.

---

## `doTransaction`: fattibilità e autorità del prezzo

| Option | Description | Selected |
|--------|-------------|----------|
| Il BE ricalcola il totale dal catalogo; `total`/`isTotalPositive` del client sono un cross-check (`TRANSACTION_TOTAL_MISMATCH`) | Chiude il buco "totale forgiato"; contratto invariato; drift di prezzo reso visibile | ✓ |
| Il BE ricalcola e ignora il totale del client | Più permissivo; il FE non si accorge mai di un prezzo cambiato | |
| Il BE si fida del totale del client e verifica solo la fattibilità | Rispetta la lettera di BE-ATOM-02 ma lascia il client arbitro del prezzo (contro il core value) | |

**Auto choice:** opzione 1. Esecuzione in transazione con write condizionale che riafferma le precondizioni (alternativa ammessa: pipeline unica).
**Notes:** errori tipizzati `ITEM_NOT_FOUND`, `ITEM_NOT_TRADABLE`, `ITEM_NOT_OWNED`, `INSUFFICIENT_ITEM_QUANTITY`, `INVALID_QUANTITY`, `INSUFFICIENT_FUNDS`.

---

## Accettazione quest (BE-ATOM-03) in assenza di una mutation

| Option | Description | Selected |
|--------|-------------|----------|
| Primitiva interna single-flight sullo slot esistente `quests.pendingQuest` (claim condizionale + debito + insert `PendingQuest` in transazione), nessuna mutation GraphQL | Soddisfa il criterio 3 senza creare un contratto che Phase 7 rifarebbe; Phase 7 la generalizza alle corsie | ✓ |
| Mutation `acceptQuest` minimale su corsia singola | Contratto esposto subito ma inutilizzabile dal FE (Phase 6 richiede le corsie) e da rifare in Phase 7 | |
| Rimappare BE-ATOM-03 a Phase 7 | Tocca roadmap e requisiti; Phase 7 dipende esplicitamente da "accept atomico" di Phase 4 | |

**Auto choice:** opzione 1. Costo come parametro della primitiva.

---

## Equip, magie attive, usages (BE-ATOM-04/05)

| Option | Description | Selected |
|--------|-------------|----------|
| Un update condizionale per mutation (guard nel filtro: conosciuta/non attiva/capacità/posseduto/usages ≥ 1; recovery con cap `< maxUsages`) | Atomico a documento singolo, nessuna transazione, nessun retry; usages iniziali dal catalogo | ✓ |
| `optimisticConcurrency: true` sullo schema `Character` + retry su `VersionError` | Generico ma richiede un wrapper di retry attorno a ogni read-validate-save; la validazione resta in JS | |
| Transazione per ogni mutation | Dipendenza dalla topologia anche per scritture a documento singolo | |

**Auto choice:** opzione 1; `optimisticConcurrency` lasciata come cintura aggiuntiva a discrezione.
**Notes:** `maxActiveSpells` verificato nello stesso update (funzione pura condivisa → `$switch` su xp, oppure guard su xp dello snapshot). `useSpell`: write poi enqueue, compensazione se l'enqueue fallisce. Il `usages` del client viene ignorato (campo mantenuto).

---

## Errori e contratto wire

| Option | Description | Selected |
|--------|-------------|----------|
| Schema invariato + codici stabili in `extensions.code` (pattern 02.1/03.1) + handoff con tabella codici | Nessun documento FE cambia; FE Phase 6/8 mappano i codici | ✓ |
| Risposte tipizzate (`TransactionResult` con stato) al posto di `CommonResponse` | Più espressivo ma cambia lo schema e i documenti FE | |
| Solo messaggi, nessun codice | Il FE dovrebbe fare match sui messaggi (vietato dalle decisioni precedenti) | |

**Auto choice:** opzione 1.

---

## Claude's Discretion

Nomi e collocazione dei moduli; forma esatta di pipeline/`$expr` vs guard su xp; retry policy; split in wave; `optimisticConcurrency` aggiuntiva; forma della compensazione in `useSpell`; codice unico vs distinti per le richieste malformate.

## Deferred Ideas

Compatibilità `equipType`↔slot e requisiti di gioco; `class-validator`/`ValidationPipe` (Phase 10); idempotency key per `doTransaction`; rimozione di `EquipSpellRequest.usages` (con FE Phase 8); cost model e corsie quest (Phase 7); teleport clear (Phase 8); dead-letter per i job di recovery.
