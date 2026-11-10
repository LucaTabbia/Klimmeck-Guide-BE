# BACKEND-NOTES — Phase 18 Quest heal per taglia (handoff per la FE Phase 18)

- **Fase BE:** 18-quest-heal-per-taglia (requisiti BE-HEAL-01..09; decisioni D-01..D-25 in `18-CONTEXT.md`; nomi del contratto fissati in `18-REPO-RULES.md` insieme alla FE `18-REPO-RULES.md`).
- **Data:** 2026-11-10. Documento scritto dopo il gate verde del piano 18-11; **review del codice in corso** (i fix della review possono aggiornare questo file prima della PR).
- **Branch:** `feat/18-quest-heal-per-taglia` → PR verso `develop` a cura dell'orchestratore, **in draft** finché l'orchestratore non è pronto ad applicare gli script di contenuto subito dopo la merge e il riavvio del BE (finestra operativa, §3 e).
- **Gate della FE Phase 18:** i piani che selezionano i nomi nuovi partono dopo la merge con `git -C <repo BE> show origin/develop:src/schema.gql | grep -cF '<nome>'` ≥ 1 per `type QuestCure`, `injuriesHealed`, `noEffect`, `type LootRecovery`, `potionRecoveryUntil`, `useItem(`, `type UseItemResult`.
- **Schema:** `src/schema.gql` **solo additivo** rispetto a `origin/develop` (zero righe tolte o cambiate); il boot reale (`test/app.int-spec.ts`, 84 test) rigenera lo schema e `git diff --exit-code src/schema.gql` esce 0.
- **Stato:** implementato e coperto da test. Gate 18-11: `npx tsc --noEmit` 0; unit 253 suite / 3219 test (+1 suite / 6 test aggiunti dal gate); integration 136 suite in quattro blocchi tutte verdi (dettaglio in `18-11-SUMMARY.md`); coverage di `./src/quests/acceptance/` 99,04 / 92,64 / 99,72 (statements / branches / lines; soglie 97 / 91 / 98). `npm run test:cov` lo lancia l'orchestratore dopo i fix della review. Nessuna variabile d'ambiente nuova, nessuna dipendenza nuova, nessuna migrazione né seeder.
- **Fonte:** ogni nome e valore è copiato dal codice (`src/schema.gql`, `src/gameRules/game-rule.exception.ts`, `src/characters/items/item-use.plan.ts`, `src/quests/outcomes/injuries/heal-no-effect.ts`). **Il codice vince su questo documento.**

---

## 0. TL;DR per il FE

1. **SDL solo additivo:** tre tipi nuovi (`QuestCure`, `LootRecovery`, `UseItemResult`), sei campi nuovi, una mutation nuova (`useItem`). Nessun campo esistente cambia.
2. **La cura è un premio esplicito della quest** (`prizes.cure`), non più una regola del tipo `heal`: una quest vinta che porta `cure` cura (qualunque tipo), una heal senza `cure` non cura nulla.
3. **`QuestResult.injuriesHealed`** sul foglio d'esito accanto a `hpBefore` / `hpAfter`: le ferite tolte.
4. **Pozioni dal Diario** con `useItem(itemId)` sul personaggio corrente del bearer; **ricarica globale** su `CharacterStatus.potionRecoveryUntil`; rifiuto `POTION_RECOVERING` con `extensions.recoveryUntil`.
5. **Heal senza effetto:** `Quest.noEffect` (per viewer) per il foglio strappato e `QUEST_NO_EFFECT` su `acceptQuest`.
6. **Il contenuto a DB arriva DOPO la merge** (166 heal per taglia, `recovery` delle 28 pozioni, lore «Il limite del corpo»): fino ad allora le heal non curano e nessuna pozione è bevibile. Vedi la **finestra operativa** al §3 e: merge e contenuto vanno applicati vicini, per questo la PR resta in draft.

---

## 1. Contratto

### 1.1 Tipi nuovi (verbatim da `src/schema.gql`)

```graphql
type QuestCure {
  canHeal: [InjuryType!]!
  lifePointsShare: Float!
}
```

```graphql
type LootRecovery {
  time: Int!
  turns: Int!
}
```

```graphql
type UseItemResult {
  hpAfter: Int!
  hpBefore: Int!
  injuriesHealed: [InjuryType!]!
  loreUnlocked: [Lore!]!
  quantityLeft: Int!
  recoveryUntil: DateTime!
}
```

