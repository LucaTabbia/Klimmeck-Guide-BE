---
phase: 09-combat-result-admin-outcomes
verified: 2026-10-24T20:00:00Z
status: passed
score: 5/5 success criteria verified (BE-COMBAT-01..03, BE-ADMIN-01..02 coperti; D-01..D-29 emendate C1-C10 onorate)
overrides_applied: 0
re_verification:
  previous_status: none
  note: "verifica iniziale"
gaps: []
human_verification:
  - test: "UAT su device con la FE Phase 9 (foglio esiti) e la FE Phase 10 (pannello admin): questEnd(resultId), questResult(id) al requery, questResultReceived in foreground, pendingRequests/pendingRequestsUpdated, completePendingRequest con override"
    expected: "Il foglio esiti mostra HP prima/dopo, consumi, ferite, premi e XP del personaggio; il push porta solo resultId; l'innkeeper completa story/worldMission e ogni partecipante riceve il proprio risultato"
    why_human: "Le FE Phase 9 e 10 non esistono ancora; verifica umana differita alla UAT FE (come nelle Phase 7/8 BE). Richiede dati a DB preparati dall'utente (BACKEND-NOTES §12) e push reali"
  - test: "Conferma dei default tecnici: C5 (timeout di 7 giorni sospeso se esiste un soccorritore registrato), A3 (boss concluso se almeno un partecipante vince), valori segnaposto (tabella ferite, resolver segnaposto, tabella livelli/HP)"
    expected: "RISOLTO 2026-10-25: C5 confermata, A3 corretta (verdetto unico, piano 09-17), A2 lasciata provvisoria dall'utente"
    why_human: "Sono decisioni di game design adottate come default tecnici, non verificabili da codice"
---

# Phase 9: Combat Result & Admin Outcomes - Verification Report

**Obiettivo:** esiti delle quest risolti dal server (corsia standard alla scadenza, motore sostituibile) e completati dal GM per story/worldMission, con un `QuestResult` persistito per personaggio, delivery ibrida, coda live dell'innkeeper e completamento role-guarded e audit-loggato (emendato 09-CONTEXT D-01..D-04).
**Stato:** passed (nessun gap automatico). La verifica umana è differita alla UAT FE.
**Re-verification:** No, verifica iniziale.

## Evidenze eseguite

