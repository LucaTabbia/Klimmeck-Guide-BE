# Ruling dell'orchestratore su 13-REVIEW.md (BE Phase 13) — applicare in quest'ordine, una coppia di commit (spec RED → fix GREEN) per finding

I tre report di gruppo (`13-REVIEW-A/B/C.md`) restano la fonte dei dettagli (file:riga, scenario). Qui solo la decisione e la direzione.

## Gruppo A — generazione

### A-WR-01 — FIX
Direzione: in `QuestGenerator` (a) `whenIdle()` attende in un ciclo finché `this.inFlight` è nullo (`while (this.inFlight) await this.inFlight.catch(() => undefined)`), così copre anche la corsa riavviata dal rerun; (b) flag privato `closed` impostato da un metodo pubblico `close(): Promise<void>` (= `closed = true; rerun = false; await whenIdle()`), con `request()` e il rerun del `finally` che diventano no-op quando `closed` è vero; `QuestGenerationSweeper.onModuleDestroy` chiama `generator.close()` invece di `whenIdle()`. `generate()` chiamato esplicitamente dopo `close()` resta ammesso (la mutation non passa dallo sweeper).
Spec RED prima in `quest-generator.service.spec.ts` (o nella spec unit esistente del generatore, con `runOnce` spiato): (1) con un rerun in coda, `whenIdle()` si risolve solo dopo la seconda corsa (contatore delle corse = 2); (2) dopo `close()`, `request()` non avvia nessuna corsa; (3) lo sweeper, allo stop, chiama `close()`.

### A-IN-01 — NOT_NEEDED
Gli hook `onApplicationBootstrap` di Nest girano in sequenza per modulo nell'ordine del grafo (`QuestMaintenanceModule` precede `QuestGenerationModule` in AppModule) e il generatore è single-flight con rerun: al peggio una corsa a vuoto, mai una corsa sui dati non migrati che scriva qualcosa di sbagliato (il filtro `legendary: false` è fail-closed). Registrare il motivo; nessun cambio di codice.

### A-IN-02 — FIX
Direzione: in `runOnce()` il log `Generatore: ${created} missioni create (target ${target})` va in un `finally` (o dopo un `try/catch` che rilancia), così le quest già create vengono contate e loggate anche se una `create` fallisce con un errore diverso da E11000; l'errore si propaga come oggi.
Spec RED prima (unit, model `create` che lancia un errore generico alla seconda chiamata): il log riporta `1 missioni create`, poi l'errore è rilanciato.

### A-IN-03 — NOT_NEEDED
`pick`/`shuffle` di `SeededChanceSource` sono ripristinati identici per decisione (D-17, «PRNG seminato ripristinato») e coperti dalla spec; `LEGEND_PARTY_AVERAGE_PE` documenta la regola dell'utente (i legend non hanno boss) ed è citata nel CONTEXT. Registrare il motivo; nessun cambio di codice.

### A-IN-04 — FIX
Direzione: in `recommended-loot.ts` sostituire `rarity in RARITY_RANK` con `Object.hasOwn(RARITY_RANK, rarity)` (o `Object.prototype.hasOwnProperty.call`), e fare lo stesso ovunque la fase usi `in` su un Record indicizzato da stringhe esterne (`generated-prizes.ts`, `generation-rules.ts`: controllare con `grep -n " in RARITY_RANK\| in RANK_XP_BANDS\| in BOSS_PARTY_AVERAGE_PE\| in LOOT_POOLS"`).
Spec RED prima: un catalogo con `rarity: 'constructor'` non produce candidati (prima: TypeError o candidato spurio).

### A-IN-05 — FIX (solo documentazione)
Direzione: (a) un commento di testa in `quest-generator.service.ts` (sopra `runOnce`) che elenca l'ordine dei tiri per quest: `pickCity` (1) → `pickPoi` (1) → `composeQuest` (vedi `quest-composition.ts`) → `prizesOf` (vedi `generated-prizes.ts`) → `announcementOf` (1); (b) il commento del harness `test/quests/generation-world.ts:130` corretto («un leggendario per ogni voce di `enemyXps`»). `pickPoi` resta tipato `string` (protetto dal peso 0 della città senza POI liberi): annotarlo nel commento di `pickPoi`. Commit `docs(generation): …`, nessuna spec.

