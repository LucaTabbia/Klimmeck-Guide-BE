---
phase: quick-261110-cgd
plan: 01
subsystem: quests
tags: [crime, guard, prison, arrest, encounter, outcome, game-rules]
key-files:
  created:
    - src/characters/imprisonment/imprisonment.ts
    - src/quests/outcomes/unrewarded-plan.ts
    - src/quests/outcomes/crime/crime-arrest.ts
    - src/quests/outcomes/guard/guard-encounter.ts
    - src/quests/outcomes/guard/guard-outcome.ts
    - src/quests/outcomes/conclusion/conclusion-event.ts
    - src/quests/outcomes/conclusion/conclusion-event.drawer.ts
    - src/quests/outcomes/conclusion/conclusion-plan.ts
    - src/quests/outcomes/crime-guard-conclusion.int-spec.ts
    - test/quests/unrewarded-plan-input.ts
  modified:
    - src/gameRules/game-rule-error-code.enum.ts
    - src/gameRules/game-rule.exception.ts
    - src/graphql/format-domain-error.ts
    - src/graphql/production-errors.ts
    - src/models/character/character-status.model.ts
    - src/models/quest-result/quest-result.model.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/rescue-plan.ts
    - src/quests/outcomes/quest-resolution.service.ts
    - src/quests/outcomes/quest-outcomes.module.ts
    - src/quests/generation/quest-composition.ts
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/travel/travel-rules.ts
    - src/travel/travel-planner.service.ts
    - src/travel/travel.service.ts
    - src/economy/trade/shop-transaction.service.ts
    - src/economy/economy.module.ts
    - src/schema.gql
    - test/app.int-spec.ts
    - test/quests/quest-result.fixture.ts
commits:
  - { hash: 8d06bf68, message: "test(game-rules): expect the prison refusal and its release instant" }
  - { hash: cf169431, message: "feat(game-rules): refuse imprisoned characters with their release instant" }
  - { hash: 15905d3e, message: "test(models): expect the prison date and the arrest and guard result fields" }
  - { hash: 2da7afdc, message: "feat(models): add the prison date and the arrest and guard result fields" }
  - { hash: 4a711c5a, message: "test(characters): expect prison to block quests, travel and the shop" }
  - { hash: c12291bc, message: "feat(characters): block quests, travel and the shop while imprisoned" }
  - { hash: 44a5d107, message: "refactor(quests): drop the unused unclaimed snapshot import" }
  - { hash: 0b42f6bb, message: "test(outcomes): expect the guard encounter enemy or small pack draw" }
  - { hash: be232c23, message: "feat(outcomes): draw the guard encounter from city and anywhere enemies" }
  - { hash: a5e5f326, message: "test(outcomes): expect the arrest and guard defeat plans without prizes" }
  - { hash: bdcd901f, message: "feat(outcomes): plan the arrest and the guard defeat without prizes" }
  - { hash: 1da233fd, message: "test(outcomes): expect the crime arrest and guard encounter conclusions" }
  - { hash: 6c4e28f4, message: "feat(outcomes): arrest crimes and fight guard encounters at conclusion" }
---

# Quick 261110-cgd: arresto nelle crime, scontro nelle guard

## Parole dell'utente (2026-11-10)

- «Le quest study e crime non hanno grado di entrata, possono farlo tutti. Le quest crime fanno guadagnare bene, con poco tempo di attesa, ma quando accetti una quest crime hai una probabilità del 20% di venire arrestato. Questo mette il personaggio in fase di attesa, con segnalino sopra la pedina "In prigione" per 10 ore. Le quest guard hanno tutte come rango di ingresso paladin e hanno una percentuale del 20% di farti scontrare contro un nemico casuale che sia presente nelle city o all. In caso di sconfitta resti con 1 di vita in città (niente attesa di soccorso, come per le imboscate), in caso di vittoria ottieni il doppio del denaro dato dalla quest e l'xp del nemico.»
- Risposte alle domande dell'orchestratore: il tiro dell'arresto avviene **alla conclusione** della quest; se arrestato **niente premio** (né monete né xp né loot) e partono 10 ore di prigione. La prigione blocca **tutto, come l'attesa di soccorso** (niente quest, niente viaggio, niente negozio; pozioni e Diario restano), con scadenza certa e senza quest di aid. Il nemico della guard: **fascia per livello come nelle imboscate**, fra i non leggendari con `locations` che contiene `city` o `all`. Tutto dentro la fase 18.
- Emendamento (2026-11-10): «Se per il livello del personaggio non c'è un nemico in fascia allora si possono mettere 2 o 3 nemici fino a raggiungere la fascia prendendo da fasce più basse, come succede anche nella generazione di quest. Quando finisci in prigione perdi anche il 25% delle tue monete. Le job anche devono essere tutte rookie»