| Comando | Esito |
|---------|-------|
| `npm run test:unit` | 121 suite, 1765 test, PASS (atteso >= 1765) |
| `npm run test:int` | 72 suite, 913 test, PASS (152 s, nessun timeout, nessun rilancio necessario) |
| `npm run build` | exit 0 |
| `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | 43/43 PASS (il flaky 09-14 non si è ripresentato) |
| `git diff --exit-code src/schema.gql` dopo il boot reale | exit 0, SDL coerente con il codice |
| `git diff develop -- src/schema.gql \| grep -c '^-[^-]'` | 0 (SDL solo additivo) |
| `grep -cw 'kind\|grade\|TravelKind' src/schema.gql` | 0 |
| `git status --short` | pulito prima della scrittura del report |
| `pgrep -fl 'jest\|redis-server'` | vuoto |

## Success criteria (ROADMAP)

| # | Criterio | Stato | Evidenza |
|---|----------|-------|----------|
| 1 | `QuestResult` persiste HP prima/dopo, consumi, spell, injuries, rewards, XP | VERIFIED | `type QuestResult` in `src/schema.gql:559` (più `QuestResultQuest:585`); costruito da `quests/outcomes/outcome-plan.ts` (usa `progressionAfter` riga 296 e `applyTradeToInventory` riga 322) e scritto da `outcome-writer.service.ts` (coin via `applyCharacterCoinsDelta`, riga 93) |
| 2 | Subscription con payload completo, FCM solo `resultId`, `questResult(id)` identico al requery | VERIFIED | `quest-results.publisher.ts:58-59` pubblica `questResultReceived` leggendo il risultato persistito; `quest-results.resolver.ts` owner-only (`@OwnsCharacter ownerOnly`, `@OwnsQuestResult` sulla query), nessuno snapshot; SDL `questResult(id: String!)` (498) e `questResultReceived(characterId)` (674); `questEnd` in `push/push-events.ts:16` con id; invio in `outcome-writer.service.ts:26` |
| 3 | Completamento GM role-guarded, solo esito positivo, override per personaggio, nessun grade; corsia standard risolta dal server alla scadenza | VERIFIED | `pending-requests.resolver.ts:45-47` `@Roles(RoleType.innkeeper) completePendingRequest`; `gm-completion.service.ts` con `validateOverrides` (riga 106) da `gm-overrides.ts`; SDL `completePendingRequest(input: CompletePendingRequestInput!): [QuestResult!]!` (322), nessun `grade`/`reject`; corsia standard: `quest-resolution.service.ts` (`this.combat.resolve`, riga 173), `boss-resolution.service.ts`, `rescue-resolution.service.ts`, `quest-resolution.sweeper.ts` (`dueStandardQuestsPipeline`, riga 94), `QuestOutcomesModule` montato in `app.module.ts:89` |
| 4 | Vista live innkeeper (query + subscription) con i dati per il filtro FE su `activeTravel` | VERIFIED | SDL `pendingRequests: [PendingRequest!]!` (492), `pendingRequestsUpdated` (673); `pending-requests.service.ts` proietta `status.awaitingAid` e dati di viaggio; `pending-requests.builder.ts`; `@Roles(innkeeper)` righe 24 e 31 del resolver |
| 5 | Mutation role-guarded e audit-loggata, nessun approve/reject, nessun rimborso | VERIFIED | `pending-requests.resolver.ts:44` documenta l'audit automatico dell'interceptor (D-23) con target `QuestResult`; nessuna mutation di reject nello SDL |

## Decisioni emendate (spot-check C1-C10 / D-)

| Decisione | Stato | Evidenza |
|-----------|-------|----------|
| Porta `CombatResolver` sostituibile con segnaposto | VERIFIED | `quest-outcomes.module.ts:73` `{ provide: CombatResolver, useClass: PlaceholderCombatResolver }` |
| C1 morte nella transazione dell'esito | VERIFIED | `rescue-resolution.service.ts:417` e `character-deletion.service.ts:47` usano `archiver.archiveWithin(session, ...)` |
| C5 / timeout di soccorso 7 giorni | VERIFIED | `aid/aid-timeout.ts:4` `AID_TIMEOUT_MS = 7*24*60*60*1000`, `aidTimeoutClaimFilter` (usato in `rescue-resolution.service.ts:232`) |
| Guard `AWAITING_AID` (accettazione quest e viaggio) | VERIFIED | `GameRuleException.awaitingAid()` chiamato da `quest-acceptance.updates.ts:123`, `quest-eligibility.ts:156`, `travel.updates.ts:59`, `travel-rules.ts:18`; int-spec dedicati verdi |
| Guard `SHOP_NOT_IN_CITY` | VERIFIED | `economy/trade/shop-transaction.service.ts:136,142`; int-spec riga 696 |
| Rallentamento da ferite sul viaggio | VERIFIED | `travel-planner.service.ts:196` usa `travelSpeedFactorOf(injuries)` |
| Accodamento della risoluzione dove si scrive `startDate` | VERIFIED | `quest-acceptance.service.ts:198` e `travel-completion.service.ts:115` chiamano `scheduleResolution` |
| Env `QUEST_SWEEP_INTERVAL_MS` | VERIFIED | `config/quest-config.ts`, documentata in `.env.example:71` |
| HP iniziali/tabella livelli | VERIFIED | `starting-character.ts` usa `LEVEL_TABLE[0]` da `progression/level-table.ts` |
| Slot magia dal rango mage | VERIFIED | `character-status.model.ts:70` `maxActiveSpellsFor(xp, title)` |

## Key link (tool `verify key-links` + verifica manuale)

Il tool ha riportato 14 "fallimenti" su 16 piani, tutti falsi negativi: 13 per regex doppiamente escapate (`Invalid regex pattern: ...\\(`) e 2 per pattern letterali non adatti (`LEVEL_TABLE\\[0\\]`, `type QuestResult \\{`, `chance.next\\(\\)`). Ogni link è stato riverificato a mano con grep e risulta WIRED (righe citate sopra e: `cascading-loot.ts:40,43` `chance.next()`; `quest-rewards.ts:126` `rollLoot`; `boss-resolution.service.ts:256` `questClaimFilter`; `gm-completion.service.ts:106` `validateOverrides`; `starting-character.ts:6` `LEVEL_TABLE[0]`; `schema.gql:559` `type QuestResult {`). Artefatti: tool `verify artifacts` 100% passati su tutti i 16 piani (nessuno MISSING/STUB).

## Requisiti

| ID | Stato | Evidenza |
|----|-------|----------|
| BE-COMBAT-01 | SATISFIED | criterio 1; `REQUIREMENTS.md:99` spuntato, riga traceability 188 "Complete" |
| BE-COMBAT-02 | SATISFIED | criterio 2; riga 100 spuntata, traceability 189 |
| BE-COMBAT-03 | SATISFIED | criteri 3; riga 101 spuntata, traceability 190 |
| BE-ADMIN-01 | SATISFIED | criterio 4; riga 105 spuntata, traceability 191 |
| BE-ADMIN-02 | SATISFIED | criterio 5; riga 106 spuntata, traceability 192 |

Traceability coerente: i 5 ID sono presenti nei PLAN, in ROADMAP §Phase 9 e in REQUIREMENTS.md, tutti Phase 9 "Complete". Nessun requisito orfano. Gli emendamenti (nessun grade, nessun reject, `QuestResult` al posto di `CombatResult`/`combatResult(id)`) sono annotati nel testo dei requisiti.

## Regressione Phase 7/8

Le suite di accettazione quest e viaggio (`src/quests/acceptance`, `src/travel`) fanno parte dei 121 + 72 verdi, incluse le nuove guard `AWAITING_AID`. SDL solo additivo rispetto a `develop` (0 rimozioni), quindi nessun contratto FE rotto.

## Anti-pattern

Nessun TODO/FIXME in `quests/outcomes`, `quests/results`, `quests/pending-requests`, `economy`. Nessun processo jest/redis residuo.

## Bug noti (deferred-items.md, non bloccanti)

- `src/models/enemy.model.ts`: `@Prop` di `Enemy.locations` dichiarato come stringa mentre tipo TS e GraphQL sono array (09-04). Non esercitato dai percorsi di fase (la fixture omette `locations`), riportato in BACKEND-NOTES §14 per la BE Phase 10.
- Flaky 09-14 del boot reale: non riprodotto (43/43 in questa verifica). Da tenere d'occhio in CI.

## Verifica umana

Differita alla UAT FE (FE Phase 9 e 10 non esistono ancora); vedi `human_verification` nel frontmatter. Non cambia lo status: nessun must-have automatico fallisce.

---

_Verified: 2026-10-24T20:00:00Z_
_Verifier: Claude (gsd-verifier)_

## Emendamento 2026-10-25 (piano 09-17)

- **Decisioni dell'utente:** C5 confermata ("Il timeout parte alla sconfitta dell'avventuriero. Quei 7 giorni sono i giorni in cui un altro avventuriero può accettare la quest aid. Se non accetta nessuno la quest prima dello scadere del timer, l'avventuriero muore, altrimenti il timeout viene cancellato."); A3 corretta ("il risultato di una quest boss è lo stesso per tutti. Se uno è vittorioso, lo sono tutti. Cambiano i drop per avventuriero, le ferite subite e così via. Un avventuriero potrebbe essere con 1HP, un altro invece stare bene."); A2 provvisoria ("I valori segnaposto verranno risolti da me in futuro."). Sulla aid del boss perso: "Non deve comparire una missione aid per ogni personaggio, ma solo una missione aid. Le missioni aid per le missioni boss andate male devono accettare lo stesso numero di partecipanti della missione boss" — implementata dal piano 09-18; a fine 09-17 il boss perso libera tutti i posti e crea ancora una aid per partecipante (transitorio).
- **Codice:** `CombatResolver.resolve` restituisce `CombatResolution { verdict, participants: ParticipantEffects[] }` (l'esito misto non è rappresentabile); il segnaposto tira la vittoria una volta per combattimento; `battleOf` abbina il verdetto agli effetti del partecipante; il boss vinto si conclude per tutti; C5 marcata confermata nei commenti; `src/schema.gql` invariato.
- **Gate rieseguito:** `npm run test:unit` 121 suite / 1776 test, `npm run test:int` 72 suite / 915 test, `npm run build` exit 0, `git diff --exit-code src/schema.gql` pulito.
