---
phase: quick-261111-enm
plan: 01
subsystem: quests
tags: [quests, acceptance, capacity, generation, enemy, aid]
key-files:
  modified:
    - src/quests/acceptance/quest-capacity.ts
    - src/quests/acceptance/quest-eligibility.ts
    - src/quests/generation/generated-quest-draft.ts
    - src/quests/outcomes/aid/aid-quest.ts
    - src/quests/acceptance/quest-capacity.spec.ts
    - src/quests/acceptance/quest-eligibility.spec.ts
    - src/quests/generation/generated-quest-draft.spec.ts
    - src/quests/outcomes/aid/aid-quest.spec.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/quests/party/quest-start.int-spec.ts
    - src/quests/outcomes/quest-combat.int-spec.ts
    - src/quests/generation/quest-generator.int-spec.ts
    - test/quests/generation-world.ts
    - test/quests/quest-generation.e2e.int-spec.ts
commits:
  - { hash: 1ff1cbe1, message: "test(quick-261111-enm): pin rank-free single-taker enemy quests" }
  - { hash: d3daf25d, message: "fix(quick-261111-enm): let one player of any sufficient rank take enemy" }
---

# Quick 261111-enm: le quest `enemy` si prendono da soli, col rango ≥ quello richiesto

## Parole dell'utente (UAT su device, 2026-11-11)

- «Non posso accettare né boss né enemy, il mio rango non va bene. Perché la enemy ha uno slot però? Le enemy non dovrebbero avere slot, possono essere prese solo dal giocatore e solo se il rango è adatto (più alto o uguale a quello richiesto)»

## Decisioni

1. **Supera «posti a titolo esatto» (Phase 13 D-09 emendata) per il solo tipo `enemy`.** Una `enemy` la prende un solo giocatore di rango ≥ `requirements.minTitle`; il posto non ha titolo. I `boss` restano a posti a titolo esatto (con i legend che scalano sui posti hero, 13.1 D-08): fuori scope.
2. **Dove vive la regola:** `questSlotsOf(type, requiredAdventurers)` in `src/quests/acceptance/quest-capacity.ts`, funzione pura. Per `QuestType.enemy` ritorna sempre `soloSlots()` = `[{ title: null, count: 1 }]`, qualunque titolo e qualunque numero di posti porti il documento; per gli altri tipi ritorna i posti scritti. Posti assenti o non validi restano `'invalid'` anche per la `enemy` (fail-closed D-27: `QUEST_NOT_ACCEPTABLE`).
3. **Chi la legge (nessun percorso in disaccordo):**
   - `registrationRuleOf` (`quest-eligibility.ts`) → la `SlotRule` usata dalla pre-verifica (`classifyEligibility`), dal filtro atomico di registrazione (`registrationFilter` → `seatAvailableExpr`), da `QuestStartService.startParty` (`rule.total`) e da `PartyTimeoutService.disband`. Con la regola `{ seats: {}, wildcard: 1, total: 1 }` il secondo giocatore è rifiutato con `QUEST_FULL`, come prima.
   - `aidSlotsOf(requiredAdventurers, type)` (`aid-quest.ts`) → la aid nata da una `enemy` persa porta un posto senza titolo anche quando la quest fallita portava il posto a titolo scritto prima della regola (altrimenti solo un personaggio di quel titolo esatto avrebbe potuto soccorrere). `AidSourceQuest.infos` dichiara ora `type` (già letto dalle proiezioni `infos: 1`).
   - Il rango resta deciso da `meetsTitle` (rango ≥ `minTitle`, invariato) nella pre-verifica e in `classifyUnclaimed`.
4. **Generatore:** `generatedQuestDraftOf` scrive `requiredAdventurers: [{ title: null, count: 1 }]` per le `enemy` (stessa `soloSlots()`), `minTitle = composition.rank` come prima; per i `boss` `[{ title: rank, count: seats }]` come prima.
5. **Robustezza sui dati esistenti:** una `enemy` aperta con il vecchio posto a titolo esatto si comporta come una nuova, con o senza l'aggiornamento a DB (casi int-spec «the rank-exact seat written before the rule»).
6. **Lettori non toccati di proposito:** `pending-requests.builder.ts` e il campo GraphQL `requirements.requiredAdventurers` continuano a servire i posti come sono a DB (vedi «Per la FE»). SDL invariato.