## Decisioni

1. **Arresto (crime).** Alla risoluzione automatica di una `crime` vinta un tiro di `ChanceSource` con `CRIME_ARREST_CHANCE = 0.2` (`src/quests/outcomes/crime/crime-arrest.ts`). Arrestato: esito `failure` senza alcun premio (monete, xp, oggetti, pet, magia, lore, `completedQuests`), corsia standard liberata, effetti di un eventuale combattimento della quest tenuti (vita, ferite, consumi, magie), `status.imprisonedUntil = conclusione + CRIME_PRISON_MS` (10 ore) e multa di `CRIME_ARREST_COIN_LOSS_SHARE = 0.25` sul borsellino (rame totale con `toCopper`, per difetto, riconvertito con `fromCopper`; borsellino vuoto = nessuna perdita) nella stessa transazione e nello stesso update condizionale dell'esito; la multa passa dal `WalletService` come ogni altro saldo. I punti canale non si toccano. Nessuna aid, nessuna attesa di soccorso. Una crime **persa in combattimento** resta la sconfitta di sempre (aid): l'arresto vale solo sulla quest vinta.
2. **Prigione.** `CharacterStatus.imprisonedUntil: DateTime` (nullable, default null; `src/characters/imprisonment/imprisonment.ts`). Nessuno sweep: libero quando la data è null, assente o non più futura rispetto all'orologio iniettato. Codice nuovo `CHARACTER_IMPRISONED` con `extensions.imprisonedUntil` (ISO), stesso percorso di `POTION_RECOVERING` (allowlist della sola chiave legata al codice in `format-domain-error.ts` e `production-errors.ts`). Affiancato a **ogni** punto in cui oggi rifiuta l'attesa di soccorso: `acceptQuest` (pre-verifica, guardia nel filtro del claim, classificazione della corsa), `startTravel` e `travelPreview` (fatto di `classifyFreeTravel`, guardia nel filtro della partenza, classificazione della corsa), `doTransaction` (negozio, compra, vendi e scambio vuoto; guardia nel filtro della scrittura). `useItem` **non** è bloccato (lo è dall'attesa di soccorso, non dalla prigione: «pozioni e Diario restano»). Il teleport del GM non è bloccato, come non lo è dall'attesa di soccorso (D-07). Il tabellone non espone alcuna disponibilità lato server per l'attesa di soccorso: nulla da affiancare. Il prigioniero non ha `awaitingAid`, quindi non genera aid e non compare fra i feriti.
3. **Esito visibile.** `QuestResult.arrested: Boolean!` (default false) e `QuestResult.coinsLost: Coins` (nullable, valorizzato solo all'arresto, anche `{0,0,0}` col borsellino vuoto). Push: invariato, parte il `questEnd` di ogni quest conclusa; il payload non porta un esito (solo l'id del risultato), quindi nessuna scelta da fare.
4. **Scontro (guard).** Alla risoluzione automatica di una `guard` vinta un tiro `GUARD_ENCOUNTER_CHANCE = 0.2`; se scatta, `composeGuardEncounter` (`src/quests/outcomes/guard/guard-encounter.ts`): pool dei non leggendari con `city` o `all` (animali compresi, come nelle imboscate), fascia [Facile, Medio] del livello di `xpBandOf` (la stessa delle imboscate), prima **un nemico singolo** in fascia, altrimenti **un branco di 2 o 3** nemici più deboli fino a rientrare in fascia con la logica dei branchi della generazione (`packForm` di `src/quests/generation/quest-composition.ts`, estratta con il tetto delle unità come parametro: `composeSingleThenPack`; il generatore resta identico, stessa sequenza di tiri). Nessun singolo né branco in fascia, o catalogo vuoto: nessuno scontro, esito normale. Tiri, pool e catalogo dello scontro sono letti **prima** della transazione (`ConclusionEventDrawer`), il combattimento passa dalla porta `CombatResolver` dentro il callback partendo da vita e ferite lasciate dal combattimento della quest.
   - **Vittoria:** `planCombatant` di sempre con `prizeCoins` raddoppiate (tutte e tre le monete) e il catalogo dei nemici della quest più quelli dello scontro: xp = `xpPrize` + xp di tutti i nemici battuti con `enemyFactsOf` (il campo `Enemy.xp` a DB è già in scala, nessuna moltiplicazione nuova), conoscenze di vittoria (`victoryKnowledgeOf`) anche sui nemici dello scontro; loot, lore e cura della quest invariati; `guardEncounter: true`.
   - **Sconfitta:** vita a **1** (`MIN_LIFE_POINTS`), il personaggio resta dov'è (in città), nessuna attesa di soccorso né aid, nessun premio, `guardEncounter: true`, esito `failure`. Ferite: quelle del combattimento (`woundsAfter`), consumi e magie scalati: esattamente ciò che fa la sconfitta in imboscata. **Differenza dall'imboscata:** l'imboscata non forza la vita a 1 (tiene quella del combattimento, che è ≥ 1); la guard la porta a 1 per le parole dell'utente.
   - Report: i nemici dello scontro stanno in `QuestResult.enemies` (forma multi-nemico già esistente, `{ enemy, quantity }`); campo additivo minimo `QuestResult.guardEncounter: Boolean!` (default false) per distinguere lo scontro e la sconfitta senza aid.
5. **Ranghi.** La generazione automatica produce solo `enemy` e `boss` (`GeneratedQuestType`; già fissato da un test della quick 261110-mag): `crime`, `study`, `job` e `guard` non sono mai generate, **nessun codice**. I ranghi sono dati a DB (sezione sotto). Il rango più basso «per tutti» è `rookie` (oppure `minTitle` assente: `meetsTitle` accetta entrambi).
6. Nessuna migrazione, nessun file di contenuto, nessuna variabile d'ambiente, nessuna scrittura sul DB reale.

## Contratto (additivo)

```graphql
type CharacterStatus {
  imprisonedUntil: DateTime
}
type QuestResult {
  arrested: Boolean!
  coinsLost: Coins
  guardEncounter: Boolean!
}
```

Dettaglio dei valori nei tre casi e delle mutation in `.planning/phases/18-quest-heal-per-taglia/BACKEND-NOTES.md` §1.6.

## File toccati

- Prigione: `src/characters/imprisonment/imprisonment.ts` (costante, lettura, rifiuto, guardia delle scritture), codice e factory in `src/gameRules/`, allowlist in `src/graphql/`.
- Modelli: `character-status.model.ts`, `quest-result.model.ts`; `QuestResultDraft` guadagna `arrested`, `coinsLost`, `guardEncounter` (piano d'esito, soccorso, fixture e spec di forma aggiornati nello stesso commit per `tsc`).
- Blocchi: `quest-acceptance.service.ts`, `travel-rules.ts`, `travel-planner.service.ts`, `travel.service.ts`, `shop-transaction.service.ts` (+ `Clock` in `EconomyModule`, come negli altri moduli).
- Esiti: `unrewarded-plan.ts` (esito senza premio e senza soccorso, compone gli helper di `outcome-plan.ts` come l'imboscata; `participantFilter` esportato), `crime/crime-arrest.ts`, `guard/guard-encounter.ts`, `guard/guard-outcome.ts`, `conclusion/` (evento, drawer iniettabile, piano puro), `quest-resolution.service.ts`, `quest-outcomes.module.ts`; `quest-composition.ts` (estrazione del branco col tetto delle unità).
- Test: `crime-arrest.spec.ts`, `guard-encounter.spec.ts`, `guard-outcome.spec.ts`, `imprisonment.spec.ts`, `crime-guard-conclusion.int-spec.ts`, casi nuovi nelle spec di eccezioni, formatter, produzione, schema, regole di viaggio, pianificazione del viaggio, accettazione, negozio, `useItem`; helper `test/quests/unrewarded-plan-input.ts`.

## RED osservati

- Eccezione e formatter (`8d06bf68`): `Test Suites: 4 failed · Tests: 5 failed, 96 passed` (modulo `imprisonment` assente, factory e allowlist mancanti).
- Modelli (`15905d3e`): unit `Tests: 4 failed, 19 passed`; boot reale `Tests: 2 failed, 82 passed` (blocchi `CharacterStatus` e `QuestResult` dello SDL).
- Blocchi (`4a711c5a`): unit `classifyFreeTravel` 2 rossi; integration `Tests: 4 failed, 222 passed` (accettazione ×2, negozio, viaggio). Verdi al primo colpo, con motivo: «drinks while imprisoned» (`useItem` non legge la prigione), «accepts a quest once the prison has ended», «plans the travel … ended», «trades once the prison has ended» (casi di confine senza guardia ancora presente).
- Composizione (`0b42f6bb`): suite rossa (modulo assente).
- Piani (`a5e5f326`): due suite rosse (moduli assenti).
- Conclusione (`1da233fd`): `Tests: 4 failed, 5 passed` (arresto: `imprisonedUntil` null; vittoria e branco: nessun contesto di scontro; sconfitta: vita 1000). Verdi al primo colpo, con motivo: crime senza arresto, crime persa con aid, job senza tiro, guard senza scontro, guard senza nemico in fascia (descrivono il comportamento di oggi, restano come guardia).

## Gate

- `npx tsc --noEmit -p tsconfig.json`: 0.
- `npx jest --selectProjects unit`: 258 suite / 3295 test verdi (prima 254 / 3246: +4 suite, +49 test).
- `npx jest src/quests --selectProjects integration --runInBand`: 35 suite / 498 test verdi (prima 34 / 486: +1 suite, +12 test).
- Boot reale `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 84/84; `git diff --exit-code src/schema.gql` pulito (lo schema rigenerato è nel commit `2da7afdc`, solo righe aggiunte).
- Altre cartelle toccate: `npx jest src/travel src/economy src/characters src/graphql src/models --selectProjects integration --runInBand`: 38 suite / 696 test verdi.
- `npx prettier --write` e `npx eslint` sui file toccati: puliti. Subject fra 59 e 75 byte (due oltre il tetto, vedi Deviazioni), nessun trailer. `pgrep -fl 'bin/jest'` vuoto.

## Deviazioni

- **Vita a 1 nella sconfitta della guard:** il brief dice «come la sconfitta in imboscata: vita a 1», ma la sconfitta in imboscata non forza la vita a 1 (tiene quella del combattimento, ≥ 1). Applicate le parole dell'utente («resti con 1 di vita»): la guard porta la vita a 1; per il resto (ferite, consumi, nessuna aid) come l'imboscata.
- **Arresto solo sulla crime vinta:** una crime persa in combattimento apre l'aid come oggi, senza arresto (l'arresto toglie un premio che la sconfitta non dà). Lo stesso per lo scontro della guard: solo dopo una guard vinta.
- **Solo la risoluzione automatica individuale:** il completamento a mano del GM e i percorsi di gruppo/soccorso non tirano eventi (crime e guard sono individuali e non registrate).
- **Arresto = esito `failure`** senza `completedQuests` (crime ripetibili: nessun effetto sul tabellone).
- **Animali nel pool della guard:** compresi, come nelle imboscate; conta solo l'habitat `city`/`all`.
- **Il tiro precede la transazione:** arresto e scontro si tirano prima del callback (pool e catalogo sono letture), il combattimento dello scontro dentro il callback come quello della quest.
- **Commit `44a5d107`:** l'eslint del commit `c12291bc` segnalava un import rimasto inutilizzato (`UnclaimedSnapshot`), tolto con un commit `refactor` separato (mai amend).
- **Due subject oltre i 72 byte delle regole di fase:** `cf169431` (73) e `15905d3e` (75). Contati prima del commit ma non accorciati; non correggibili senza amend (vietato): restano come sono.
- **`doTransaction` rifiuta col codice nuovo:** l'attesa di soccorso nel negozio risponde `SHOP_NOT_IN_CITY`; la prigione risponde `CHARACTER_IMPRISONED`, come chiesto dal brief.

## Contenuto a DB (orchestratore, dopo la merge)

Collection `quests`, con i passi del runbook di `BACKEND-NOTES.md` §3 c (revisione, backup, prova a secco, applicazione dopo merge e riavvio, verifica):

1. tutte le `crime`, `study` e `job`: rango più basso, `requirements.minTitle: 'rookie'` (oggi crime 25 `adventurer` + 9 `paladin`; study già tutte `rookie`; job da contare nella prova a secco);
2. tutte le `guard`: `requirements.minTitle: 'paladin'` (oggi 59 `adventurer` + 9 `paladin`).

Prova a secco attesa: 34 crime aggiornate, 59 guard aggiornate, le job non `rookie` contate e aggiornate, 0 study.
