---
phase: 18-quest-heal-per-taglia
group: A
reviewed: 2026-11-10T11:43:49Z
depth: standard
files_reviewed: 30
files_reviewed_list:
  - src/quests/outcomes/injuries/cure-injuries.ts
  - src/quests/outcomes/injuries/cure-injuries.spec.ts
  - src/quests/outcomes/injuries/quest-cure.ts
  - src/quests/outcomes/injuries/quest-cure.spec.ts
  - src/quests/outcomes/injuries/heal-no-effect.ts
  - src/quests/outcomes/injuries/heal-no-effect.spec.ts
  - src/quests/outcomes/outcome-plan.ts
  - src/quests/outcomes/outcome-plan.spec.ts
  - src/quests/outcomes/rescue-plan.ts
  - src/quests/outcomes/rescue-plan.spec.ts
  - src/quests/outcomes/rewards/quest-rewards.ts
  - src/quests/outcomes/aid/aid-quest.ts
  - src/quests/outcomes/aid/aid-quest.spec.ts
  - src/quests/outcomes/gm-completion.service.int-spec.ts
  - src/quests/outcomes/quest-resolution.service.int-spec.ts
  - src/quests/results/quest-result.populate.spec.ts
  - src/quests/results/quest-result.resolver.int-spec.ts
  - src/quests/acceptance/quest-acceptance.service.ts
  - src/quests/acceptance/quest-acceptance.service.int-spec.ts
  - src/quests/acceptance/accept-quest.resolver.int-spec.ts
  - src/quests/no-effect/viewer-vitals.service.ts
  - src/quests/no-effect/quest-no-effect.resolver.ts
  - src/quests/quests.module.ts
  - src/quests/quests.resolver.int-spec.ts
  - src/quests/quest-updated.subscription.int-spec.ts
  - src/models/quest/quest-prizes.model.ts
  - src/models/quest/quest-prizes.schema.spec.ts
  - src/models/quest-result/quest-result.model.ts
  - src/models/quest-result/quest-result.schema.spec.ts
  - test/quests/quest-result.fixture.ts
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 18: Code Review Report — gruppo A

## Summary

Rivisti a `c130b67b` i 30 file elencati (spec incluse). Nessun jest lanciato, nessuna scrittura sul repo.

Il nucleo regge. Verificato leggendo codice e spec:
- La cura è calcolata in `planParticipant` dopo combattimento (`woundsAfter` sulle ferite d'ingresso più quelle nuove) e dopo `progressionAfter`, solo se `won`; sulla sconfitta `cure` è `null` e la spec lo prova. Il tetto è `lifePointsWithin(max(hp, round(max × quota)), max)` sul massimo post level up; la spec distingue 500 da 600 (massimo 1200) e il caso hp sopra il tetto.
- `injuriesHealed` è l'insieme senza duplicati nell'ordine del personaggio (`cureInjuries`), calcolato su `fought.injuries`; una ferita presa e guarita nello stesso esito esce da `status.injuries` ma resta in `injuriesAdded` (pinnato, coerente con D-20).
- La regola Phase 9 D-15 è sparita: nessun `QuestType.heal` rimasto in `src/` fuori dall'accettazione e dal campo `noEffect`. La aid non clona `cure` (`clonedPrizesOf` elenca i campi, la spec prova l'insieme esatto delle chiavi), il completamento del GM e il soccorso passano dallo stesso `planParticipant`.
- `healHasNoEffect` è l'unico predicato; accettazione e `Quest.noEffect` costruiscono lo stesso soggetto con `statusFactsOf` (legacy senza HP: vita = massimo = riga della tabella per xp) e le stesse `injuries ?? []`. Il rifiuto sta dopo `classifyEligibility` e prima di città, movimento, fame e transazione, solo per `heal`, senza scritture (spec con confronto dell'intero stato del DB).
- `ViewerVitalsService` memorizza per `(rootValue evento | context richiesta)` poi per `ruolo:userId`: due subscriber dello stesso evento non si passano il valore, due eventi dello stesso subscriber hanno chiavi diverse, due richieste HTTP hanno context diversi. Falso senza personaggio corrente o con personaggio non attivo, nessun ramo sul ruolo, 2 letture per viewer per richiesta/evento indipendentemente da N (spec con `spyOn` e `mockRestore` in `finally`).
- Nessun `Math.random`/`Date.now`/`process.env`/`jest.mock(`/import di `app.module` nei file del gruppo. Nessun log nuovo. SDL additivo coi nomi del contratto (`Quest.noEffect: Boolean!`, `QuestCure`, `QuestPrizes.cure`, `QuestResult.injuriesHealed`).

