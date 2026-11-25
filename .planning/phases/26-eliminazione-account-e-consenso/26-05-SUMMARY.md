---
phase: 26-eliminazione-account-e-consenso
plan: 05
subsystem: quests
tags: [account-deletion, started-quest, refund, push]
requires: ["26-04"]
provides:
  - "src/quests/party/started-quest-cancel.ts: startedQuestsWithFilter(characterIds), homeCityFilterOf(questMarker), travelRefundOf(ownedItems, spent), refundedLifeOf(current, lost, max)"
  - "src/push/push-events.ts: startedQuestCancelled(questId) — tipo questCancelled, id = quest, testo provvisorio in un solo posto"
  - "src/quests/party/started-quest-canceller.ts: StartedQuestCanceller.cancelStartedQuestWithin(session, questId, erasedCharacterIds, _now) → CancelledStartedQuest { questId, characterIds } | null"
  - "src/quests/party/started-quest-cancel.module.ts: StartedQuestCancelModule (forFeature Quest, Character, PendingQuest, City, User; imports LoreGeographyModule, EconomyModule; exports StartedQuestCanceller), fuori da AppModule"
affects: [26-06, 26-07, 26-12]
tech-stack:
  added: []
  patterns:
    - "rientro, rimborsi e cancellazione della PendingQuest nello stesso passo, update condizionale sulla corsia e su status.activeTravel nullo"
    - "rimborso del cibo con righe buy fuse per item e limitate al tetto della riga (mai un'eccezione che blocchi la cancellazione)"
key-files:
  created:
    - src/quests/party/started-quest-cancel.ts
    - src/quests/party/started-quest-cancel.spec.ts
    - src/quests/party/started-quest-canceller.ts
    - src/quests/party/started-quest-cancel.module.ts
    - src/quests/party/started-quest-canceller.int-spec.ts
  modified:
    - src/push/push-events.ts
    - src/push/push-events.spec.ts
decisions:
  - "Il rimborso del cibo che supererebbe MAX_ITEM_QUANTITY si limita al tetto invece di lanciare invalidQuantity: la cancellazione dell'account non deve fallire per un rimborso (T-26-17, T-26-20)"
  - "La rilettura della quest usa startedQuestsWithFilter(erasedCharacterIds) per _id: la quest si annulla solo se un personaggio cancellato vi è ancora registrato"
  - "I compagni sono i registrati attivi (activeRegistrantFilterOf) che non sono fra i cancellati; un compagno in viaggio o con la corsia su un'altra PendingQuest resta intatto (personaggio e PendingQuest) con un WARN e non entra nei characterIds"
  - "Il destinatario dei punti è l'utente il cui currentCharacter è il compagno (come da piano), non Character.user; assente → WARN e nessun accredito"
  - "Il test del push non ripete il testo: confronta tipo, id, ttl e titolo con questCancelled e chiede un corpo diverso e non vuoto, così il testo provvisorio vive solo nel builder"
metrics:
  duration: "40 min"
  completed: 2026-11-25
---

# Phase 26 Plan 05: annullamento di una quest cominciata — Summary

Una quest effettivamente cominciata con un personaggio cancellato si annulla nella transazione del chiamante: i compagni rimasti tornano al `markerLocation` della città che contiene il marker della quest (geografia imparata), con cibo del tragitto fuso nella borsa, vita persa per fame restituita entro il massimo e `pointsSpent` accreditati dal `WalletService`; le `PendingQuest` della quest spariscono e la quest torna sul tabellone con `startedQuestResetOf` (D-13, D-26).

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | cedc37af | test(quests): expect the pure rules of a started quest cancellation |
| 1 GREEN | b70a2f6e | feat(quests): describe the cancellation of a started quest |
| 2 RED | 0b836be6 | test(quests): expect a started quest to be cancelled with refunds |
| 2 GREEN | 9e1622fa | feat(quests): cancel a started quest with return and refunds |

## Fallimenti RED

- Task 1: `started-quest-cancel.spec.ts` → `Cannot find module './started-quest-cancel'`; `push-events.spec.ts` → suite rossa per l'import di `startedQuestCancelled` inesistente.
- Task 2: `started-quest-canceller.int-spec.ts` → `Cannot find module './started-quest-cancel.module'` (nessun modulo vuoto creato).

## Testo finale del push

`startedQuestCancelled(questId)` = `{ type: questCancelled, id: questId, title: 'Missione annullata', ttlSeconds: 3600, body: 'Un compagno ha lasciato il mondo: la missione è annullata e sei tornato in città, con cibo, punti e vita restituiti.' }` — testo provvisorio, solo in `src/push/push-events.ts`.

## Come è seminata la quest avviata

