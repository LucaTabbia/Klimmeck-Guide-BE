---
phase: 04-integrita-economica-atomics
verified: 2026-10-18T18:30:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
gaps: []
deferred: []
human_verification:
  - test: "Confermare che il MongoDB di produzione sia un replica set (D-19 / assunzione A4, blocker aperto in STATE.md)"
    expected: "rs.status() ok; le transazioni di doTransaction e dell'accettazione quest (e di 02.1/03.1) funzionano"
    why_human: "Controllo di deploy/infrastruttura, non verificabile dal codice. Le scritture di equip/spell/saldo sono a documento singolo e indipendenti dalla topologia; doTransaction e accept quest richiedono il replica set."
---

# Phase 4: Integrita Economica (Atomics) Verification Report

**Phase Goal:** Tutte le scritture di bilancio/inventario/quest/spell/equip sono atomiche: mai read-modify-write, mai stato parziale, safe in concorrenza. Chiude le concern rosse #5 (`useSpell`), #6 (`doTransaction`), #7 (equip).
**Status:** human_needed (tutti i criteri verificati; resta solo il controllo di deploy sulla topologia MongoDB di produzione). Re-verification: No (initial).

## Observable Truths (ROADMAP success criteria)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Debito su coins/twitchPoints insufficienti fallisce, mai saldo negativo, mai read-modify-write | VERIFIED | `src/economy/wallet.service.ts`: `applyCharacterCoinsDelta` = un solo `findOneAndUpdate` con filtro `activeCharacterById` + `hasAtLeastCopper` (`$expr` rame totale >= importo) e update a pipeline (`coinsDeltaStages`, `$toInt` per denominazione); `debitUserPoints` = `$inc` condizionato `twitchPoints: {$gte}`. Insufficiente -> `INSUFFICIENT_FUNDS` / `INSUFFICIENT_POINTS`. `wallet.service.int-spec.ts` "never goes negative under concurrent debits" (coins e punti), rollback in transazione abortita. Grep: gli unici scrittori di saldo sono `coins.expressions.ts` + `wallet.service.ts`. |
| 2 | `doTransaction` valida la fattibilita e applica coins+items in un'unica transazione; fallimento a meta senza stato parziale | VERIFIED | `src/economy/trade/shop-transaction.service.ts`: prezzi dal catalogo (D-06) + cross-check `TRANSACTION_TOTAL_MISMATCH`, poi `connection.transaction` con snapshot in sessione, `updateOne` inventario con quantita vendute riaffermate nel filtro, poi `wallet.applyCharacterCoinsDelta(..., session)`. Resolver delega a `shopTransactions.execute`. `shop-transaction.service.int-spec.ts` "leaves no partial state when the transaction fails after both writes", "exactly one of concurrent buys", "sells a single owned item exactly once"; `do-transaction.int-spec.ts` sul wire. `normalizeCoins`/`src/utils.ts` rimossi, nessun riferimento residuo. |
| 3 | Due accettazioni quest concorrenti: un solo successo, un solo debito | VERIFIED | `src/quests/acceptance/quest-acceptance.service.ts`: transazione claim condizionale `quests.pendingQuest: null` -> insert `PendingQuest` -> debito wallet in sessione; perdente `QUEST_SLOT_BUSY`, nessun orfano. `quest-acceptance.service.int-spec.ts` SC3: 3 accept concorrenti -> 1 fulfilled, 2 `QUEST_SLOT_BUSY`, 1 PendingQuest, saldo 70 rame (un solo debito). Primitiva montata in `AppModule`; nessuna mutation GraphQL (come da D-09). |
| 4 | Due equip/activeSpells concorrenti non superano `maxActiveSpells` | VERIFIED | `active-spell.updates.ts` `equipSpellFilter`: conosciuta, non gia attiva, `$expr $lt [$size(activeSpells), maxActiveSpellsExpression()]` valutata sul documento vivo nello stesso update; tabella soglie unica in `active-spell-slots.ts` condivisa con la virtual. `equip-spell.int-spec.ts`: "never exceeds maxActiveSpells under concurrent equips", "six concurrent equips" su 2 slot, parita espressione/`maxActiveSpellsFor`, unequip una sola volta. `equipItem` con guard di possesso (`equip-item.int-spec.ts`). Nessun `.save()` residuo in `src`. |
| 5 | Due `useSpell` con 1 usage -> usages 0, un solo successo; recovery idempotente mai oltre il massimo | VERIFIED | `useSpellFilter` `$elemMatch usages >= 1` + `$inc -1` posizionale; Bull dopo la scrittura con `jobId` `randomUUID()`; compensazione `restoreUsage` + `SPELL_RECOVERY_UNAVAILABLE`. Processor: `recoverSpellFilter` (`usages < maxUsages` dal catalogo) + `$inc +1`. `use-spell.int-spec.ts` (concorrenza, job distinti, queue rifiutata), `spell-recovery.processor.cap.int-spec.ts` (doppia esecuzione e replay paralleli non superano il max). |

**Score:** 5/5 truths verified

## Decisions honored (CONTEXT D-01..D-20)