Un solo difetto reale: la lettura sul filo di `QuestPrizes.cure` non è sanificata, a differenza di tutte le altre letture della cura (A-WR-01). Il resto sono lacune di prova e pulizia.

## Warning

### A-WR-01: `QuestPrizes.cure` sul filo non è sanificata: contenuto scritto col driver nativo rompe il campo con un errore GraphQL

**File:** `src/models/quest/quest-prizes.model.ts:17-25` (con `src/quests/quest-catalog.populate.ts` `dropOrphanCatalogRefs`, fuori dal gruppo, che è il punto dove andrebbe sanificata, e `src/quests/quests.service.ts:60-70`)
**Issue:** D-23 e il brief chiedono che ogni lettore sanifichi il contenuto scritto a DB senza Mongoose (quota fuori scala = 0, ferite ignote scartate, liste non liste vuote). `cureOf` lo fa per risoluzione, completamento e predicato, ma il tipo `QuestCure` sul filo (`lifePointsShare: Float!`, `canHeal: [InjuryType!]!`) serializza il documento grezzo: nessun resolver o passo del populate lo normalizza (`dropOrphanCatalogRefs` tratta `prizeItem`, `randomLoot`, `pet` e non `cure`; `grep cureOf src` non lo trova in nessun percorso di lettura del catalogo). Scenario: lo script di contenuto di D-14 (driver nativo, nessun validatore) scrive per una heal `cure: { canHeal: ['deepCut'] }` (manca la quota) oppure `canHeal: ['brokenWing']` (typo). Mongoose idrata senza validare; sul filo `lifePointsShare` null su `Float!` o il valore sconosciuto sull'enum dà un errore GraphQL, che risale fino al campo nullable `cure`: la query `quests` risponde con `data` parziale più `errors` per ogni quest toccata. `graphql_flutter` tratta di norma la presenza di `errors` come eccezione, quindi un solo documento sbagliato può far cadere l'intero tabellone della FE. Anche una quota fuori scala (2) arriverebbe tale e quale alla FE, mentre il backend la legge come 0: la FE mostrerebbe una cura che il server non applica. Nessuna spec copre il filo con una `cure` malformata (le spec di `cureOf` sono solo unitarie).
**Why it matters:** il fail-safe D-01/D-23 vale per il server ma non per ciò che la FE legge; l'errore si manifesta proprio nella finestra dello script di contenuto (166 heal scritte a mano sul driver nativo) e rompe una lista intera, non una quest. Il backend è la fonte di verità: ciò che arriva alla FE deve essere ciò che il server applicherebbe.
**Suggested fix:** sanificare nel punto in cui il catalogo ripulisce già i ref orfani, riusando `cureOf` (nessuna seconda regola): in `dropOrphanCatalogRefs`, dentro `if (prizes)`, assegnare `prizes.cure = cureOf(prizes.cure)` (tipo `unknown` in `CatalogRefsHolder.prizes`); `cureOf` restituisce un oggetto nuovo con quota in [0, 1] o 0, `canHeal` filtrata e `null` per un valore non oggetto. Spec RED prima, in `src/quests/quests.resolver.int-spec.ts` (describe del catalogo): persistere con `collection.insertOne`/`updateOne` del driver nativo tre quest con `cure` `{ canHeal: ['deepCut'] }`, `{ lifePointsShare: 2, canHeal: ['brokenWing', 'deepCut'] }` e `'full'`; la query `{ quests { id prizes { cure { lifePointsShare canHeal } } } }` deve avere `errors` indefinito e rispondere rispettivamente `{ 0, ['deepCut'] }`, `{ 0, ['deepCut'] }`, `null`; controllo positivo con una cura valida invariata. Se la scelta è lasciare il filo grezzo, registrare la deviazione nel SUMMARY e nell'handoff (lo script di contenuto deve validare lui il documento).

## Info

### A-IN-01: nessuna prova della parità fra rifiuto e campo per un personaggio legacy senza HP

