---
phase: 13-generazione-quest
group: A
reviewed: 2026-11-04T12:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - src/config/quest-generation-config.ts
  - src/quests/generation/city-picker.ts
  - src/quests/generation/enemy-pool.ts
  - src/quests/generation/generated-prizes.ts
  - src/quests/generation/generated-quest-draft.ts
  - src/quests/generation/generation-rules.ts
  - src/quests/generation/quest-composition.ts
  - src/quests/generation/quest-generation-trigger.module.ts
  - src/quests/generation/quest-generation-trigger.ts
  - src/quests/generation/quest-generation.module.ts
  - src/quests/generation/quest-generation.resolver.ts
  - src/quests/generation/quest-generation.sweeper.ts
  - src/quests/generation/quest-generator.service.ts
  - src/quests/generation/quest-templates.ts
  - src/quests/generation/recommended-loot.ts
  - src/quests/generation/seeded-chance.ts
  - test/quests/generation-world.ts
findings:
  critical: 0
  warning: 1
  info: 5
  total: 6
status: issues_found
---

# Phase 13: Code Review Report — gruppo A (generation)

## Summary

Il gruppo è solido. Verificato senza rilievi: nessun `Math.random` né `process.env` sotto `src/` nei moduli di generazione (RNG iniettato via `ChanceSource`); filtro `legendary === false` fail-closed sia in query (`readEnemies`) sia nei pool; pool ordinati per id; posti del boss in [2, 6] solo adventurer..hero; legend sempre `enemy` 2–4 unità della fascia hero; premi entro i tetti (600 × 25 = 15 000 rame, 120 × 25 = 3000 XP) con `hunger` escluso da rare in su e pet 1 % solo boss da `sellable: false`; consigliati senza tiri; kNN una volta per corsa, `pickCity` null senza consumare tiri; il ciclo di `runOnce` termina sempre (ogni giro toglie un POI libero); E11000 catturato con `isDuplicateKeyError` e POI scartato; config fail-closed senza eco del valore e `.env.example` aggiornato; resolver `@Roles(innkeeper)` + `@AuditTarget`; `QuestGenerationModule` importato dal solo AppModule.

Un solo warning: la garanzia di arresto pulito di `whenIdle()` ha una finestra in cui una nuova corsa parte dopo che l'attesa si è già risolta. Il resto è qualità.

## Warning

### A-WR-01: `whenIdle()` non copre un rerun avviato dal `finally` né una `request()` arrivata dopo lo stop

**File:** `src/quests/generation/quest-generator.service.ts:181-202`
**Issue:** `generate()` assegna a `inFlight` la promessa `drain().finally(...)`. Se `rerun` è `true` quando il `finally` gira, `startSafely()` avvia subito una nuova corsa e `inFlight` passa alla nuova promessa. `whenIdle()` aveva però agganciato la vecchia: si risolve mentre la nuova corsa è in volo. Succede quando una `request()` cade tra il controllo `while (this.rerun)` di `drain()` e il `finally` (microtask), oppure quando `drain()` lancia con `rerun` già impostato. In più `request()` non conosce lo stop: una conclusione di quest generata (trigger D-17) durante lo shutdown avvia una corsa dopo `onModuleDestroy`; lo `stopping` dello sweeper protegge solo il timer.
**Why it matters:** `onModuleDestroy` promette che la corsa in volo finisce prima che Mongoose chiuda (commento dello sweeper). Con una corsa orfana la connessione si chiude a metà, le `create` falliscono con errori di connessione e i log dello shutdown sono rumorosi. Nessuna perdita di dati, perché le create sono atomiche e il DB decide alla corsa successiva.
**Suggested fix:** RED in `quest-generator.int-spec.ts` (o unit con model finti): `request()` durante una corsa, poi `whenIdle()` deve risolversi solo dopo la seconda corsa; dopo `whenIdle()` una `request()` non deve avviare nulla. Poi:
```ts
async whenIdle(): Promise<void> {
    while (this.inFlight) {
        await this.inFlight.catch(() => undefined);
    }
}
// + flag `closed` impostato da un metodo `stop()` chiamato da onModuleDestroy prima di whenIdle();
// request() e il rerun del finally diventano no-op quando closed
```

## Info