- D-01/D-02/D-04: modulo `coins` puro, un solo update condizionale con pipeline, `WalletService` unico scrittore, `session` opzionale.
- D-03: `$inc` condizionale per `twitchPoints`, primitiva senza consumatori GraphQL.
- D-05..D-08: contratto `doTransaction` invariato, BE autorita del prezzo, fattibilita + unica unita (Pattern 3 sanzionato: snapshot + guard sul filtro + guard `$expr` del wallet come autorita dei fondi), semantica array invariata.
- D-09: primitiva `QuestAcceptanceService.accept` (Pattern 3: claim slot, insert, debito nella stessa transazione), nessuna mutation quest.
- D-10..D-14: update condizionali singoli, rilettura solo per classificare, usages dal catalogo, compensazione, recovery con cap.
- D-15: schema invariato, `git diff --exit-code develop -- src/schema.gql` = 0; `GameRuleErrorCode` e un enum TS puro (nessun `registerEnumType`); nessun `@Prop` ritipizzato.
- D-16: `BACKEND-NOTES.md` presente. D-17: commit test RED precedono i GREEN per ogni piano (git log). D-18: nessun `npm run lint` (verifica su file toccati dichiarata in 04-09). D-20: branch `feat/04-integrita-economica-atomics`.
- Pitfall RESEARCH: `$toInt` presente su ogni denominazione (Mixed casting), `$ifNull` attorno a `$size`, `jobId` con `randomUUID()`, fixture a totale zero coperta, `init()` nelle spec.

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/gameRules/game-rule.exception.ts`, `game-rule-error-code.enum.ts` | VERIFIED | 15 codici D-15, `extensions.code`, spec |
| `src/economy/coins.ts`, `coins.expressions.ts` | VERIFIED | modulo puro + espressioni; spec |
| `src/economy/wallet.service.ts`, `economy.module.ts` | VERIFIED | wired in `CharactersModule`/`AppModule`; int-spec |
| `src/economy/trade/*` (pricing, inventory, reader, service) | VERIFIED | wired nel resolver `doTransaction` |
| `src/quests/acceptance/*` | VERIFIED | modulo montato in `AppModule` (primitiva interna per Phase 7) |
| `src/characters/spells/active-spell.updates.ts`, `equipment/equip-item.updates.ts` | VERIFIED | usati da `CharactersService` e dal processor |
| `src/models/character/active-spell-slots.ts` | VERIFIED | usato dalla virtual e dal filtro |
| `src/characters/spell-recovery.processor.ts` | VERIFIED | recovery condizionato |

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `CharactersResolver.doTransaction` | `ShopTransactionService.execute` | DI | WIRED |
| `ShopTransactionService` / `QuestAcceptanceService` | `WalletService.applyCharacterCoinsDelta` | stessa `session` | WIRED |
| `CharactersService.equipSpell/useSpell/...` | builder filtri/update | import | WIRED |
| `maxActiveSpells` virtual | `maxActiveSpellsFor` / `maxActiveSpellsExpression` | stessa tabella | WIRED |
| `SpellRecoveryProcessor` | `recoverSpellFilter` + `INCREMENT_ACTIVE_SPELL_USAGE` | import | WIRED |

## Behavioral Spot-Checks (eseguiti dal verifier su HEAD)

| Check | Result |
|-------|--------|
| `npx jest --selectProjects unit` | 54 suites / 625 tests passed |
| `npx jest --selectProjects integration --runInBand` | 41 suites / 472 tests passed |
| `git diff --exit-code develop -- src/schema.gql` | exit 0 (nessun drift) |
| `tsc --noEmit -p tsconfig.build.json` | exit 0 |
| `grep` scrittori di saldo (`grep -F`) | solo `coins.expressions.ts` + `wallet.service.ts` |
| `.save()` in `src` non-spec | nessuno |

## Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| BE-ATOM-01 | 04-01, 04-02, 04-06, 04-09 | SATISFIED | SC1 |
| BE-ATOM-02 | 04-04, 04-06, 04-08, 04-09 | SATISFIED | SC2 |
| BE-ATOM-03 | 04-07, 04-09 | SATISFIED | SC3 |
| BE-ATOM-04 | 04-01, 04-03, 04-09 | SATISFIED | SC4 |
| BE-ATOM-05 | 04-05, 04-09 | SATISFIED | SC5 |

Tutti e 5 gli ID sono dichiarati nei frontmatter dei piani, spuntati `[x]` in REQUIREMENTS.md (righe 64-68) e "Complete" nella traceability (167-171). Nessun requisito orfano.

## Anti-Patterns Found

Nessun blocker. Nessun TODO/FIXME/placeholder nei file di fase. Note informative:
- `ROADMAP.md` riga 20: la checkbox della Phase 4 e ancora `[ ]` (i 9 piani sono `[x]`); l'orchestratore la spunta al completamento della fase.
- `assertPositiveAmount`/`assertValidCost` lanciano `RangeError` (errore di programmazione, non di dominio): scelta consapevole, primitive senza consumatori wire.
- La finestra tra `updateOne` di useSpell e `queue.add` e coperta dalla compensazione (best-effort loggata se anche questa fallisce): rischio residuo accettato in D-13.

## Human Verification Required

### 1. Topologia MongoDB di produzione (deploy check, D-19 / A4)

**Test:** verificare che il cluster prod sia un replica set (`rs.status()`).
**Expected:** `doTransaction` e l'accettazione quest (transazioni) funzionano come nell'harness; le altre scritture di fase sono a documento singolo e topologia-indipendenti.
**Why human:** controllo di infrastruttura/deploy; blocker gia aperto in `STATE.md`. Non e un gap di codice.

## Gaps Summary

Nessun gap. I cinque success criteria sono provati da test di integrazione di concorrenza sul replica-set harness e dal codice. Resta solo il controllo di deploy sopra.

---

_Verified: 2026-10-18T18:30:00Z_
_Verifier: Claude (gsd-verifier)_