**File:** `src/quests/no-effect/viewer-vitals.service.ts:90-95` e `src/quests/acceptance/quest-acceptance.service.ts:355-364`
**Issue:** entrambi i percorsi ricavano vita e massimo da `statusFactsOf`, quindi per costruzione non divergono, ma nessuna spec esercita un personaggio senza `status.currentLifePoints`/`status.maxLifePoints` (legacy): il valore atteso (vita = massimo da tabella per xp, quindi heal senza effetto se senza ferite curabili) non è pinnato né in `heal-no-effect.spec.ts` né nelle int-spec di accettazione e di `noEffect`. Una futura modifica della proiezione (`VIEWER_VITALS_PROJECTION` o `CHARACTER_PROJECTION` perdono `status.xp`) farebbe leggere il livello 1 a un personaggio di livello alto senza nessuna spec rossa.
**Why it matters:** D-25 impone che i due percorsi non possano divergere; la parità regge sulla proiezione, che è esattamente la parte che nessuna prova guarda.
**Suggested fix:** aggiungere una spec RED in `quest-acceptance.service.int-spec.ts` (describe «a heal without effect») e un caso gemello in `quests.resolver.int-spec.ts`: personaggio con `$unset` di `status.currentLifePoints` e `status.maxLifePoints` e `status.xp` alto, heal `VILLAGE_CURE`, nessuna ferita: `acceptQuest` rifiutata con `QUEST_NO_EFFECT` e `noEffect` vero; con `deepCut` accettata e `noEffect` falso.

### A-IN-02: la prova «al cambio di vita fra due eventi» cambia solo le ferite

**File:** `src/quests/quest-updated.subscription.int-spec.ts:496-515`
**Issue:** `resolves noEffect again at every event` verifica che lo stesso subscriber veda il valore nuovo dopo un evento successivo, ma l'unica variazione è `status.injuries` (`woundWithDeepCut`). Il ramo della vita del predicato (`currentLifePoints >= ceiling`) non è mai variato fra eventi sul filo; una memo che tenesse la vita (non le ferite) fra eventi dello stesso subscriber passerebbe. Il brief chiede esplicitamente il caso «cambia vita fra due eventi».
**Why it matters:** la trappola della cache condivisa della Phase 16 si è già presentata una volta su un campo per viewer; la prova deve coprire entrambi gli ingressi del predicato.
**Suggested fix:** aggiungere un terzo passo o un test gemello: alice a 400/1000 (`noEffect` falso per la quota 0,5) poi `$set` di `status.currentLifePoints: 600` (nessuna ferita), `retitle`, evento successivo `noEffect` vero; ed eventualmente il ritorno a 400 con un altro `retitle`.

### A-IN-03: duplicazione dello scheletro di memo per viewer e proiezione con un campo non usato

**File:** `src/quests/no-effect/viewer-vitals.service.ts:39-70`, `:17-23`
**Issue:** `ViewerVitalsService.of`/`viewersOf` ripete riga per riga lo scheletro di `ViewerKnowledgeService` (WeakMap su `viewerCacheKeyOf`, `Map` per viewer, template `${role}:${userId}` che là è la funzione non esportata `viewerKeyOf`). Inoltre `VIEWER_VITALS_PROJECTION` legge `status.title`, che il servizio non usa: serve solo perché `StatusSnapshot.status.title` è obbligatorio in `statusFactsOf`.
**Why it matters:** due copie della regola più delicata della fase (la chiave della memo) possono divergere alla prossima correzione; una lettura in più è piccola ma contraddice «proiezioni minime».
**Suggested fix:** estrarre in `src/lore/viewer-knowledge.service.ts` (o un file vicino) una piccola classe/funzione `perViewerMemo<T>(cache, identity, context, info, read)` esportata ed usata da entrambi i servizi, con `viewerKeyOf` esportata. Per il titolo: restringere `StatusSnapshot` a `Pick`/titolo opzionale per i chiamanti che non lo usano, oppure lasciare la proiezione e commentare il perché; non urgente.

### A-IN-04: l'asserzione sul numero di letture dello User è fragile e il commento la contraddice

**File:** `src/quests/quests.resolver.int-spec.ts:781-793` (blocco `reads the character once per request`)
**Issue:** il commento dice «il tabellone legge lo User una volta, i vitali una sola volta per entrambe le heal», ma l'asserzione è `userRead` chiamata 2 volte (1 del tabellone più 1 dei vitali). Il numero 2 dipende dalle letture interne di `QuestsService.boardScopeOf`: se il servizio ne guadagnasse una, la spec rossa non indicherebbe la regressione della memo; viceversa un secondo `findById` dei vitali compensato da una lettura in meno del tabellone passerebbe. La prova solida è già nel secondo filtro (`vitalsReads` toHaveLength(1), filtrato per proiezione).
**Why it matters:** una prova di costo che può fallire per il motivo sbagliato (o non fallire) è rumore al prossimo refactor del tabellone.
**Suggested fix:** togliere l'asserzione `userRead toHaveBeenCalledTimes(2)` oppure filtrarla per la proiezione `{ currentCharacter: 1 }` insieme alle chiamate dei vitali come per `characterRead`; correggere il commento nel senso scelto.

---

_Reviewed: 2026-11-10T11:43:49Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