Città con `markerLocation` (id libero) e `pointsOfInterest: [marker della quest]`, `relatedLore` = una lore persistita; quest `boss` (o `enemy`, `aid` con `rescue`) persistita con `_id` fisso, tre registrati e `startedAt` un'ora prima. Per ogni membro: personaggio con `_id` e `quests.pendingQuest` pre-generati, posizione sul marker della quest; `PendingQuest` inserita col driver nativo (`startDate`, `arrivedAt`, `pointsSpent`) senza i campi del tragitto, tranne A che porta `travelFoodSpent` (2 razioni) e `travelHungerLifeLost: 6`; utente con `currentCharacter` e 100 punti. Il segnaposto archiviato è un quarto membro con `deletedAt` e `deletionReason: death`, aggiunto alle registrazioni con `archivedAt`.

## WARN osservati

- Marker senza città: `Missione <id> annullata senza città di partenza: il marker non appartiene a nessuna città, i compagni restano sul posto`.
- Compagno in viaggio (dato rotto): `Compagno <id> della missione <id> lasciato intatto: in viaggio o con la corsia su un'altra missione (dato rotto, pulizia manuale)`.
- Previsti ma non esercitati: update del personaggio senza match nella transazione; punti senza un utente che giochi il compagno.

## Verifiche

- Unit: `started-quest-cancel.spec.ts` + `push-events.spec.ts` 50/50.
- Integration (`--runInBand`): `started-quest-canceller.int-spec.ts` 13/13 (boss: rientro, PendingQuest, rimborsi, tabellone, ritorno; enemy; aid; non avviata; conclusa; segnaposto; marker senza città; compagno in viaggio; abort).
- `npx tsc --noEmit -p tsconfig.json` 0; prettier ed eslint puliti sui file toccati.
- Gate: 4 funzioni esportate, `startedQuestCancelled` presente, `push-event-type.enum.ts` senza diff da `9a084248`, `StartedQuestCancelModule` assente da `app.module.ts`, 13 titoli con `D-13`/`D-26`, nessun `chance.next(`. `src/characters/deletion/` non toccato.

## Deviations from Plan

- **[Rule 2 - Sicurezza/robustezza] Tetto del rimborso del cibo:** `applyTradeToInventory` lancia `invalidQuantity` oltre `MAX_ITEM_QUANTITY`; `travelRefundOf` limita ogni riga fusa a `MAX_ITEM_QUANTITY - posseduto` (e restituisce `null` se non resta nulla), così la cancellazione dell'account non fallisce mai su un rimborso. Caso `caps the refund at the maximum quantity of a bag row (D-13)`. Commit b70a2f6e.
- **Casi in più:** unit `merges two spent rows of the same food (D-13)` (righe in coda dello stesso item, anche in forma stringa) e `keeps the life as it is when no hunger was recorded (D-13)`; integration `leaves a travelling companion intact with a warning (D-26)` (verità del piano senza caso nella lista).
- **Test del push:** non ripete il testo verbatim (vedi decisioni), per tenere il testo provvisorio in un solo posto.
- **`_now`:** la regola `@typescript-eslint/no-unused-vars` del repo non ignora il prefisso `_` (warning): aggiunto `// eslint-disable-next-line @typescript-eslint/no-unused-vars` sul parametro, oltre al commento richiesto.
- **RED del task 2:** l'implementazione era già scritta quando ho scritto la spec; per un RED onesto i due file sono stati spostati fuori dall'albero, la spec eseguita (modulo inesistente) e committata da sola, poi i file rimessi.

## Known Stubs

Nessuno. `StartedQuestCanceller` non è ancora chiamato da nessuno: il collegamento è del piano 07, il push dopo il commit del piano 12 (dichiarato dal piano).

## Note per i piani successivi

- Il piano 07 chiama `cancelStartedQuestWithin(session, questId, erasedCharacterIds, now)` per ogni quest di `startedQuestsWithFilter(erasedCharacterIds)` PRIMA di `archiveWithinReporting`; deve escludere da sé l'eccezione della `aid` il cui unico ferito è il cancellato (la funzione non la conosce: annulla ogni quest cominciata che riceve).
- `null` = quest non cominciata, conclusa o senza un cancellato registrato: nessuna scrittura.
- `characterIds` contiene solo i compagni realmente rientrati (non i rimasti intatti per dato rotto): è la lista per `startedQuestCancelled` dopo il commit (piano 12), con lo stesso `ownersOf` di `notifyQuestCancelled`.
- Le `PendingQuest` dei cancellati vengono cancellate e la loro corsia azzerata: l'archivio successivo non trova più nulla di quella quest.
- Il modulo importa `EconomyModule` (che porta `MissionLockModule` e un `Clock` proprio).

## Self-Check: PASSED

File creati presenti; commit cedc37af, b70a2f6e, 0b836be6, 9e1622fa presenti nella storia.