## Per la FE

- Per le quest `enemy` **non disegnare il posto** (né slot, né titolo del posto, né «1/1»): l'accettabilità è `rango del personaggio ≥ requirements.minTitle` e quest non ancora presa (`registeredAdventurers` vuoto).
- Sul filo `requirements.requiredAdventurers` porta ancora un elemento: `{ title: null, count: 1 }` per le quest nuove e, fino all'aggiornamento dei contenuti a DB, eventualmente `{ title: <rango>, count: 1 }` per le quest vecchie. La FE non deve usare quel titolo per decidere se il personaggio può accettare una `enemy`.
- Codici invariati: `QUEST_TITLE_MISMATCH` (rango insufficiente), `QUEST_FULL` (già presa), `QUEST_NOT_ACCEPTABLE` (posti non validi a DB).
- `boss`: nessun cambio, i posti a titolo esatto si disegnano come prima.

## Passo di contenuto per l'orchestratore (DB)

- Collezione delle quest: sui documenti con `infos.type = 'enemy'` e `concludedAt = null`, impostare a `null` il `title` dell'unico posto in `requirements.requiredAdventurers` (cioè `requirements.requiredAdventurers = [{ title: null, count: 1 }]`). Attese 155 quest generate aperte.
- Facoltativo, stessa correzione: le quest `aid` aperte (`concludedAt = null`) la cui `rescue.failedQuest` è una `enemy` e che portano ancora un posto a titolo clonato prima di questo fix → stesso `[{ title: null, count: 1 }]`. Le aid create dopo il fix nascono già corrette.
- Il comportamento del BE non dipende da questo aggiornamento per le `enemy`; serve a rendere coerente il dato servito alla FE. Per le `aid` già clonate invece il dato a DB è la regola (il tipo `aid` tiene i posti scritti).

## RED osservati

- `1ff1cbe1`: unit `Tests: 26 failed, 179 passed` sulle quattro spec toccate (`questSlotsOf`/`soloSlots` assenti, regola della `enemy` ancora a titolo esatto, draft col posto a titolo, aid che clona il posto a titolo).
- Integration (`-t 261111-enm` e i casi della corsa): falliti «lets a paladin take a rookie enemy quest with the rank-exact seat…», «lets exactly one of an adventurer, a hero and a legend racing… with the rank-exact seat…», «starts an enemy at the arrival of its only taker whatever seats it carries», «gives the aid of a lost enemy quest one rank-free seat». I casi con il posto già senza titolo, il rifiuto del rookie e il caso `boss` erano verdi già in RED: sono guardie di non regressione, non prove del fix.

## Gate

- `npx tsc --noEmit -p tsconfig.json`: 0.
- `npx jest --selectProjects unit`: 272 suite / 3534 test verdi.
- `npx jest src/quests --selectProjects integration --runInBand`: 35 suite / 529 test verdi (161 s).
- `npx jest src/travel test/quests test/app.int-spec.ts --selectProjects integration --runInBand`: 14 suite / 311 test verdi.
- `git diff --exit-code src/schema.gql` dopo la spec di boot reale: 0.
- prettier ed eslint sui soli file toccati: puliti. Subject 63 e 71 byte, nessun trailer. `pgrep -fl 'bin/jest'` vuoto.

## Deviazioni e note

- **Numero di posti ignorato oltre al titolo.** Il design chiedeva di ignorare il titolo del posto; la regola ignora anche `count` (una `enemy` scritta a mano con più posti vale un posto solo), perché l'utente dice «possono essere prese solo dal giocatore». A DB le 155 generate hanno già un posto solo: nessun effetto sui dati noti.
- **Clonazione della aid** aggiunta al perimetro (era fra i lettori da controllare): senza, la aid di una `enemy` vecchia presa da un rango più alto sarebbe rimasta soccorribile solo dal titolo esatto del posto.
- **Posti non validi:** una `enemy` senza posti validi resta non accettabile (D-27), anche se la regola nuova non usa i posti. Scelta conservativa: il difetto di catalogo continua a emergere nel log invece di diventare silenzioso.
- `ENEMY_SEATS` (`generation-rules.ts`) resta per il budget di PE della composizione; il posto scritto dal generatore viene da `soloSlots()`.