## Gruppo B — esiti

### B-WR-01 — FIX
Direzione: in `dungeon-context.ts` il posseduto di un EquipmentItem è `Math.max(somma di ownedEquipments, copie negli slot di wearedEquipment)` (indossare NON toglie l'oggetto da `ownedEquipments`: `characters.service.ts` popola lo slot dalla mappa degli owned). Aggiornare le due spec esistenti («worn included» con `ownedEquipments` che contiene l'oggetto; «sums…» diventa «does not double count the worn copy (D-11)»).
Spec RED prima in `dungeon-context.spec.ts`: spada x1 in `ownedEquipments` e nello slot `weapon` → `quantity: 1`; spada x2 owned e una indossata → 2; solo nello slot (caso difensivo) → 1.

### B-IN-01 — FIX (solo documentazione)
Direzione: una dungeon senza nemici validi segue la regola C6/D-01 di tutti i tipi (successo automatico, stages null): scriverlo in un commento in `quest-resolution.service.ts` (`fight`) e marcare il ramo «zero nemici ⇒ 0/0» di `placeholder-dungeon-resolver.ts` come difensivo nel commento; aggiungere una riga alla §14 del `BACKEND-NOTES.md` della fase. Commit `docs(dungeon): …`, nessuna spec.

### B-IN-02 — FIX (Boy Scout)
Direzione: `dungeon-context.ts` importa `isPositiveInteger` da `src/quests/outcomes/outcome-numbers.ts` e cancella la copia locale; le spec restano verdi. Commit `refactor(dungeon): …` (nessuna RED: comportamento identico sui valori usati; annotarlo in REVIEW-FIX.md).

### B-IN-03 — FIX
Direzione: `readEnemies` in `resolution-loader.service.ts` usa la proiezione dei sei campi di `CombatEnemySnapshot` (`_id`, `name`, `lifePoints`, `xp`, `damages`, `baseWeaknesses`, `energyWeaknesses`: usa l'elenco reale dello snapshot) come le altre letture del catalogo.
Spec RED prima: la spec unit del loader (o una nuova, con `enemyModel.find` spiato) verifica la proiezione passata (`toEqual` sull'oggetto) — se non esiste un punto di spia pratico, basta la int-spec `quest-combat.int-spec.ts` verde e la nota in REVIEW-FIX.md.

## Gruppo C — modelli, SDL, manutenzione

### C-WR-01 — FIX
Direzione: `DungeonStagesMigrator` scrive solo se le tappe finali sono almeno 2 (una dungeon con 0 nemici che riceve 1 sola tappa resta com'è e conta come `skipped`), così la seconda corsa è sempre 0.
Spec RED prima nella int-spec del migratore: dungeon aperta con 0 nemici e un sorteggio che aggiunge 1 tappa → non scritta; doppia corsa su un mondo misto → la seconda dà `{ enriched: 0, skipped: <stesso di prima> }`.

### C-IN-01 — NOT_NEEDED
`SweepIndexVerifier` (Phase 10) è fuori dalla fase; il generatore gira in un solo processo single-flight e rilegge i POI occupati a ogni corsa, l'indice unico è la seconda difesa; un fallimento della creazione è loggato al boot. Registrare il motivo e una riga nel handoff §14 («verificare al primo boot che il log del verifier non segnali l'indice `quest_generated_open_marker`»).

### C-IN-02 — FIX
Direzione: `JewelAccessoryMigrator.migrate()` distingue gli id della tabella (a) assenti a DB e (b) presenti ma con `equipType` diverso da ring/necklace: entrambi finiscono nel WARN (due righe distinte o una sola con le due liste), nessuno viene scritto.
Spec RED prima nella int-spec del migratore: un id della tabella salvato come `equipType: 'weapon'` → non scritto e segnalato nel WARN.

### C-IN-03 — FIX
Direzione: il filtro di lettura e quello di scrittura del `DungeonStagesMigrator` aggiungono `startedAt: null` (mai allungare una dungeon già avviata).
Spec RED prima nella int-spec: una dungeon con `startedAt` valorizzato e ≤ 1 nemico non viene arricchita.