### A-IN-01: la corsa al boot dello sweeper non aspetta le migrazioni di `QuestMaintenanceBoot`

**File:** `src/quests/generation/quest-generation.sweeper.ts:25-32`
**Issue:** `QuestMaintenanceBoot` ordina i passi (flag dei leggendari, gioielli, tappe) e solo dopo chiama `request()` ("a dati pronti", D-17). Lo sweeper chiama però `request()` in modo indipendente nel proprio `onApplicationBootstrap`, senza ordine garantito rispetto a quello dell'orchestratore.
**Why it matters:** Al primo boot dopo il deploy la corsa dello sweeper può leggere nemici non ancora marcati. Nessun danno: il filtro è fail-closed (0 candidati) e il `request()` di manutenzione accoda un rerun. Resta una corsa sprecata, e il commento "a dati pronti" non è garantito dal codice.
**Suggested fix:** Togliere `this.generator.request()` dal boot dello sweeper e lasciare solo la richiesta di manutenzione; oppure documentare che il doppio `request()` è voluto e coperto dal rerun.

### A-IN-02: errore a metà corsa perde il conteggio e il log delle quest già create

**File:** `src/quests/generation/quest-generator.service.ts:222-249`
**Issue:** Il log "N missioni create" è solo in fondo a `runOnce`. Se una `create` lancia un errore diverso da E11000 dopo alcune creazioni riuscite, `startSafely` logga solo "corsa fallita".
**Why it matters:** Chi legge i log non vede che alcune quest sono state create. Un `generateQuests` fallito dà all'oste un errore senza dire cosa è stato scritto.
**Suggested fix:** `try { ... } finally { if (created > 0) this.logger.log(...) }` in `runOnce`, con un test che scripta un errore alla seconda `create`.

### A-IN-03: export mai usati in `src/`

**File:** `src/quests/generation/seeded-chance.ts:16-31`, `src/quests/generation/generation-rules.ts:42`
**Issue:** `SeededChanceSource.pick` e `shuffle` non sono chiamati da codice di produzione (solo `keyedChance` è usato dal migratore delle dungeon); `LEGEND_PARTY_AVERAGE_PE` non è letto da nessuno (il commento lo dichiara "documentata").
**Why it matters:** Superficie morta da mantenere; due metodi in più nel PRNG da tenere deterministici.
**Suggested fix:** Eliminare `pick`/`shuffle` (e le relative spec) e trasformare `LEGEND_PARTY_AVERAGE_PE` in commento, oppure usarli.

### A-IN-04: `rarity in RARITY_RANK` accetta chiavi del prototipo

**File:** `src/quests/generation/recommended-loot.ts:46-50`
**Issue:** `'constructor' in RARITY_RANK` è `true`, quindi una rarità letta dal DB con quel valore (campo curato a mano) restituirebbe una funzione come rango; `rank <= maxRank` dà `false`, ma il tipo `number` è violato e la logica "rarità sconosciuta esclusa" poggia sul caso.
**Why it matters:** Fragilità teorica, nessuno scenario reale oggi.
**Suggested fix:** `Object.hasOwn(RARITY_RANK, rarity)`; spec con rarità `'constructor'` esclusa.

### A-IN-05: ordine dei tiri non documentato in un punto solo; commento del harness impreciso

**File:** `src/quests/generation/quest-generator.service.ts:230-299`, `test/quests/generation-world.ts:130`
**Issue:** L'ordine dei tiri per quest (città, POI, rango/forma, pool, premi, pet, annuncio) è corretto e stabile ma emerge solo leggendo cinque file; `pickPoi` ha tipo di ritorno `string` ma con lista vuota restituirebbe `undefined` (oggi protetto dal peso 0). Nel harness il commento sopra `persistGenerationWorld` dice "un leggendario per fascia", ma ne crea uno per ogni voce di `enemyXps`.
**Why it matters:** Chi cambia un passo sposta tutti i tiri successivi senza accorgersene (le spec seed-based si rompono senza spiegazione).
**Suggested fix:** Un commento di testa a `createOn` con l'ordine dei tiri; `pickPoi` che lancia (o ritorna `string | undefined`) con lista vuota; correggere il commento del harness.

---

_Reviewed: 2026-11-04T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
