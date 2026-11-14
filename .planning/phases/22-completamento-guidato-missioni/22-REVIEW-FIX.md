---
phase: 22-completamento-guidato-missioni
fixed_at: 2026-11-14T05:28:27Z
review_path: .planning/phases/22-completamento-guidato-missioni/22-REVIEW.md
iteration: 1
findings_in_scope: 12
fixed: 11
skipped: 1
status: partial
---

# Phase 22: correzioni della review

**Corrette il:** 14 novembre 2026
**Review:** `22-REVIEW.md` (area A poi area B), ruling dell'orchestratore del 14 novembre 2026
**Iterazione:** 1

**Riepilogo:** 12 finding nei ruling, 11 corretti, 1 lasciato com'è per ruling (A-02). Base `d0a55db3`, 13 commit di codice. `src/schema.gql` invariato (nessun cambio SDL).

## Una riga per finding

| ID | Gravità | Commit | Cosa è cambiato | Spec |
|----|---------|--------|-----------------|------|
| B-01 | MEDIUM | `68bbe06a` (RED), `14974229` (GREEN) | Contatore `rev` solo Mongoose sulla bozza (default 0, `rev: 0` all'avvio), incrementato da ogni `MissionDraftService.write` nello stesso update del set (`$inc`). Il completamento cancella in `afterSeats` solo la revisione letta (`deleteOne` con `_id` e `rev`; una bozza scritta prima del contatore ha il filtro a null) e, se non cancella nulla, rifiuta con `OUTCOME_OVERRIDE_INVALID`: la transazione si annulla, nessuna scrittura parziale | `guided-completion.service.int-spec.ts` › «refuses a draft saved after the completion read it, without writing (D-18, D-25)» |
| B-02 | MEDIUM | `c85ba83a` | Test mancanti del completamento: effetto corretto con una ferita già posseduta, consumabili e magie corretti oltre ciò che lascia lo scontro precedente, vita corretta sopra il massimo (tutti `OUTCOME_OVERRIDE_INVALID` senza scritture né push); doppio completamento concorrente. Verdi al primo colpo (comportamento già presente): provati togliendo la validazione di `assertSequenceAllowed`, che manda rossi i quattro casi | `guided-completion.service.int-spec.ts` › «refuses a corrected effect that adds an injury owned before the fight (D-14, D-31)», «refuses a corrected consumable usage…», «refuses a corrected spell usage…», «refuses a corrected life above the maximum (D-06)», «lets one of two concurrent completions win, with one result per seat (D-08, D-25)» |
| B-03 | MEDIUM | `02a02086` (RED), `7b923273` (GREEN) | Costante `MAX_PRIZE_AMOUNT = 9_999_999` accanto agli altri tetti in `mission-draft.inputs.ts`. `@Max` sugli xp del premio e su ogni taglio delle monete del premio tramite la classe di sola validazione `MissionPrizeCoinsInput extends CoinsInput` (non registrata nello schema: sul filo resta `CoinsInput`, il negozio non eredita il tetto). Nel dominio del salvataggio `amountOf` rifiuta oltre il tetto con `OUTCOME_OVERRIDE_INVALID` | `mission-draft.inputs.spec.ts` (nuovo, 6 casi: 9 999 999 accettato, 10 000 000 rifiutato per oro, argento, rame, xp; `CoinsInput` del negozio senza tetto); `mission-draft-save.service.int-spec.ts` › «caps every coin and the xp at the technical ceiling (D-15, D-31)» |
| A-01 | MEDIUM | `db3647c0` (RED), `8f47ac36` (GREEN) | `MissionDraftLockPublisher.onHistoryLost` ripubblica ogni personaggio attivo che tiene una corsia del GM (filtro `$ne` null sulle due corsie); il log dell'errore porta solo il codice | `mission-draft-lock.publisher.spec.ts` › «republishes every active holder of a GM lane after a lost history (D-23)», «logs only the code of a failed recovery after a lost history (D-23)» |
| A-03 | LOW | `6a420298` | Base astratta `PendingQuestHoldersPublisher` (`src/characters/pending-quest-holders.publisher.ts`) con `onChange` e `republishHolders`; `PendingQuestStartPublisher` e `MissionDraftLockPublisher` danno solo pipeline, corsie e complemento del log. Pipeline, filtri, ordine degli eventi e testi dei log invariati | `mission-draft-lock.publisher.spec.ts`, `pending-quest-start.publisher.spec.ts` (17/17), `pending-quest-start.publisher.int-spec.ts` + `mission-in-progress.int-spec.ts` verdi prima e dopo |
| A-04 | LOW | `b403c79e` (RED), `7b500c2b` (GREEN) | `lockLanesOf`: un personaggio senza `quests` (o con `quests` null) risponde `'unresolved'` e il resolver chiede al reader; solo un personaggio assente risponde null. `LANE_NAMES` tolto: si itera `QUEST_LANES` | `mission-lock.spec.ts` › «asks the reader for a character read without its lanes (D-16)»; `character-status.resolver.spec.ts` › «asks the reader for a parent read without its lanes (D-16)» |
| A-05 | LOW | `7b1fe9bd` | Spec mancanti, verdi al primo colpo (comportamento già presente): ferito in attesa di soccorso libero nel predicato, sul filo e su `equipItem`; `deleteCharacter` permessa con la corsia standard avviata e una bozza aperta; `characterUpdated` a fine missione normale (corsia a null → flag a `false`); il caso «solo quest starts» ora scrive solo la PendingQuest con lo stesso update a pipeline di `QuestStartService.startSingle`, quindi passa da `PendingQuestStartPublisher` | `mission-lock.spec.ts`, `mission-in-progress.int-spec.ts` › «emits the lock when a solo quest starts on arrival (D-16)», «emits the release when a normal mission ends (D-23)», «answers free for a wounded character awaiting aid (D-23)»; `character-mutations-lock.int-spec.ts` › «allows a wounded character awaiting aid to change the equipment (D-23)»; `character-deletion.resolver.int-spec.ts` › «archives a character locked by a mission in progress (D-23)» |
| B-04 | LOW | `7861d95d` | `enemiesWithinCaps` spostata accanto ai tetti in `mission-draft.inputs.ts`; simulazione e salvataggio la importano da lì | suite unit e integration di `src/quests/guided` verdi prima e dopo |
| B-05 | LOW | `7861d95d` | `src/quests/guided/ids.ts` con `hexOf`, `presentOnly`, `uniqueIds`, `presentIds`, usato da completamento, salvataggio, servizio della bozza, mapper, `fight-state`, `draft-invalidation` e simulazione; il `hexOf` diverso di `mission-prizes.ts` rinominato `refHexesOf`; nel salvataggio il factory `outcomeOverrideInvalid()` si chiama diretto come negli altri file | come B-04 |
| B-07 | LOW | `7861d95d` | Tolto `export` da `sameEnemies`, `unsimulated`, `MISSION_DRAFT_PENDING_QUEST_INDEX`, `MISSION_DRAFT_CHARACTER_INDEX`; i casi di `sameEnemies` in `draft-invalidation.spec.ts` ora passano da `reconcileFights` (ordine, id, quantità, voce in più, voce in meno) | `draft-invalidation.spec.ts` |
| B-06 | LOW | `910b5ad3` | `simulate` diviso in passi con nome: `readDraft` (lettura), `assertSimulable` (ordine e tetti), `overlaidParticipants` (stato di partenza), `resolveFight` + `fightRecordOf` (risoluzione), `writeFight` (scrittura della bozza). Nessun cambio di comportamento | `mission-simulation.service.int-spec.ts` e `guided-mission.resolver.int-spec.ts` (33/33) verdi prima e dopo |
| A-02 | LOW | — | **Non corretto, per ruling.** D-23 garantisce la precedenza ai soli cinque codici elencati (`QUEST_IN_PROGRESS`, `QUEST_SLOT_BUSY`, `AWAITING_AID`, `CHARACTER_IMPRISONED`, `TRAVEL_IN_PROGRESS`), che è rispettata (ruling W6 del controllo dei piani); la guardia che esce prima di `PET_NOT_OWNED` e della città del negozio resta com'è. Il handoff lo dice | — |

## Fatti nuovi per il handoff (piano 18)

- **Tetto tecnico dei premi:** monete (ognuno dei tre tagli) e xp di un premio della bozza stanno in `0..9 999 999` (`MAX_PRIZE_AMOUNT`, tetto tecnico, non di prodotto: D-15 resta «liberi»). Oltre: `BAD_USER_INPUT` dal validatore sul filo, `OUTCOME_OVERRIDE_INVALID` dal dominio del salvataggio. Va citato fra i tetti tecnici di D-31. Il prefill dal blocco del titolo non passa dal salvataggio: un blocco con più di 9 999 999 in un taglio (nessuno oggi) non si potrebbe risalvare invariato.
- **Completamento e bozza cambiata:** il completamento usa solo la revisione della bozza che ha letto. Un salvataggio o una simulazione arrivati fra la lettura e la cancellazione nella transazione fanno rifiutare il completamento con `OUTCOME_OVERRIDE_INVALID`, senza alcuna scrittura (personaggi, risultati, PendingQuest e bozza nuova restano come dopo il salvataggio); l'oste ricarica la bozza e ricompleta. Una scrittura che arriva dopo la cancellazione riceve `NOT_FOUND` dalla bozza sparita.
- **Completamento concorrente:** due `completeGuidedMission` insieme sulla stessa richiesta (anche da due PendingQuest diverse del gruppo): uno vince, l'altro riceve `NOT_FOUND` (rifiuto esistente del perdente, `lostCompletionError`); un solo `QuestResult` per posto, due push di fine quest, bozza cancellata una volta.
- **Recupero della storia persa:** `MissionDraftLockPublisher` ora ripubblica tutti i titolari attivi delle corsie del GM quando il token di ripresa esce dall'oplog (come `MissionDraftQueueRefresher`).
- **Personaggio letto senza corsie:** i due campi risolti di `CharacterStatus` chiedono al reader invece di rispondere `false`.

## Esiti

- `npx tsc --noEmit -p tsconfig.json`: 0 dopo ogni commit di codice.
- Unit completa: 296/296 suite, 3944 test.
- Integration `src/characters` (`--runInBand`): 26/26 suite, 417 test.
- Integration `src/quests/guided` + `gm-completion.service.int-spec.ts` + `src/quests/pending-requests` + `test/app.int-spec.ts` + `test/authz` (`--runInBand`): 12/12 suite, 366 test.
- `git diff --exit-code src/schema.gql` vuoto dopo il boot di test di `test/app.int-spec.ts`.
- Prettier ed ESLint puliti sui file toccati, uno per uno.

---

_Corrette: 2026-11-14T05:28:27Z_
_Fixer: Claude (gsd-code-fixer)_
_Iterazione: 1_