### 1.2 Righe nuove sui tipi esistenti (verbatim, gli altri campi invariati)

```graphql
type QuestPrizes {
  cure: QuestCure
}

type QuestResult {
  injuriesHealed: [InjuryType!]!
}

type LootItem {
  recovery: LootRecovery
  relatedLore: [Lore!]!
}

type CharacterStatus {
  potionRecoveryUntil: DateTime
}

type Quest {
  noEffect: Boolean!
}

type Mutation {
  useItem(itemId: ID!): UseItemResult!
}
```

`QuestCureInput` e `LootRecoveryInput` esistono come classi di input (in `QuestPrizesInput` e `LootItemInput`) ma **non sono nello SDL** (D-24: quegli input non hanno superficie GraphQL). I codici d'errore non sono nello SDL: viaggiano in `extensions.code`.

### 1.3 Codici di rifiuto (`extensions.code`)

`useItem`, nell'ordine di D-17 (vince il primo che scatta):

| # | Codice | Messaggio | Quando |
|---|--------|-----------|--------|
| 1 | `AWAITING_AID` | «Il tuo personaggio è in attesa di soccorso» | il personaggio corrente è in attesa di soccorso |
| 2 | `ITEM_NOT_OWNED` | «Oggetto non posseduto» | nessuna pila dell'oggetto o quantità 0 (anche: scrittura condizionale non applicata, caso quasi irraggiungibile) |
| 3 | `ITEM_NOT_USABLE` | «Questo oggetto non si può usare» | `effect` diverso da heal, `recovery` assente o `recovery.time` non intero in (0, 2 147 483 647], oggetto assente dal catalogo |
| 4 | `POTION_RECOVERING` | «Il tuo corpo non reggerebbe un'altra pozione: aspetta che la prima si sia posata» | `potionRecoveryUntil` nel futuro rispetto all'ora del BE; porta `extensions.recoveryUntil` |
| 5 | `ITEM_NO_EFFECT` | «Questa pozione non ti farebbe nulla adesso» | l'esito pianificato non cambia nulla (HP invariati e nessuna ferita guarita): nessun consumo, nessuna ricarica |

Fuori dall'ordine delle regole:

| Codice | Messaggio | Quando |
|--------|-----------|--------|
| `BAD_USER_INPUT` | «Input non valido: itemId» | `itemId` non è un ObjectId (pipe sull'argomento, prima di ogni lettura) |
| `NOT_FOUND` | «Personaggio non trovato» | il bearer non ha un personaggio corrente attivo |
| `UNAUTHENTICATED` | (guard globale) | `useItem` senza bearer |
| `QUEST_NO_EFFECT` | «Queste cure non ti servirebbero adesso» | **`acceptQuest`** di una `heal` senza effetto per il personaggio (dopo i controlli di eleggibilità, prima di ogni scrittura: nessuna corsia, nessun punto, nessun viaggio) |

Ogni rifiuto di regola (i cinque di `useItem` e `QUEST_NO_EFFECT`): `data` null, `errors[0].message` come in tabella, `errors[0].extensions` = `{ code }` (più `recoveryUntil` solo per `POTION_RECOVERING`). La FE mostra la propria copia (FE `18-REPO-RULES.md`), il messaggio del BE è di riserva.

### 1.4 `extensions.recoveryUntil`

Stringa ISO 8601 (UTC, millisecondi) della fine della ricarica, **solo** con `POTION_RECOVERING`, **anche in produzione** (allowlist della sola chiave in `src/graphql/format-domain-error.ts` e `src/graphql/production-errors.ts`, legata al codice). Esempio:

```json
{
  "data": null,
  "errors": [
    {
      "message": "Il tuo corpo non reggerebbe un'altra pozione: aspetta che la prima si sia posata",
      "path": ["useItem"],
      "extensions": {
        "code": "POTION_RECOVERING",
        "recoveryUntil": "2026-11-10T15:30:00.000Z"
      }
    }
  ]
}
```

### 1.5 Semantica

- **`lifePointsShare` è un tetto**, non un incremento: la quest vinta porta `currentLifePoints` almeno a `round(maxLifePoints × quota)`, mai sopra il massimo né sotto il valore corrente; il massimo usato è quello **dopo** la progressione dello stesso esito (D-02). Quota 0 = cura solo ferite. Una quota letta dal DB non finita o fuori da [0, 1] vale 0 (fail-safe D-23, mai 1). **Sul filo `QuestPrizes.cure` arriva già come la legge il server** (review A-WR-01): quota mancante o fuori scala = 0, ferite fuori dall'enum scartate da `canHeal`, cura che non è un oggetto = `null`; un documento scritto male non produce mai `errors` su `quests`, `quest(id)` o `questUpdated`.
- **Ordine dell'esito (D-20):** combattimento → ferite nuove → progressione → cura. `injuriesAdded` resta la lista del combattimento; `injuriesHealed` elenca tutte le ferite tolte, comprese quelle appena prese. Una ferita presa e guarita nello stesso esito non resta su `status.injuries`. Una ferita fuori da `canHeal` resta: si può uscire dal tempio ancora feriti.
- **Chi cura (D-07):** ogni quest vinta (`success` o `gmCompleted`) che porta `cure`, qualunque `infos.type`; la sconfitta non cura. L'override del GM entra come combattimento e la cura si applica sopra. La quest `aid` clonata non eredita `cure`.
- **Le heal restano gratuite (D-06):** `pointsCostOf` invariata, corsia standard a costo zero.
- **`LootRecovery.time`** in millisecondi (stesso significato di `Spell.recoveryTime`); **`turns` è solo dato** per il motore di combattimento (D-16): il combattimento non legge né scrive `potionRecoveryUntil`.
- **`potionRecoveryUntil`** null = nessuna ricarica. Il conto alla rovescia è della FE; il giudice è il BE (al millisecondo esatto della fine si beve di nuovo).
- **`useItem`** agisce sul personaggio corrente del bearer, oste compreso (D-21: niente id del personaggio nell'argomento, nessun bypass di ruolo); consentita in città e **in viaggio**. HP = min(massimo, HP + `power`), **mai sotto il valore corrente** (review B-IN-01: una vita già oltre il massimo resta com'è, la bevuta cura solo le ferite; senza ferite curabili `ITEM_NO_EFFECT`); ferite in `canHeal` tolte; una unità in meno (pila rimossa a 0); `potionRecoveryUntil` = ora + `recovery.time`; le `relatedLore` dell'oggetto aggiunte a `status.unlockedLore`. Una transazione con snapshot in sessione e **una sola** scrittura (D-22): di due bevute parallele una scrive, l'altra riceve `POTION_RECOVERING`. La scrittura ripete ciò che il piano ha letto (review B-WR-01): un personaggio legacy senza `status.injuries` o con `potionRecoveryUntil` scritto come testo o numero beve normalmente, mai un `ITEM_NOT_OWNED` perpetuo.
- **`loreUnlocked`** porta le sole lore **nuove** per il personaggio (vuota alla seconda bevuta della stessa famiglia di pozioni).
- **`characterUpdated`** viene riemesso dal change stream dopo la bevuta (nessuna pubblicazione a mano): la FE riceve vita, ferite, inventario e `potionRecoveryUntil` aggiornati per la stessa via di sempre.
- **`LootItem.relatedLore`** è filtrata per il viewer come `Enemy.relatedLore` / `City.relatedLore` (Phase 16 D-07): il giocatore vede le sole lore sbloccate, l'oste tutte, senza personaggio nulla. La FE non seleziona il campo. **N+1 dichiarato (T-18-21, accettato):** per l'oste ogni oggetto con lore visibili costa una query sulle lore (28 pozioni oggi), solo se il campo è selezionato; nessuna memo per richiesta.
- **`Quest.noEffect`** è vero solo per una `heal` senza effetto per il personaggio corrente del bearer (vita già pari o sopra il tetto della quest E nessuna ferita in `canHeal`; una heal senza `cure` non ha effetto per nessuno); falso per ogni altro tipo (una `story` o una `job` con `cure` resta sempre accettabile) e senza personaggio corrente; **nessuna eccezione di ruolo**: l'oste che gioca con un proprio personaggio riceve lo stesso valore di chiunque, coerente con `acceptQuest`. Risolto per il singolo subscriber anche su `questUpdated` (mai da una cache condivisa fra subscriber); un predicato unico (`healHasNoEffect`) per il campo e per il rifiuto.
- `noEffect` è una fotografia alla lettura: la FE rilegge il tabellone su `characterUpdated` quando cambiano vita o ferite; il giudice resta `acceptQuest`.
- La regola della heal senza effetto non tocca la risoluzione: una heal accettata quando aveva effetto e risolta quando non ne ha più si chiude come oggi.

---

## 2. Comportamenti provati

| Comportamento | Decisione | Spec |
|---------------|-----------|------|
| `cureInjuries`: insieme, ordine del personaggio, voci ignote ignorate, input intatti | D-08, D-13 | `src/quests/outcomes/injuries/cure-injuries.spec.ts` |
| `cureOf` sanificante (quota fuori scala = 0, mai 1) e tetto con clamp | D-02, D-23 | `src/quests/outcomes/injuries/quest-cure.spec.ts` |
| Schema della cura validato su `create`, input fuori dallo SDL, aid senza cura | D-01, D-09, D-23, D-24 | `src/models/quest/quest-prizes.schema.spec.ts`, `src/quests/outcomes/aid/aid-quest.spec.ts` |
| `injuriesHealed` su modello e risultato (default vuoto) | D-08 | `src/models/quest-result/quest-result.schema.spec.ts` |
| `recovery` interi in [0, 2 147 483 647], `relatedLore` ref | D-15, D-19 | `src/models/loot-item.model.spec.ts` |
| `potionRecoveryUntil` data nullable, fuori da ogni input | D-15 | `src/models/character/character-status.schema.spec.ts` |
| Piano d'esito: cura da `prizes.cure` dopo combattimento e progressione, nulla su sconfitta, tipo indifferente | D-02, D-07, D-20 | `src/quests/outcomes/outcome-plan.spec.ts` |
| Heal di villaggio risolta (una ferita tolta, HP al 50 %), cura sopra l'override del GM | D-02, D-07, D-08 | `src/quests/outcomes/quest-resolution.service.int-spec.ts`, `src/quests/outcomes/gm-completion.service.int-spec.ts` |
| `injuriesHealed` sul filo del foglio, legacy → lista vuota | D-08 | `src/quests/results/quest-result.resolver.int-spec.ts` |
| `LootItem.relatedLore` per viewer (giocatore, oste, senza personaggio, orfani) | D-19 | `src/lore/lore-related.int-spec.ts` |
| Codici, factory ed `extensions.recoveryUntil` anche in produzione | D-17 | `src/gameRules/game-rule.exception.spec.ts`, `src/graphql/format-domain-error.spec.ts`, `src/graphql/production-errors.spec.ts`, `src/graphql/production-surface.int-spec.ts` |
| Piano della bevuta: cinque rifiuti in ordine, confine al millisecondo, nessun effetto sull'esito pianificato, vita mai abbassata, filtro sui valori letti, ricarica oltre l'Int GraphQL non bevibile | D-02, D-15, D-17, D-22, D-23 | `src/characters/items/item-use.plan.spec.ts` |
| `useItem` sul filo: solo il personaggio del bearer (oste compreso), rifiuti senza scrittura, ricarica, lore alla prima bevuta, viaggio consentito, `BAD_USER_INPUT`, `NOT_FOUND` | D-15, D-17, D-19, D-21, D-23 | `src/characters/items/use-item.int-spec.ts` |
| Una scrittura in transazione, due bevute parallele, scrittura concorrente fra snapshot e scrittura non persa (ritentativo provato), legacy senza ferite e ricarica testo o numero bevibili | D-22, D-23 | `src/characters/items/item-use.service.int-spec.ts` |
| Predicato della heal senza effetto | D-25 | `src/quests/outcomes/injuries/heal-no-effect.spec.ts` |
| `acceptQuest` rifiuta la heal senza effetto prima di ogni scrittura, sul servizio e sul filo; rifiuto e `Quest.noEffect` danno lo stesso verdetto sugli stessi fatti, legacy senza vita, massimo o xp compresi | D-25 | `src/quests/acceptance/quest-acceptance.service.int-spec.ts`, `src/quests/acceptance/accept-quest.resolver.int-spec.ts` |
| `Quest.noEffect` per viewer sulle query, per subscriber su `questUpdated` (anche quando fra due eventi cambia solo la vita), letture dei vitali del viewer | D-25 | `src/quests/quests.resolver.int-spec.ts`, `src/quests/quest-updated.subscription.int-spec.ts`, `src/quests/no-effect/viewer-vitals.service.spec.ts` |
| `QuestPrizes.cure` sul filo sanificata come la legge il server (quota mancante o fuori scala, ferita ignota), nessun `errors` | D-01, D-23 | `src/quests/quests.resolver.int-spec.ts` |
| `POTION_RECOVERING` con `recoveryUntil` anche su graphql-ws, in produzione e fuori | D-17 | `src/graphql/production-surface.int-spec.ts` |
| SDL additivo, `useItem` senza bearer → `UNAUTHENTICATED` | D-09, D-21 | `test/app.int-spec.ts` |

Limiti noti, accettati nella review (B-IN-05): un id di `relatedLore` che punta a una lore cancellata entra comunque in `status.unlockedLore` ed è innocuo (la visibilità filtra per esistenza, come per ogni altra lore), quindi `loreUnlocked` può essere più corta della lista scritta. Le lore del risultato si leggono dopo il commit con una sola lettura idempotente: se fallisse, il client riceve un errore a bevuta avvenuta, riprova e ottiene `POTION_RECOVERING` con lo stato già aggiornato da `characterUpdated`.

---

## 3. Note per la UAT

### a) Tre heal d'esempio, una per taglia

Forma attesa di `prizes.cure` e `infos.timeToComplete` **dopo** lo script di contenuto (D-02, D-03, D-05); gli id reali li scrive qui l'orchestratore dopo l'applicazione.

| Taglia | Quest | `lifePointsShare` | `canHeal` | `timeToComplete` |
|--------|-------|-------------------|-----------|------------------|
| villaggio | `<questId>` | 0,5 | le 19 ferite con gravità ≤ 20 (più i ritocchi di D-04 per tipo di villaggio) | 7 200 000 ms (2 h) |
| città | `<questId>` | 0,8 | le 28 ferite con gravità ≤ 40 (più i ritocchi di D-04 per le città di mare) | 18 000 000 ms (5 h) |
| capitale | `<questId>` | 1 | tutte e 37 | 28 800 000 ms (8 h) |

Prove suggerite: personaggio ferito con una ferita dentro e una fuori dalla lista del villaggio → una sola tolta, HP al 50 %; stesso personaggio a vita piena e senza ferite curabili → foglio strappato (`noEffect` vero) e `QUEST_NO_EFFECT` se si forza l'accettazione.

### b) Identità di test

Bypass dev con un `<twitchId di test>` distinto da quello reale, un solo processo BE. Il personaggio ferito, la pila di pozioni (`<itemId>`) e lo stato della ricarica li prepara l'orchestratore con script di sola scrittura mirata (lo stesso documento che scriverebbe il BE); nessun valore reale del database in questo file.

### c) Runbook dei tre script di contenuto dell'orchestratore

Fuori repo (D-14, D-36): qui solo i passi, mai il sorgente. Ordine comune a ogni script:

1. file di revisione approvato dall'utente;
2. backup della collection toccata;
3. prova a secco che stampa i conteggi attesi;
4. applicazione **dopo la merge e il riavvio del BE** dal codice nuovo;
5. verifica dei conteggi a DB;
6. risultato riportato qui (conteggi e id delle tre heal d'esempio, `<loreId>` della lore).

| Script | Cosa scrive | Conteggi della prova a secco |
|--------|-------------|------------------------------|
| 1. cura delle heal per taglia | `prizes.cure` delle 166 heal (liste per taglia di D-03 con i ritocchi di D-04), `infos.timeToComplete` di D-05, `infos.description` per taglia di D-10 | 98 villaggi / 59 città / 9 capitali |
| 2. ricarica delle pozioni | `recovery { time, turns }` delle 28 pozioni heal dalla tabella di D-18 | 28 pozioni |
| 3. lore del limite del corpo | lore «Il limite del corpo» di tipo `knowledge` e `relatedLore` delle 28 pozioni verso di essa | 1 lore, 28 collegamenti |

Regole di forma (RESEARCH Pitfall 2 e 3; Mongoose non valida gli update e gli script usano il driver nativo, i lettori del BE sanificano ma un errore di forma diventa «nessuna cura» o «pozione non bevibile»):

- id come `ObjectId` veri (in `relatedLore` e negli id dei documenti), mai stringhe;
- `lifePointsShare` numero fra 0 e 1 (estremi compresi; fuori scala il BE la legge 0 anche sul filo);
- `recovery.time` intero in (0, 2^31 − 1] e `recovery.turns` intero in [0, 2^31 − 1], entrambi presenti (review B-WR-02): un `time` fuori scala rende la pozione non bevibile (`ITEM_NOT_USABLE`), ma `LootItem.recovery` **non è sanificata sul filo**, quindi un valore oltre 2^31 − 1 scritto col driver nativo rompe la serializzazione di ogni lista che seleziona `recovery` (inventario, negozio, premi): lo script deve validarlo prima di scrivere;
- `canHeal` con i soli nomi dell'enum `InjuryType` (un nome ignoto viene scartato in lettura).

### d) Tabella dei tempi D-18

Scala: 30 min / 45 min / 1 h / 1 h 30 / 2 h / 3 h / 4 h / 6 h / 8 h / 10 h / 12 h / 16 h / 20 h / 24 h.

| Potenza | Base |
|---------|------|
| ≤ 500 | 30 min |
| 800–1000 | 45 min |
| 1200–1500 | 1 h |
| 2000–2500 | 1 h 30 |
| 3000 | 2 h |
| 4000 | 3 h |
| 5000–6000 | 4 h |
| 8000 | 6 h |
| 10 000 | 8 h |
| 15 000 | 10 h |
| 20 000 | 12 h |
| 25 000 | 16 h |
| 40 000 | 24 h |

Uno scalino in più per rare e ultrarare. Minimi per la ferita più grave curata: fratture e lussazioni ≥ 2 h; infezione, veleno, commozione, polmone, emorragia interna ≥ 1 h 30; trauma cranico e cecità ≥ 4 h; paralisi e lesione spinale ≥ 8 h; parti mancanti ≥ 12 h. Valori per pozione nel file di revisione; `turns` bozza decisa dall'utente. «La mano vince»: ritocchi a mano ammessi.

### e) Finestra operativa fra merge e contenuto

**Fra la merge (e il riavvio del BE) e l'applicazione degli script, il codice nuovo gira su contenuto vecchio:**

- le heal a DB non hanno `cure`: **non curano nulla**, `Quest.noEffect` è **vero per tutti** i personaggi e **`acceptQuest` le rifiuta tutte con `QUEST_NO_EFFECT`** («Queste cure non ti servirebbero adesso»);
- le pozioni non hanno `recovery`: **nessuna pozione è bevibile**, `useItem` risponde `ITEM_NOT_USABLE` («Questo oggetto non si può usare»);
- le heal **accettate prima della merge** si risolvono sul codice nuovo e non curano nulla (nessuna `cure` a DB);
- una build FE vecchia riceve `QUEST_NO_EFFECT`, che non conosce, e mostra l'avviso generico.

È il fail-safe voluto (un buco di contenuto non regala mai una cura), ma è una regressione visibile del gioco: **merge → riavvio → script vanno applicati vicini**. Per questo la PR resta in draft finché l'orchestratore non è pronto ad applicare gli script subito dopo la merge e il riavvio del BE.

---

## 4. Domande aperte e deviazioni

- **Requisiti:** BE-HEAL-01, 02, 04, 05, 06, 07, 09 chiusi dal codice. **BE-HEAL-03 e BE-HEAL-08 restano aperti** fino all'applicazione degli script di contenuto a DB dopo la merge (§3 c).
- **Ordine dello SDL:** i campi sono in ordine alfabetico nei blocchi rigenerati (`cure` primo in `QuestPrizes`, `noEffect` fra `infos` e `prizes`, `useItem` fra `unregisterPushDevice` e `useSpell`).
- **Casi verdi al primo colpo (annotati nei SUMMARY):** i pin della transazione di `useItem` (18-08, già scritta nel task precedente), i casi per subscriber di `Quest.noEffect` (18-10, memo già corretta), i casi di assenza scritti prima del codice; il boot reale non è osservabile rosso per i campi aggiunti (rigenera e legge lo SDL nella stessa esecuzione).
- **Fixture:** nessuna fixture esistente accettava una heal nuda: nessuna ha dovuto ricevere una cura; `buildQuestResult` porta `injuriesHealed: []`.
- **Coverage delle cartelle nuove** (senza soglia in `package.json`): `src/characters/items`, `src/quests/no-effect`, `src/quests/outcomes/injuries` insieme 99,62 / 87,34 / 100 (statements / branches / lines) dopo la spec di `ViewerVitalsService` aggiunta dal gate; i rami scoperti residui sono i metadati dei decoratori Nest.
- **N+1 dell'oste su `LootItem.relatedLore`** (T-18-21): accettato e dichiarato al §1.5; una memo per richiesta resta possibile in futuro se la FE selezionasse il campo.
- Nessuna domanda aperta per la FE.
