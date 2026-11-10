# Phase 18: Quest heal per taglia - Research

**Researched:** 2026-11-10
**Domain:** NestJS 11 + Mongoose 8.18.1 + Apollo code-first (`@nestjs/graphql` 13.2.0, graphql 16.11.0), Jest 30.1.3 su `MongoMemoryReplSet`. Cura delle quest come premio esplicito nel piano d'esito, pozioni bevute dal Diario con ricarica globale, `extensions.recoveryUntil` sul filo, lore filtrata per viewer su `LootItem`
**Confidence:** HIGH sul codice (tutto letto sul branch `feat/18-quest-heal-per-taglia`) e sui meccanismi (tre probe eseguite sull'harness più una prova additiva temporanea dei quattro modelli con 3 057 test unit e 1 172 test integration, file ripristinati e cancellati); MEDIUM su cinque punti di prodotto che il CONTEXT non copre alla lettera (Domande aperte 1–5)

## Summary

Nessuna libreria nuova, nessuna variabile d'ambiente, nessuna migrazione. Tutti i pezzi esistono: il piano d'esito è già un unico documento di update calcolato da uno snapshot in sessione (`planParticipant`), l'inventario ha già la «vendita senza incasso» (`applyTradeToInventory` + `soldQuantityGuards`, usata dal cibo del viaggio), la conoscenza ha già l'add-to-set con le sole novità (`knowledgeUpdateOf`), i filtri della lore per viewer vivono già sul tipo (`related-lore.resolvers.ts`), e `formatDomainError` ha già una allowlist di una chiave da estendere.

Otto fatti verificati che cambiano il modo di pianificare:

1. **`useItem(itemId: ID!)` non ha l'id del personaggio: `@OwnsCharacter` non si può applicare.** Il modello non è `equipItem` ma `deleteCharacter` (`src/characters/deletion/character-deletion.resolver.ts:13-17`): identità dal solo bearer, il servizio risolve `User.currentCharacter`. Conseguenza: la mutation **non entra** in `EXPECTED_OWNERSHIP_HANDLERS` e **non serve una riga nella matrice** (le liste nascono dai metadati `ROLES_KEY`/`OWNERSHIP_KEY`); serve invece il caso «rejects useItem without a bearer» nel blocco `global auth guard` di `test/app.int-spec.ts`. L'oste non ha bypass: beve solo per il proprio personaggio.
2. **D-17 alla lettera («filtro + update con `applyTradeToInventory`») richiede una transazione.** `applyTradeToInventory` produce l'intero array `assets.ownedItems`: scriverlo con un `updateOne` nudo perderebbe un acquisto concorrente di un altro oggetto, che nessuna guardia del filtro vede. Il pattern di casa è `connection.transaction` con lo snapshot letto in sessione e **una sola** scrittura condizionale (`ShopTransactionService.applyTrade`, `src/economy/trade/shop-transaction.service.ts:135-245`). Probe P3: due bevute parallele → una scrive, l'altra viene ritentata dal driver, rilegge e risponde `POTION_RECOVERING`.
3. **`extensions.recoveryUntil` oggi non arriva sul filo HTTP**, né in sviluppo né in produzione: `extensionsOf` (`src/graphql/format-domain-error.ts:48-51`) e `sanitizeFormattedError` (`src/graphql/production-errors.ts:24`) ricostruiscono `{ code }` più la sola `reason` di `SESSION_REVOKED`. Servono due modifiche gemelle e un costruttore di `GameRuleException` che accetti la chiave in più.
4. **`LootItemInput`, `QuestPrizesInput` e `QuestInput` non sono nello SDL**: nessuna mutation li referenzia (`grep` su `src/schema.gql`: 0 occorrenze). `QuestCureInput` e `LootRecoveryInput` saranno classi senza superficie sul filo: il boot reale **non** deve aspettarsi `input QuestCureInput`.
5. **Aggiungere i campi ai modelli rompe solo tre asserzioni**, tutte in `test/app.int-spec.ts` (righe 443, 564, 581). Prova additiva temporanea: unit 247 suite / 3 057 test verdi, integration `src/quests` 34 suite / 447 test verdi, integration di personaggi, negozi, lore, economia, modelli, harness 45 suite / 646 test verdi.
6. **`QuestResult.injuriesHealed` sul modello e sul draft vanno nello stesso commit**: con il campo obbligatorio sulla classe, `tsc` fallisce in `src/quests/results/quest-result.populate.ts:68` (`unpopulatedResultOf` spalma il draft) finché `QuestResultDraft` non lo porta.
7. **La validazione Mongoose non protegge il contenuto.** Probe P1: `create` rifiuta `lifePointsShare: 2` e una ferita ignota, `updateOne` senza `runValidators` li scrive entrambi; e lo script dell'orchestratore usa il driver nativo, che Mongoose non vede affatto. Il codice di lettura (`cureOf`, `recoveryOf`) deve sanificare da sé.
8. **`Spell.recoveryTime` è `Int!`** (`src/models/spell.model.ts:37-39`, `src/schema.gql:768`): `LootRecovery.time: Int!` è coerente e sicuro (massimo D-18 = 86 400 000, limite Int 2 147 483 647 ≈ 24,8 giorni).

Quattro punti di CONTEXT e REPO-RULES non reggono alla lettera (sezione Conflicts): «ownership come `equipItem`», «classificazione del fallimento» dopo la scrittura, «input admin» visibili, «riga nella matrice».

**Primary recommendation:**

- Due primitive pure in `src/quests/outcomes/injuries/`: `cureInjuries(injuries, canHeal)` e un lettore sanificante `cureOf(prizes?.cure)`; il tetto con `lifePointsWithin(max(hp, round(max × share)), max)` **dopo** `progressionAfter`.
- `planParticipant` sostituisce il ramo `healed` (righe 349–359) con la cura letta da `quest.prizes?.cure`; `QuestResultDraft.injuriesHealed` accanto a `injuriesAdded`.
- `useItem` in una cartella nuova `src/characters/items/`: piano puro `planItemUse(snapshot, item, now)` (rifiuti in ordine, filtro, update, risultato) più `ItemUseService` con `connection.transaction`, snapshot in sessione, un `updateOne`.
- `GameRuleException.potionRecovering(until)` con `extensions.recoveryUntil`, allowlist di una chiave per codice in `formatDomainError` e `sanitizeFormattedError`.
- `LootItemRelatedLoreResolver` in `src/lore/related-lore.resolvers.ts` che carica le lore visibili per id (i `LootItem` non arrivano mai con `relatedLore` popolata).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Modello e contratto (BE-HEAL-01)
- **D-01 (utente, «dovremmo separare i danni guariti dalle ferite guarite. Così un posto può guarire determinati tipi di ferite e altri un altro»):** `Quest.prizes.cure` è un sotto-documento nullable `{ lifePointsShare: Number (0..1), canHeal: [InjuryType] }` con `@Prop` e `@Field` (tipo GraphQL `QuestCure`, campo additivo `QuestPrizes.cure: QuestCure` nullable), anche in `QuestPrizesInput` (`cure: QuestCureInput`). `canHeal` riusa nome e semantica di `LootItem.canHeal` (quick 261109-inj): lista di `InjuryType` validata dall'enum Mongoose, default `[]`. `cure` assente o null = la quest non cura nulla: un errore di contenuto non regala mai una cura piena (fail-safe).
- **D-02 (utente, tetto 50 / 80 / 100 %):** `lifePointsShare` è un **tetto**, non un incremento: la quest vinta porta `currentLifePoints` almeno a `round(maxLifePoints × share)` e mai sopra il massimo né sotto il valore corrente (`max(hp, floor)`), con il clamp di `lifePointsWithin`. Valori di partenza per taglia: villaggio 0,5, città 0,8, capitale 1. Ripetere la heal di un villaggio non supera mai il 50%: per il pieno serve la città. Valore 0 = la quest cura solo ferite.
- **D-07 (default dichiarato nella domanda, accettato):** la cura si applica a **ogni quest vinta che porta `prizes.cure`**, qualunque sia `infos.type`: `planParticipant` sostituisce il ramo `healed = won && type === heal` con la lettura del campo; una `story` o una `job` con `cure` guariscono; una heal senza `cure` non guarisce. Il tipo `heal` resta per il foglio e per l'eleggibilità (ripetibile, senza registrazione, corsia standard).

#### Ferite e contenuto (BE-HEAL-02, BE-HEAL-03)
- **D-03 (utente, «≤20 / ≤40 / tutte»):** liste di partenza per taglia derivate dalla gravità delle ferite della FE (`InjuryType.severity`, 5–80; il BE non ha una tabella di gravità e non la avrà: le liste a DB sono la verità, la gravità serve solo allo script per abbozzarle): **villaggio** le 19 ferite con gravità ≤ 20 (blackEye, contusion, deepCut, exhaustion, sprain, brokenNose, punctureWound, severeBurn, muscleTear, stunned, brokenLeftArm, brokenRightArm, crushedLeftHand, crushedRightHand, brokenLeftLeg, brokenRightLeg, frostbite, dislocatedShoulder, hypothermia); **città** le 28 con gravità ≤ 40 (le 19 più infection, missingLeftEye, missingRightEye, poisonInjection, headConcussion, puncturedLung, missingRightHand, missingLeftHand, internalBleeding); **capitale** tutte e 37 (anche traumaticBrainInjury, blindness, missingLeftArm, missingRightArm, missingLeftLeg, missingRightLeg, fracturedRib, paralysis, spinalInjury). La taglia è quella di `citySizeOf(city.type)` (Phase 12): 98 villaggi, 60 città (Necrorian compreso, senza heal), 9 capitali.
- **D-04 (utente, «Sì, con la tabella proposta»):** ritocchi di lore per `CityType` aggiunti alla lista della taglia: villaggi di montagna e del nord (`mountainVillage` 3, `northVillage` 9) + frostbite, hypothermia; villaggi del deserto (`desertVillage` 7) + severeBurn, exhaustion; villaggi tropicali (`tropicalVillage` 8) + infection, poisonInjection; città di mare (`valanSeaCity` 6, `drusteaSeaCity` 3, `mirwaSeaCity` 3) + hypothermia, infection. Le aggiunte già in lista non si ripetono (insieme). Ogni altra eccezione di lore la scrive l'utente a mano a DB («la mano vince», Phase 12).
- **D-05 (utente, 2 / 5 / 8 ore):** `infos.timeToComplete` delle heal per taglia: villaggio 7 200 000 ms, città 18 000 000 (come oggi), capitale 28 800 000. Solo dato, scritto dallo stesso script.
- **D-10 (utente, «Tre varianti per taglia»):** `infos.description` delle heal riscritta per taglia nella voce del tempio (Phase 11 D-32), una variante per taglia con il nome della città: villaggio = piccola clinica presso il tempio, cure leggere; città = infermeria del tempio; capitale = grande tempio con guaritori esperti. Titoli «Cure al tempio di <città>» invariati, `minTitle` rookie invariato (le heal devono restare accessibili a tutti, Phase 11), `requiredPoints` null invariato.
- **D-06 (utente, «Le quest heal restano gratuite»):** nessun costo: corsia standard a costo zero (`pointsCostOf`), nessun campo nuovo.
- **D-14 (Claude, regola di casa D-36):** il contenuto non passa dal repo: lo script di applicazione (`.mjs` di sola scrittura mirata, con backup `quests` prima dell'applicazione e prova a secco che stampa i conteggi per taglia) e il file di revisione (`heal-cure-content.json`: per quest id, città, taglia, tipo, lista, quota, ore, descrizione) vivono nello scratchpad della sessione e nel handoff; l'applicazione a DB avviene dopo l'OK dell'utente sul file e dopo la merge della fase (le quest con `cure` prima del deploy curerebbero nulla: fail-safe D-01, nessun danno, ma si evita la finestra).

#### Esito (BE-HEAL-04)
- **D-08 (Claude):** `planParticipant` calcola `injuriesHealed` = ferite correnti presenti in `cure.canHeal` (insieme, ordine delle ferite del personaggio) e le toglie da `status.injuries` nella stessa scrittura; `woundsAfter` continua ad aggiungere quelle del combattimento (una heal non ha combattimento: `battle` null). Il `QuestResult` del partecipante registra `injuriesHealed: [InjuryType]` (campo additivo `QuestResult.injuriesHealed: [InjuryType!]!`, default `[]`) accanto a `hpBefore`/`hpAfter` già presenti, così la FE elenca «Guarite: …». Le ferite non in lista restano: il personaggio può uscire dal tempio ancora ferito.
- **D-13 (Claude):** una sola primitiva pura `cureInjuries(injuries, canHeal) → { injuries, healed }` in `src/quests/outcomes/injuries/` (dove vivono le regole delle ferite), riusabile dalla futura meccanica degli oggetti (stand-by) senza riscrivere nulla; il tetto degli HP con `lifePointsWithin` (nessuna nuova tabella).

#### Ordine, prove e handoff (BE-HEAL-05)
- **D-12 (utente, «12 Hardening prima, poi la 18»):** la coppia 18 si pianifica ora ma **si esegue dopo** la BE Phase 17 (companion della FE 12 Hardening) e la sua merge; ordine d'esecuzione BE `… → 16 → 17 → 18`. I due rami vivono in parallelo da `develop`; alla seconda merge si riconciliano i documenti di pianificazione condivisi.
- **D-11 (utente):** fuori scope dichiarati sopra (uso oggetti dal Diario in stand-by, cibo rinviato, pozioni in combattimento invariate, cura consigliata invariata).
- **D-09 (Claude):** validazione: `lifePointsShare` numero finito in [0, 1] (Mongoose `min`/`max`), `canHeal` enum; `QuestPrizesInput.cure` opzionale per l'admin; nessuna migrazione: le quest senza `cure` non curano (D-01) finché lo script non scrive il contenuto; la spec del boot reale conferma lo SDL additivo (`QuestCure`, `QuestPrizes.cure`, `QuestResult.injuriesHealed`).
- **Prove (default tecnico):** unit sulla primitiva (insieme, ordine, ferite ignote ignorate), sul tetto (0, 0,5, 1, hp già sopra il tetto, massimo cambiato dal level up nello stesso esito: il tetto si calcola sul nuovo massimo), sul piano (`cure` null → nulla; `cure` su una `job` vinta → cura; heal persa impossibile ma piano stabile); integration: heal con `cure` di villaggio su un personaggio con due ferite di cui una in lista → una tolta, HP al 50%, `injuriesHealed` nel risultato e sul filo; `study` con `cure` → cura + magia; SDL verbatim della FE; handoff `BACKEND-NOTES.md` per la FE Phase 18 con i tre esempi di quest (villaggio, città, capitale) per la UAT e lo script di contenuto.

#### Pozioni dal Diario e ricarica (BE-HEAL-06, BE-HEAL-07)
- **D-15 (utente, «Ogni oggetto heal ha un suo recoveryTime, come per le magie. Il personaggio può quindi assumere una pozione solo quando il tempo di ricarica per poterne assumere un'altra non esaurisce. Uso una pozione che mi blocca per 10 minuti → non posso più prendere pozioni di qualsiasi tipo per 10 minuti»; forma scelta dall'utente «recovery { time: int; turns: int }»):** `LootItem.recovery` sotto-documento nullable `{ time: Number (ms, intero ≥ 0), turns: Number (intero ≥ 0) }` (`LootRecovery` sullo SDL, campo additivo `LootItem.recovery: LootRecovery` nullable, `LootRecoveryInput` in `LootItemInput`); la **ricarica è globale**: un solo campo sul personaggio, `status.potionRecoveryUntil: Date | null` (additivo sul filo come `CharacterStatus.potionRecoveryUntil: DateTime`), nessuna lista né processor come per le magie (Phase 9.1): il BE confronta la data all'uso, la FE mostra il conto alla rovescia. Una pozione senza `recovery` o senza `time` **non si beve** (codice dedicato): un buco di contenuto si vede, non regala nulla.
- **D-16 (utente, «In combat ho deciso che le pozioni funzioneranno in modo diverso»):** `recovery.turns` è **solo dato** per il motore di combattimento dell'utente (conversione delle ore in turni, non ancora decisa); il combattimento di questa fase non legge né scrive `potionRecoveryUntil` (il segnaposto continua a bere sotto il 30 % come oggi) e la ricarica fuori combattimento non governa il combat. Valori di `turns` a DB: bozza nel file di revisione, decisi dall'utente.
- **D-17 (Claude):** mutation `useItem(itemId: ID!): UseItemResult` (`{ hpBefore, hpAfter, injuriesHealed: [InjuryType!]!, quantityLeft, recoveryUntil: DateTime, loreUnlocked: [Lore!]! }`) sull'identità del bearer (ownership come `equipItem`). Regole, in quest'ordine: in attesa di soccorso → `AWAITING_AID` (Phase 9 D-07); oggetto non posseduto o quantità 0 → `ITEM_NOT_OWNED`; `effect` ≠ heal o `recovery.time` assente → `ITEM_NOT_USABLE`; `potionRecoveryUntil` nel futuro → `POTION_RECOVERING` con `recoveryUntil` nelle `extensions`; HP già al massimo e nessuna ferita in `canHeal` → `ITEM_NO_EFFECT` (nessun consumo, nessuna ricarica). **Consentita in città e in viaggio** (nessun divieto: la ricarica è la regola del mondo). Una sola scrittura atomica: filtro su quantità ≥ 1, ricarica scaduta o nulla, HP e ferite dello snapshot; update con HP = min(max, hp + power) via `lifePointsWithin`, ferite − `canHeal` con `cureInjuries` (D-13), inventario con una riga di vendita senza incasso (`applyTradeToInventory`, pila rimossa a 0, guardie di quantità di Phase 4), `potionRecoveryUntil = now + recovery.time`, add-to-set delle `relatedLore` dell'oggetto in `unlockedLore` (D-19); `characterUpdated` riemesso dal change stream, nessuna pubblicazione a mano. Il cibo (`hunger`) e le munizioni non hanno ricarica né uso manuale.
- **D-18 (utente: «il tempo minimo lo metterei a 30 minuti che può aumentare fino a 24 ore per le pozioni più potenti»; tabella proposta da Claude e accettata come base):** tempi a DB per le 28 pozioni heal dalla scala 30 min / 45 min / 1 h / 1 h 30 / 2 h / 3 h / 4 h / 6 h / 8 h / 10 h / 12 h / 16 h / 20 h / 24 h: base per potenza (≤ 500 → 30 min, 800–1000 → 45 min, 1200–1500 → 1 h, 2000–2500 → 1 h 30, 3000 → 2 h, 4000 → 3 h, 5000–6000 → 4 h, 8000 → 6 h, 10 000 → 8 h, 15 000 → 10 h, 20 000 → 12 h, 25 000 → 16 h, 40 000 → 24 h), uno scalino in più per rare e ultrarare, minimi per la ferita più grave curata (fratture e lussazioni ≥ 2 h; infezione, veleno, commozione, polmone, emorragia interna ≥ 1 h 30; trauma cranico e cecità ≥ 4 h; paralisi e lesione spinale ≥ 8 h; parti mancanti ≥ 12 h). Valori per pozione nel file di revisione (`heal-recovery-proposal.json`: id, minuti, ms, bozza di `turns`), scritti a DB dallo script di D-14 dopo l'OK dell'utente e dopo la merge; ritoccabili a mano («la mano vince»).

#### Lore del limite del corpo (BE-HEAL-08)
- **D-19 (utente, «aggiungiamo anche la creazione di una nuova lore che spieghi come mai le pozioni non si possono bere in sequenza, così da giustificare questa scelta»):** una lore nuova di tipo `knowledge` (titolo bozza «Il limite del corpo», testo bozza nel file di revisione, nella voce dei guaritori: le pozioni sono essenze concentrate, il corpo ne assorbe una dose alla volta, una seconda dose prima che la prima si sia posata non fa nulla o avvelena, le più potenti chiedono più riposo), scritta a DB dall'orchestratore dopo la revisione dell'utente (D-36). **Collegamento e sblocco:** campo additivo `LootItem.relatedLore: [Lore]` (stesso nome e semantica di `Enemy.relatedLore` e `City.relatedLore`, ref, default vuoto), le 28 pozioni heal puntano alla lore; **alla prima pozione bevuta** `useItem` aggiunge le `relatedLore` dell'oggetto a `status.unlockedLore` con `knowledgeAdditionOf` (Phase 16) nella stessa scrittura e le riporta in `loreUnlocked` (solo le novità, come `QuestResult.loreUnlocked`); sul filo `LootItem.relatedLore` è filtrata per il viewer come le altre (Phase 16 D-07, innkeeper tutto). Alternative scartate: sblocco alla nascita (servirebbe una regola di «lore comuni» che non esiste dalla Phase 11 D-25), tiro di studio (casuale: il giocatore potrebbe non leggerla mai).

### Claude's Discretion

- Nomi definitivi del contratto in `18-REPO-RULES.md` (default: `QuestCure`, `lifePointsShare`, `canHeal`, `injuriesHealed`, `LootRecovery`, `recovery`, `relatedLore`, `potionRecoveryUntil`, `useItem`, `UseItemResult`, codici `ITEM_NOT_USABLE`, `POTION_RECOVERING`, `ITEM_NO_EFFECT`); forma degli input admin.
- Testo e titolo della lore «Il limite del corpo» (bozza nel file di revisione; l'utente la corregge lì).
- Ordine dei campi nello SDL ordinato, posizione della primitiva, nomi delle spec.
- Le tre descrizioni per taglia (bozze nel file di revisione; l'utente le corregge lì).
- Forma del file di revisione e dello script (pattern `heal-content-apply.mjs` del 2026-11-09).

### Deferred Ideas (OUT OF SCOPE)

- **Ricarica in combattimento** (`recovery.turns`): solo dato in questa fase; il motore di combattimento dell'utente deciderà come leggerlo.
- **Debito di fame / «in battaglia le cure non superano la vita d'ingresso»**: idee della conversazione sul cibo, rinviate con esso.
- **Cibo in viaggio**: vita graduale per chilometro, pasti consumati solo quando servono, debito di fame, regola «in battaglia le cure non superano la vita d'ingresso»: rinviati («ci ripenseremo più avanti»); il viaggio resta Phase 14 D-04 (tutto alla partenza, nessun rimborso).
- **Tabella di gravità nel BE**: non serve finché le liste sono esplicite a DB.
- **Cura consigliata nei requisiti delle quest generate**: riadattamento futuro col motore di combattimento dell'utente.
- **Pesatura del sorteggio delle ferite in combattimento**: regola futura dell'utente (quick 261109-inj2).

### Nomi già fissati (`18-REPO-RULES.md`, 2026-11-10 — non si rinominano)

`QuestCure { lifePointsShare: Float!, canHeal: [InjuryType!]! }`, `QuestPrizes.cure` (nullable), `QuestCureInput`, `QuestPrizesInput.cure`, `QuestResult.injuriesHealed: [InjuryType!]!`, `cureInjuries(injuries, canHeal) → { injuries, healed }`, `LootRecovery { time: Int!, turns: Int! }`, `LootItem.recovery` (nullable), `LootRecoveryInput`, `CharacterStatus.potionRecoveryUntil: DateTime` (nullable), `useItem(itemId: ID!): UseItemResult!`, `UseItemResult { hpBefore: Int!, hpAfter: Int!, injuriesHealed: [InjuryType!]!, quantityLeft: Int!, recoveryUntil: DateTime!, loreUnlocked: [Lore!]! }`, codici `ITEM_NOT_USABLE`, `POTION_RECOVERING`, `ITEM_NO_EFFECT`, `extensions.recoveryUntil` (ISO 8601), `LootItem.relatedLore: [Lore!]!`. La prova additiva conferma che lo SDL generato coincide con questi nomi e questi tipi (vedi F-9). Nessun nome è reso impossibile dal codice.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Descrizione | Supporto della ricerca |
|----|-------------|------------------------|
| BE-HEAL-01 | `Quest.prizes.cure` nullable, `QuestCure` sullo SDL, input admin, nessuna migrazione | F-1, F-9, Pitfall 1 e 2; modello in `src/models/quest/quest-prizes.model.ts` |
| BE-HEAL-02 | Tetto sulla quota del massimo dopo la progressione, ferite in `canHeal` tolte nella stessa scrittura, ogni tipo di quest, primitiva pura | F-2, F-3, Pattern 1, Code Examples |
| BE-HEAL-03 | Contenuto delle 166 heal a DB fuori repo dopo la merge | Fuori dai piani (D-14): solo il runbook nel handoff; Pitfall 2 (il driver nativo non valida) |
| BE-HEAL-04 | `QuestResult.injuriesHealed` | F-4 (modello, draft, rescue, populate, fixture, lettori idratati) |
| BE-HEAL-05 | Unit, integration, boot reale, handoff | F-9, F-10, Validation Architecture |
| BE-HEAL-06 | `LootItem.recovery`, `LootItem.relatedLore` filtrata, `potionRecoveryUntil`, nessun processor | F-5, F-7, F-9, Pattern 4 |
| BE-HEAL-07 | Mutation `useItem` con i cinque rifiuti in ordine e una scrittura atomica | F-5, F-6, Pattern 2 e 3, probe P2 e P3 |
| BE-HEAL-08 | Contenuto delle pozioni e lore a DB fuori repo; integration su prima pozione, ricarica, nessun effetto, soccorso, viaggio | Integration nei piani (F-10); contenuto fuori dai piani |
</phase_requirements>

## Project Constraints (from CLAUDE.md e 18-REPO-RULES.md)

- Stack fisso: NestJS 11, Mongoose 8, Apollo code-first, Bull. Nessuna dipendenza nuova.
- TDD obbligatorio: RED → `test(<scope>)`, GREEN → `feat`/`fix`, titolo del test con la regola e `(D-NN)`.
- Lo SDL cambia solo in modo additivo; `src/schema.gql` rigenerato nello stesso piano che aggiunge il campo; il boot reale dichiara gli additivi.
- Mai `npm run lint`, `npm run format`, `npm run build`, `nest build`; Prettier ed ESLint file per file; `npx tsc --noEmit -p tsconfig.json` a fine task.
- Jest con i percorsi prima di `--selectProjects`; integration sempre `--runInBand`; mai in background; `pgrep -fl 'bin/jest'` vuoto a fine task.
- Mai `.env`, mai il database reale, nessun avvio del BE, nessuna migrazione né seeder né file di contenuto nel repo (D-36, D-14).
- Nessun `Math.random` né `Date.now` nel codice della fase: l'ora dalla porta `Clock`.
- Mai intersezioni di interfacce di dominio nei documenti di update di Mongoose.
- Errori sul filo: il FE mappa solo `extensions.code`; i messaggi sono in italiano.
- Commit in inglese, subject ≤ 72 caratteri, nessun trailer.

## Standard Stack

### Core (già installato, nessuna aggiunta)

| Libreria | Versione | Uso nella fase | Fonte |
|----------|----------|----------------|-------|
| mongoose | 8.18.1 | sotto-schemi `_id: false`, `connection.transaction`, update condizionale | [VERIFIED: `node_modules/mongoose/package.json`] |
| @nestjs/graphql | 13.2.0 | `@ObjectType`, `@ResolveField`, `@Mutation`, `sortSchema: true` | [VERIFIED: `node_modules`, `src/graphql/graphql-options.factory.ts:54`] |
| @nestjs/mongoose | 11.0.3 | `@Prop`, `SchemaFactory`, `@InjectConnection` | [VERIFIED: `node_modules`] |
| graphql | 16.11.0 | scalare `Int` a 32 bit, propagazione dei null | [VERIFIED: `node_modules`] |
| jest | 30.1.3 | progetti `unit` e `integration` | [VERIFIED: `node_modules`] |
| mongodb-memory-server | 11.2.0 | replica set dei test (transazioni, change stream) | [VERIFIED: `node_modules`] |

### Alternatives Considered

| Invece di | Si potrebbe | Perché no |
|-----------|-------------|-----------|
| `connection.transaction` + snapshot in sessione | un solo `updateOne` nudo con operatori mirati sulla pila (`$inc` posizionale o `$pull`, scelti dallo snapshot, con la quantità esatta nel filtro) | funziona, ma abbandona `applyTradeToInventory` nominato da D-17 e contraddice «nessun read-modify-write fuori transazione» (Phase 4); i rifiuti andrebbero classificati rileggendo dopo il fallimento |
| un solo `updateOne` nudo con `$set` dell'intero `assets.ownedItems` | — | **scartato**: perde gli acquisti concorrenti di altri oggetti; nessuna guardia del filtro li vede |
| update a pipeline di aggregazione | — | la pipeline non ammette l'operatore add-to-set: `knowledgeAdditionOf` non si comporrebbe, e l'unione di insiemi non garantisce l'ordine di `unlockedLore` |
| populate di `relatedLore` in ogni lettura che espone un `LootItem` | — | nove percorsi, sei dei quali passano da `refPath` su un'unione con `EquipmentItem` (che non ha il campo); il resolver sul tipo copre tutto in un punto |
| processor Bull per la ricarica | — | vietato da D-15: basta una data confrontata all'uso |

**Installation:** nessuna.

## Findings

### F-1 — Modello della cura (`QuestPrizes.cure`)

`src/models/quest/quest-prizes.model.ts:13-50` è il punto d'inserimento: `QuestPrizes` è già un sotto-documento `_id: false` con campi nullable a `default: null` (`prizeCoins` riga 17, `spell` riga 35-40, `pet` riga 44). Il modello da copiare per `canHeal` è `src/models/loot-item.model.ts:21-23`. [VERIFIED: lettura]

Forma provata dalla prova additiva (SDL generato identico al contratto):

- classe `QuestCure` (`@ObjectType()`, `@Schema({ _id: false })`) con `lifePointsShare` (`@Field(() => Float)`, `@Prop({ type: Number, required: true, min: 0, max: 1 })`) e `canHeal` (`@Field(() => [InjuryType])`, `@Prop({ type: [String], enum: Object.values(InjuryType), default: [] })`);
- `QuestPrizes.cure` con `@Field(() => QuestCure, { nullable: true })` e `@Prop({ type: QuestCureSchema, default: null })`.

Probe P1: una quest creata senza `cure` salva `cure: null`; `create` con `lifePointsShare: 2` e `canHeal: ['nope']` fallisce su `prizes.cure.lifePointsShare` e `prizes.cure.canHeal.0`. [VERIFIED: probe]

`QuestPrizesInput` (righe 55-71) riceve `cure?: QuestCureInput | null` con `@Field(() => QuestCureInput, { nullable: true })`. È codice senza superficie: `QuestInput` (`src/models/quest/quest.model.ts:94-105`) non è argomento di nessuna mutation, e nessuno dei tre input compare in `src/schema.gql`. [VERIFIED: grep]

La quest generata (`src/quests/generation/generated-quest-draft.ts`) e la aid clonata (`src/quests/outcomes/aid/aid-quest.ts:73-83`, `clonedPrizesOf`) costruiscono `prizes` campo per campo: senza toccarle, `cure` resta al default `null`. Una aid non eredita la cura della quest fallita (Domanda aperta 4).

### F-2 — Dove si calcola `healed` oggi e come diventa la cura

`src/quests/outcomes/outcome-plan.ts`: [VERIFIED: lettura]

| Riga | Oggi | Dopo |
|------|------|------|
| 81-85 | `OutcomeQuestSnapshot { _id, infos, requirements }` | aggiungere `prizes?: { cure?: unknown } \| null` |
| 104-136 | `QuestResultDraft` senza le ferite guarite | `injuriesHealed: InjuryType[]` dopo `injuriesAdded` (riga 114) |
| 339-348 | `before`, `hpFought`, `progression = progressionAfter(...)` | invariato |
| 349-350 | `healed = won && quest.infos.type === QuestType.heal` | `cure = won ? cureOf(quest.prizes?.cure) : null` |
| 351-353 | `currentLifePoints = healed ? progression.maxLifePoints : progression.currentLifePoints` | tetto sul massimo nuovo (F-3) |
| 354-359 | `wounds = healed ? { injuries: [], added: [] } : woundsAfter(...)` | `woundsAfter` più `cureInjuries` (Domanda aperta 1 per l'ordine) |
| 431-432 | `$set` di `status.currentLifePoints` e `status.injuries` | invariato: stessi due path, valori nuovi |
| 479-482 | `hpBefore`, `hpAfter`, `maxLifePoints`, `injuriesAdded` nel draft | più `injuriesHealed` |

L'import `QuestType` (riga 22) resta: lo usa il titolo della story (riga 362).

**Lo snapshot della quest porta già `prizes`.** `RESOLUTION_QUEST_PROJECTION` ha `prizes: 1` (`src/quests/outcomes/resolution-loader.service.ts:129-137`), e `ResolutionQuest = OutcomeQuestSnapshot & { prizes?: PrizesSnapshot | null }` (righe 79-81). I due chiamanti passano già l'oggetto intero: `planCombatant` (`src/quests/outcomes/combatant-plan.ts:138-141`) e `GmCompletionService` (`src/quests/outcomes/gm-completion.service.ts:303-306`). Basta aggiungere `cure?: unknown` a `PrizesSnapshot` (`src/quests/outcomes/rewards/quest-rewards.ts:18-26`): nessuna lettura nuova, nessun chiamante da cambiare. [VERIFIED: lettura]

`gmCompleted` vale come vittoria (`won = verdict !== failure`, riga 335): una heal completata dal GM cura come oggi.

### F-3 — Ordine con la progressione (D-02)

`progressionAfter` (`src/quests/outcomes/progression/level-table.ts:58-71`) restituisce già `maxLifePoints` del livello nuovo e `currentLifePoints = lifePointsWithin(hpFought, nuovoMassimo)`: nessuna cura al level up (Phase 9 D-12). Il tetto si applica **dopo**, sul suo risultato: [VERIFIED: lettura]

```
floor = round(progression.maxLifePoints × share)
currentLifePoints = lifePointsWithin(max(progression.currentLifePoints, floor), progression.maxLifePoints)
```

Casi da pinnare: quota 0 → HP invariati; 0,5 con 400 su 1 000 → 500; 0,5 con 700 su 1 000 → 700; 1 → massimo; level up nello stesso esito (400 HP, xp 0 → 300, massimo 1 000 → 1 200) con quota 0,5 → 600, con quota 1 → 1 200. `lifePointsWithin` fa `Math.floor` e non scende sotto `MIN_LIFE_POINTS = 1`. `statusFactsOf` (`src/quests/outcomes/progression/status-facts.ts:23-35`) copre i legacy senza `maxLifePoints`.

### F-4 — `injuriesHealed` su modello, draft, GraphQL, lettori

| File:riga | Modifica |
|-----------|----------|
| `src/models/quest-result/quest-result.model.ts:184-186` | dopo `injuriesAdded`: `@Field(() => [InjuryType])`, `@Prop({ type: [String], enum: Object.values(InjuryType), default: [] })`, `injuriesHealed: InjuryType[]` |
| `src/quests/outcomes/outcome-plan.ts:114` e `482` | campo nel draft e nel risultato del piano |
| `src/quests/outcomes/rescue-plan.ts:65` | `injuriesHealed: []` in `unchangedResult` (soccorso e morte) |
| `src/quests/results/quest-result.populate.ts:67-83` | nessuna modifica: `unpopulatedResultOf` spalma il draft; **è qui che `tsc` fallisce** se il modello arriva prima del draft |
| `test/quests/quest-result.fixture.ts:20` | `injuriesHealed: []` |
| `src/travel/ambush/ambush-results.ts:63-95` | nessuna modifica: il draft dell'imboscata non porta il campo, il default dello schema scrive `[]`; la lista di chiavi pinnata in `src/travel/ambush/ambush-results.spec.ts:55-84` resta com'è |

I lettori del foglio sono idratati, non lean (`src/quests/results/quest-results.service.ts:35-38, 45-50, 61-64`): un risultato legacy senza il campo riceve il default `[]` e `[InjuryType!]!` non si annulla. `questResultReceived` rilegge con `findOne` (`src/quests/results/quest-results.publisher.ts:44`). Nessun populate nuovo: sono stringhe. [VERIFIED: lettura]

### F-5 — Scheletro di `equipItem` e cosa se ne riusa per `useItem`

`CharactersService.equipItem` (`src/characters/characters.service.ts:177-201`): [VERIFIED: lettura]

1. `requireCharacterObjectId(request.id)`; `objectIdFromHex(request.itemId)` → `ITEM_NOT_OWNED` se malformato;
2. `updateOne(equipItemFilter(characterId, itemId), equipItemUpdate(slot, itemId))` (`src/characters/equipment/equip-item.updates.ts:8-22`): filtro `activeCharacterById` più `'assets.ownedEquipments.item': itemId`;
3. `matchedCount === 0` → `exists(activeCharacterById)` → `classifyEquipItemFailure` (`ITEM_NOT_OWNED` o `NOT_FOUND`, righe 24-28).

Il resolver (`src/characters/characters.resolver.ts:63-70`) usa `@OwnsCharacter(({ request }) => request.id)`.

**Cosa non si trasferisce.** `equipItem` scrive un solo path con un solo motivo di rifiuto, e riceve l'id del personaggio. `useItem` ha cinque rifiuti ordinati, cinque path scritti, e nessun id del personaggio. Si riusa la forma «funzioni pure di filtro e update in un file `*.updates.ts` + servizio sottile», non il flusso.

**Identità.** Tre copie della stessa lettura esistono già: `QuestsService.currentCharacterIdOf` (`src/quests/quests.service.ts:90-100`), `ViewerKnowledgeService.read` (`src/lore/viewer-knowledge.service.ts:85-92`), `CharacterDeletionService` (`src/characters/deletion/character-deletion.service.ts:43-47`). `useItem` ne fa una quarta o estrae un helper (Boy Scout, a scelta del planner). Senza personaggio corrente attivo → `ResourceNotFoundException.character()`.

**Argomento.** Gli scalari non passano dalla pipe globale: `@Args('itemId', { type: () => ID }, ObjectIdPipe)` (`src/validation/object-id.pipe.ts:16-24`, come `cityShop` in `src/shops/city-shop.resolver.ts:13`). Id malformato → `BAD_USER_INPUT`, come per `equipItem` sul filo (`src/characters/equipment/equip-item.int-spec.ts:136`).

### F-6 — D-17 come una sola scrittura: forma prescritta

Dentro `connection.transaction((session) => …)` (rieseguibile dal driver: nessun side effect, nessuna lettura parallela in sessione, `shop-transaction.service.ts:181`):

1. **Snapshot** del personaggio in sessione, lean, proiezione `{ status: 1, assets: 1 }` (bastano `awaitingAid`, `currentLifePoints`, `maxLifePoints`, `xp`, `injuries`, `potionRecoveryUntil`, `unlockedLore`, `ownedItems`, `ownedEquipments`, `wearedEquipment`).
2. **Piano puro** `planItemUse({ snapshot, item, now })` che lancia i rifiuti nell'ordine di D-17 leggendo lo snapshot, poi restituisce `{ filter, update, result }`:
   - `awaitingAid != null` → `AWAITING_AID`;
   - nessuna pila in `ownedItems` con quell'id e quantità ≥ 1 → `ITEM_NOT_OWNED`;
   - oggetto di catalogo assente, `effect !== heal`, o `recovery.time` non valido → `ITEM_NOT_USABLE`;
   - `potionRecoveryUntil > now` → `POTION_RECOVERING` con la data;
   - nessun effetto → `ITEM_NO_EFFECT` (predicato: Domanda aperta 2).
3. **Update** (tipo letterale, mai un'intersezione di interfacce):

| Path | Operatore | Valore |
|------|-----------|--------|
| `status.currentLifePoints` | set | `lifePointsWithin(hp + max(0, power), maxLifePoints)` |
| `status.injuries` | set | `cureInjuries(injuries, item.canHeal).injuries` |
| `assets.ownedItems` | set | `applyTradeToInventory(assets, [sellLine]).ownedItems` |
| `status.potionRecoveryUntil` | set | `recoveryDueAt(now, time)` (`src/characters/spells/spell-state.snapshot.ts:49-51`) |
| `status.unlockedLore` | add-to-set | `knowledgeUpdateOf(snapshot.status.unlockedLore, relatedLoreIds).addition` (assente se non c'è nulla di nuovo) |

   Solo `ownedItems` va nel set, non `ownedEquipments` (come `mealSetOf`, `src/travel/food/travel-food.updates.ts:31-47`). I cinque path sono distinti: nessun conflitto fra set e add-to-set (probe P2).
4. **Filtro** (rete di sicurezza, «la contesa la risolve il WriteConflict»): `activeCharacterById(id)`, `'status.awaitingAid': null`, `'status.currentLifePoints': <hp grezzo dello snapshot o null>`, `'status.injuries': <lista dello snapshot>`, e `soldQuantityGuards([sellLine], [guardiaRicarica])` dove la guardia della ricarica è una disgiunzione «`potionRecoveryUntil` nullo» oppure «≤ now». Probe P2: il confronto con null prende anche il personaggio legacy senza il campo; il filtro ripetuto dopo la scrittura dà `matchedCount` 0. `soldQuantityGuards` accetta già le guardie extra nella stessa lista (`src/economy/trade/trade-inventory.ts:120-137`).
5. **`matchedCount === 0`** dentro la transazione non accade in pratica (lo snapshot è lo stesso che si scrive, la contesa diventa WriteConflict e ritentativo). Per coerenza con il negozio (`shop-transaction.service.ts:243-245`) si risponde con un codice di dominio stabile; raccomandato `ITEM_NOT_OWNED`.
6. **Dopo il commit:** lettura idratata delle lore nuove (`knowledgeUpdateOf(...).fresh`) per `loreUnlocked`, nell'ordine degli id, orfani scartati. Nessuna pubblicazione: il change stream riemette `characterUpdated` (`src/characters/character-updates.publisher.ts:50-66`, `CHARACTER_CHANGES_PIPELINE` prende ogni update di un personaggio attivo).

**`applyTradeToInventory` e le guardie.** La riga è `{ direction: 'sell', kind: 'LootItem', itemId, quantity: 1 }`: `sell` toglie 1 e rimuove la pila a 0 (`trade-inventory.ts:33-41`); lancia `ITEM_NOT_OWNED` se la pila manca. `quantityLeft` è la quantità della pila nell'esito, 0 se sparita.

**`loreUnlocked` = sole novità.** `knowledgeUpdateOf(known, lore)` (`src/quests/outcomes/victory-knowledge.ts:57-67`) confronta per esadecimale su ogni forma di ref, toglie i duplicati e restituisce `{ fresh, addition }`; `addition` è `{}` quando `fresh` è vuoto, così la seconda pozione non scrive nulla sulla conoscenza. Gli id di `item.relatedLore` passano da `refIdOf` (come `victoryKnowledgeOf`, righe 48-51).

**Catalogo.** L'oggetto si legge lean una volta, fuori dalla transazione, con proiezione `{ effect, power, canHeal, recovery, relatedLore }`: serve solo dopo il controllo di possesso, ma leggerlo prima non cambia l'ordine dei rifiuti, che decide il piano puro.

### F-7 — `extensions.recoveryUntil`: dove si filtra e cosa cambia

Percorsi sul filo: [VERIFIED: lettura]

| Percorso | Funzione | Oggi |
|----------|----------|------|
| HTTP sviluppo | `formatError: formatDomainError` (`src/graphql/graphql-options.factory.ts:66`) | `extensionsOf` (`format-domain-error.ts:48-51`) tiene `code` e la `reason` di `SESSION_REVOKED` |
| HTTP produzione | `formatProductionError` = `sanitizeFormattedError(formatDomainError(...))` (righe 83-88) | `production-errors.ts:22-24` ricostruisce `{ code, ...revokeReasonOf(...) }` |
| WS produzione | `sanitizeExecutionErrors` (`production-errors.ts:33-49`) | stessa catena |
| WS sviluppo | nessun formatter: graphql-js copia `originalError.extensions` | passerebbe già; irrilevante, `useItem` è una mutation HTTP |

Modifiche esatte:

1. `src/gameRules/game-rule-error-code.enum.ts` (dopo la riga 35): `ITEM_NOT_USABLE`, `POTION_RECOVERING`, `ITEM_NO_EFFECT`.
2. `src/gameRules/game-rule.exception.ts:4-13`: il tipo di `extensions` si allarga a `{ code; recoveryUntil?: string }` e il costruttore privato accetta le chiavi in più; tre factory: `itemNotUsable()`, `potionRecovering(until: Date)` (scrive `until.toISOString()`), `itemNoEffect()`. Frasi bozza dal CONTEXT.
3. `src/graphql/format-domain-error.ts:11-19, 48-62`: `CodedHttpException` e `DomainExtensions` con `recoveryUntil?`; accanto a `revokeReasonOf` una funzione gemella esportata (nome a scelta, es. `potionRecoveryOf(code, value)`) che restituisce la chiave **solo** con `code === 'POTION_RECOVERING'` e **solo** se il valore è una stringa che ripassa identica da `new Date(v).toISOString()`.
4. `src/graphql/production-errors.ts:24`: la stessa funzione nello spread di `sanitizeFormattedError`.

Spec che pinnano il comportamento (restano verdi: le modifiche sono additive, si aggiungono casi):

- `src/gameRules/game-rule.exception.spec.ts:227-230` «covers every GameRuleErrorCode exactly once»: **RED appena l'enum cresce** senza le tre righe della tabella dei factory;
- `src/graphql/format-domain-error.spec.ts:225-231` (GameRuleException → `{ code }` e basta), `262-330` (allowlist della `reason`);
- `src/graphql/production-errors.spec.ts:40, 86-155, 232` (sanitizer e `reason`);
- `src/graphql/production-surface.int-spec.ts:176, 211, 226` (codici di dominio e `reason` in produzione su HTTP).

Casi nuovi da scrivere: la chiave passa con il codice giusto; cade con un altro codice; cade se non è una stringa ISO; in produzione passa su HTTP.

### F-8 — `LootItem.relatedLore` filtrata per viewer

Come funziona oggi: tre `@ResolveField('relatedLore')` sul **tipo** (`src/lore/related-lore.resolvers.ts:15-63`) leggono la visibilità del viewer da `ViewerKnowledgeService.of(identity, context, info)` (una lettura per viewer per richiesta HTTP e per evento WS, `src/lore/viewer-knowledge.service.ts:58-70`) e filtrano con `visibleRelated` (`src/lore/lore-visibility.ts:63-70`), che **scarta ogni ref non popolato**. `Enemy` e `Lore` arrivano popolati dai loro servizi (`RELATED_LORE_POPULATE`). [VERIFIED: lettura]

Per `LootItem` la stessa cosa non basta: nessuna delle nove letture che espongono un `LootItem` popola `relatedLore`.

| Percorso sul filo | Lettura |
|-------------------|---------|
| `lootItems`, `lootItem`, `lootItemsByIds`, `lootAssetsQuantity` | `src/lootItems/loot-items.service.ts:15-42` |
| `cityShop.loot` | `src/shops/city-shop.service.ts:44, 71-77` |
| `Character.assets.ownedItems.item` (anche `characterUpdated`) | `src/characters/characters.service.ts:113-116` |
| `Quest.prizes.prizeItem`, `randomLoot`, `requirements.recommendedLoot` | `src/quests/quest-catalog.populate.ts:12-14` (`refPath` su unione) |
| `QuestResult.consumablesUsed`, `rewards.items` | `src/quests/results/quest-result.populate.ts:18-19` (`refPath` su unione) |

Con il solo `visibleRelated` il campo risponderebbe sempre `[]`, anche all'oste: sicuro ma inutile.

**Forma prescritta:** `LootItemRelatedLoreResolver` nello stesso file, registrato in `LoreVisibilityModule` (che ha già il modello `Lore`, `src/lore/lore-visibility.module.ts:19-31`):

1. visibilità del viewer;
2. dagli id grezzi di `loot.relatedLore` (via `refHexOf`, che legge ogni forma di ref) tenere quelli visibili (`isVisible`);
3. se la lista è vuota → `[]` senza query;
4. altrimenti una `find` per id sul modello `Lore`, idratata, riordinata secondo i ref, orfani scartati.

**Costo.** Zero quando il campo non è selezionato (la FE non lo seleziona). Quando lo è: una query per `LootItem` con almeno una lore visibile. Per un giocatore: al più le pozioni in vista, e solo dopo aver sbloccato la lore. Per l'oste su `lootItems { relatedLore { id } }`: una query per oggetto con lore (28 oggi). È un N+1 dichiarato; lo si chiude con una memo per richiesta sulla stessa chiave di `viewerCacheKeyOf` (le 28 pozioni puntano alla stessa lore → una query). A discrezione del planner: raccomandata la memo solo se resta sotto una ventina di righe. Il repo non usa DataLoader. [VERIFIED: grep]

Negli harness che non importano `LoreVisibilityModule` (es. `createCharactersTestApp`) il campo usa il resolver di default: non va selezionato in quelle spec.

Il ref va dichiarato come `Enemy.relatedLore` (`src/models/enemy.model.ts:32-39`): `type: [MongooseSchema.Types.ObjectId], ref: Lore.name, default: []`. Così non è Mixed e `src/migrations/mixed-refs/mixed-ref-paths.spec.ts:135-141` resta verde (provato: `lootitems` è fra gli schemi scanditi, riga 35).

### F-9 — SDL: scalari, `DateTime` nullable, blocchi generati

- `Spell.recoveryTime`: `@Field(() => Int)` → `recoveryTime: Int!`. Nessuna domanda aperta sullo scalare.
- `DateTime` nullable sul personaggio: il modello di casa è `QuestResult.acknowledgedAt` (`src/models/quest-result/quest-result.model.ts:168-170`): `@Field(() => Date, { nullable: true })`, `@Prop({ type: Date, default: null })`. `CharacterStatus` oggi non ha date dirette; `AwaitingAid.since` usa `@Field(() => Date)` → `DateTime!`.
- SDL generato dalla prova additiva (`sortSchema: true`, ordine alfabetico): [VERIFIED: `git diff src/schema.gql` durante la prova]

```
type CharacterStatus { … maxLifePoints: Int!  potionRecoveryUntil: DateTime  spellStates: … }
type LootItem { … rarity: String  recovery: LootRecovery  relatedLore: [Lore!]!  sellPrice: Coins … }
type LootRecovery {\n  time: Int!\n  turns: Int!\n}
type QuestCure {\n  canHeal: [InjuryType!]!\n  lifePointsShare: Float!\n}
type QuestPrizes {\n  cure: QuestCure\n  pet: Pet … }
type QuestResult { … injuriesAdded: [InjuryType!]!\n  injuriesHealed: [InjuryType!]!\n  kind: … }
```

Attesi con la mutation (non generati dalla prova): `useItem(itemId: ID!): UseItemResult!` fra `unregisterPushDevice` e `useSpell` nel blocco `Mutation`, e `type UseItemResult {\n  hpAfter: Int!\n  hpBefore: Int!\n  injuriesHealed: [InjuryType!]!\n  loreUnlocked: [Lore!]!\n  quantityLeft: Int!\n  recoveryUntil: DateTime!\n}`. [ASSUMED: ordine alfabetico dedotto, da confermare alla rigenerazione]

### F-10 — Asserzioni esistenti che diventano RED (da aggiornare per prime)

| File:riga | Asserzione | Perché cambia |
|-----------|------------|---------------|
| `src/quests/outcomes/outcome-plan.spec.ts:454-472` | «heals every injury and restores the new maximum on a won heal» | regola Phase 9 D-15 superata: una heal senza `cure` non cura; riscrivere in casi con e senza `cure` |
| `src/quests/outcomes/quest-resolution.service.int-spec.ts:230-244` | «heals every wound and restores the hit points on a heal quest» | idem: la quest della spec non porta `cure` |
| `test/app.int-spec.ts:443-445` | blocco esatto `type CharacterStatus` | più `potionRecoveryUntil: DateTime` |
| `test/app.int-spec.ts:564-566` | blocco esatto `type QuestPrizes` | più `cure: QuestCure` |
| `test/app.int-spec.ts:581-583` | blocco esatto `type QuestResult` | più `injuriesHealed: [InjuryType!]!` |
| `src/gameRules/game-rule.exception.spec.ts:227-230` | ogni codice dell'enum prodotto da un factory | tre codici nuovi |

Non cambiano (provato): `src/models/loot-item.model.spec.ts:66-72` (`canHeal` resta la riga dopo `buyPrice`), `src/migrations/mixed-refs/mixed-ref-paths.spec.ts` (conteggio 34 e «nessun Mixed»), `src/travel/ambush/ambush-results.spec.ts:55-84`, `src/quests/results/quest-result.populate.spec.ts`, `src/quests/outcomes/rescue-plan.spec.ts:61` e `combatant-plan.spec.ts:149` (oggetti parziali o `toMatchObject`; se usano `toEqual` sull'intero draft lo dirà il RED del piano che aggiunge il campo: la prova additiva non l'ha aggiunto al draft).

Liste che **non** si toccano: `EXPECTED_INNKEEPER_HANDLERS`, `EXPECTED_OWNERSHIP_HANDLERS`, `EXPECTED_OWNER_ONLY_HANDLERS` (`test/authz/expected-handlers.ts`), `HANDLER_FIXTURES` (`test/authz/handler-fixtures.ts`), `EXPECTED_PUBLIC_HANDLERS` e `EXPECTED_THROTTLED_HANDLERS` (`test/app.int-spec.ts:108-126`: «mai una mutation di gioco»). Il repo non ha limiti di complessità o profondità delle query. [VERIFIED: grep]

Aggiunte al boot reale: blocchi `type QuestCure`, `type LootRecovery`, `type UseItemResult`, la riga della mutation, le righe nuove di `LootItem`, l'assenza di `input QuestCureInput` e `input LootRecoveryInput`, e «rejects useItem without a bearer» accanto a `deleteCharacter` (riga 974).

### F-11 — Coverage e tempi dei gate

Soglie di `package.json` (`jest.coverageThreshold`) che il codice della fase può toccare: [VERIFIED: lettura]

| Percorso | Soglia (statements / branches / lines) | La fase lo tocca? |
|----------|-----------------------------------------|-------------------|
| `./src/characters/characters.service.ts` | 96 / 88 / 98 | solo se `useItem` finisce lì: **sconsigliato**, va in `src/characters/items/` (nessuna soglia) |
| `./src/characters/equipment/` | 98 / 98 / 98 | no |
| `./src/economy/` | 98 / 91 / 98 | no, se `trade-inventory.ts` non si modifica (non serve) |
| `./src/shops/`, `./src/travel/`, `./src/quests/generation/`, `./src/quests/acceptance/` | varie | no |

`src/quests/outcomes/`, `src/graphql/`, `src/lore/`, `src/gameRules/`, `src/models/` non hanno soglia: la copertura è responsabilità delle spec della fase.

Tempi misurati (cache calda, 2026-11-10):

| Comando | Suite / test | Tempo |
|---------|--------------|-------|
| `npx jest --selectProjects unit` | 247 / 3 057 | 9,6 s |
| `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | 1 / 79 | 5,7 s |
| `npx jest src/quests --selectProjects integration --runInBand` | 34 / 447 | 150 s |
| `npx jest src/characters src/shops src/lore src/economy src/models src/lootItems src/graphql test/shops test/quests test/authz test/fixtures test/harness --selectProjects integration --runInBand` | 45 / 646 | 130 s |

Non misurato: `src/travel` integration (la prova additiva non l'ha eseguito; l'imboscata scrive i suoi risultati senza toccare il draft delle quest).

### F-12 — Prettier sui file che la fase tocca

Controllati uno per uno 75 file candidati (modelli, piano d'esito e spec, risultati, personaggi, economia, lore, graphql, gameRules, fixture, harness, boot reale, matrice). **Non puliti: due.** [VERIFIED: `npx prettier --check <file>`]

- `src/lootItems/loot-items.module.ts` — da toccare solo se il modulo dei loot cambia (non previsto);
- `src/models/spell.model.ts` — non da toccare (solo letto come riferimento).

Tutti gli altri, compresi `src/models/loot-item.model.ts`, `src/models/character/character-status.model.ts`, `src/quests/outcomes/outcome-plan.ts`, `test/app.int-spec.ts`, sono puliti: nessun commit `style` preliminare previsto.

## Architecture Patterns

### Recommended Project Structure

```
src/quests/outcomes/injuries/
├── cure-injuries.ts            # cureInjuries(injuries, canHeal) → { injuries, healed }
├── cure-injuries.spec.ts
├── quest-cure.ts               # cureOf(raw) sanificante + lifePointsAfterCure(hp, max, share)
└── quest-cure.spec.ts
src/characters/items/
├── item-use.plan.ts            # planItemUse: rifiuti in ordine, filtro, update, risultato (puro)
├── item-use.plan.spec.ts
├── item-use.service.ts         # transazione, snapshot in sessione, una scrittura, lore del risultato
├── item-use.resolver.ts        # mutation useItem sul bearer (o dentro CharactersResolver)
├── use-item-result.model.ts    # UseItemResult (@ObjectType, non uno schema)
└── use-item.int-spec.ts        # filo: createCharactersTestApp + FixedClock
src/lore/related-lore.resolvers.ts   # + LootItemRelatedLoreResolver
src/graphql/format-domain-error.ts   # + chiave recoveryUntil per POTION_RECOVERING
```

### Pattern 1: cura nel piano d'esito

**What:** la cura è un dato letto e sanificato una volta (`cureOf`), applicato dopo la progressione. **When:** ogni vittoria (`success`, `gmCompleted`). Il piano resta l'unico scrittore di `status.injuries` e `status.currentLifePoints` nell'esito.

### Pattern 2: piano puro + servizio sottile per `useItem`

**What:** tutta la regola (ordine dei rifiuti, valori, filtro, update, risultato) in una funzione pura testata a tabella; il servizio fa solo I/O. **Why:** l'ordine dei cinque rifiuti si prova senza database, e il servizio resta rieseguibile dal driver.

### Pattern 3: snapshot in sessione + una scrittura condizionale

**What:** `connection.transaction`, lettura lean in sessione, piano, `updateOne(filter, update, { session })`. **Why:** è il pattern di Phase 4 (negozio), Phase 9 (esiti), Phase 14 (cibo); la contesa diventa WriteConflict e ritentativo (probe P3: due bevute, tre tentativi, una scrittura, pila da 2 a 1).

### Pattern 4: allowlist di una chiave per codice

**What:** ogni chiave delle `extensions` oltre a `code` esce solo con il suo codice e solo se ha la forma attesa (`reason` ↔ `SESSION_REVOKED` ↔ enum; `recoveryUntil` ↔ `POTION_RECOVERING` ↔ stringa ISO). Stessa funzione nel formatter e nel sanitizer.

### Pattern 5: filtro per viewer sul tipo, con caricamento

**What:** `@ResolveField` sul tipo `LootItem`, visibilità dal `ViewerKnowledgeService`, lore caricate per id solo se visibili. Copre ogni percorso (negozio, inventario, premi, fogli) senza toccare nove populate.

### Anti-Patterns to Avoid

- **`$set` dell'intero `assets.ownedItems` fuori da una transazione:** perde scritture concorrenti.
- **Classificare il rifiuto rileggendo dopo un update fallito** (stile `classifySpellFailure`): con cinque codici ordinati non è deterministico; l'ordine lo decide lo snapshot.
- **Clampare `lifePointsShare` fuori scala a 1:** un `50` scritto per errore al posto di `0,5` regalerebbe la cura piena (contro il fail-safe di D-01).
- **Popolare `relatedLore` annidata sotto un `refPath` d'unione:** `EquipmentItem` non ha il campo.
- **Aggiungere `useItem` a `EXPECTED_OWNERSHIP_HANDLERS`:** la lista deriva dai metadati, la spec del boot fallirebbe.
- **Toccare `placeholder-combat-resolver.ts`:** il segnaposto che beve sotto il 30 % (`PLACEHOLDER_RULES.potionThreshold`, righe 20-21, 145-160) resta com'è (D-16); non legge `recovery` né `potionRecoveryUntil`.
- **Scrivere `ownedEquipments` nel set di `useItem`:** non cambia; scriverlo allarga la superficie della contesa.

## Don't Hand-Roll

| Problema | Non costruire | Usare | Perché |
|----------|---------------|-------|--------|
| Togliere 1 dalla pila e rimuoverla a 0 | aritmetica sull'array | `applyTradeToInventory` con una riga `sell` | regole di Phase 4 già provate |
| Guardia di quantità nel filtro | match a mano | `soldQuantityGuards(lines, extra)` | due forme dell'id (`idForms`), guardie extra nella stessa lista |
| Clamp degli HP | `Math.min`/`Math.max` sparsi | `lifePointsWithin` | mai NaN, mai sotto 1, mai sopra il massimo |
| Novità di lore e add-to-set | diff di insiemi | `knowledgeUpdateOf` | confronto per esadecimale su ogni forma di ref, update vuoto quando non c'è nulla |
| Data di fine ricarica | `new Date(Date.now() + …)` | `recoveryDueAt(clock.now(), time)` | porta `Clock`, già usata dalle magie |
| Riconoscere una ferita valida | lista locale | `isInjuryType` | 37 valori dell'enum, stringhe legacy ignorate |
| Visibilità della lore | lettura del personaggio nel resolver | `ViewerKnowledgeService.of` + `isVisible` | cache per richiesta e per evento WS, oste e senza personaggio già gestiti |
| Id del personaggio attivo | filtro a mano | `activeCharacterById` | archiviati e morti esclusi |

**Key insight:** la fase non introduce nessun meccanismo: compone sei primitive esistenti. Ogni riga di logica nuova che duplica una di queste è un difetto di review annunciato.

## Conflicts

| # | CONTEXT / REPO-RULES dice | Il codice dice | Proposta |
|---|---------------------------|----------------|----------|
| C-1 | `useItem` «ownership come `equipItem`» | `equipItem` usa `@OwnsCharacter` sull'id del personaggio nella richiesta; `useItem(itemId: ID!)` non lo ha | modello `deleteCharacter`: `@CurrentUser()` + `currentCharacter`; nessun bypass dell'oste; nessuna riga nella matrice |
| C-2 | «filtro + `updateOne` + classificazione del fallimento» come scheletro | con `applyTradeToInventory` (array intero) e cinque rifiuti ordinati serve lo snapshot in sessione | transazione + piano puro; il filtro resta rete di sicurezza; una sola scrittura (D-17 rispettata) |
| C-3 | `QuestCureInput` / `LootRecoveryInput` «per l'admin» | nessuna mutation admin usa `QuestInput` o `LootItemInput`: fuori dallo SDL | aggiungerli come classi (decisione bloccata) e pinnare nel boot reale che **non** compaiono |
| C-4 | richiesta dell'orchestratore: «una mutation nuova vuole una riga in `expected-handlers.ts` / `handler-fixtures.ts`» | le liste elencano solo handler con `@Roles` o `@OwnsCharacter` | nessuna riga; il caso senza bearer va nel blocco `global auth guard` |
| C-5 | CONTEXT e REQUIREMENTS scrivono `useItem(...): UseItemResult` | REPO-RULES e FE scrivono `UseItemResult!` | vale REPO-RULES: non nullo (`@Mutation(() => UseItemResult)`) |

Nessun nome del contratto è impossibile o incoerente con il codice.

## Common Pitfalls

### Pitfall 1: `min`, `max` ed enum non valgono sugli update
**What goes wrong:** un `updateOne` scrive `lifePointsShare: 2` o una ferita ignota. **Why:** Mongoose valida gli update solo con `runValidators: true` (probe P1). **How to avoid:** `cureOf` e il lettore della ricarica sanificano alla lettura; le spec degli schemi provano solo `create`. **Warning signs:** una spec che prova la validazione con un update.

### Pitfall 2: il contenuto arriva dal driver nativo
**What goes wrong:** lo script dell'orchestratore scrive `prizes.cure`, `recovery`, `relatedLore` senza passare da Mongoose: nessuna validazione, nessun cast (un id scritto come stringa resta stringa). **How to avoid:** lettori difensivi (`refIdOf` per gli id, `isInjuryType` per le ferite, numeri finiti); il runbook del handoff chiede `ObjectId` veri e numeri interi. **Warning signs:** `relatedLore` di una pozione che non sblocca nulla.

### Pitfall 3: `Float!` e `Int!` dentro un genitore nullable
**What goes wrong:** una `cure` a DB senza `lifePointsShare`, o un `recovery.time` non intero, fanno annullare il genitore (`cure` o `recovery` → null) **e** aggiungono una voce in `errors` a ogni risposta che lo seleziona (il tabellone intero). **How to avoid:** contenuto controllato dallo script con prova a secco; nel handoff la regola «entrambi i campi sempre presenti e interi». Il BE non maschera l'errore.

### Pitfall 4: modello e draft di `injuriesHealed` in commit diversi
**What goes wrong:** `tsc` rosso in `quest-result.populate.ts:68`, e con lui ogni spec che lo importa. **How to avoid:** stesso piano, stesso commit GREEN (il RED è la spec dello schema o del piano).

### Pitfall 5: personaggi legacy senza `potionRecoveryUntil`
**What goes wrong:** un filtro che chiede «≤ now» esclude chi non ha il campo. **How to avoid:** disgiunzione con il confronto a null, che prende anche il campo assente (probe P2). I documenti idratati ricevono il default `null`; i lean no: il piano tratta `undefined` come null.

### Pitfall 6: confronto delle date sul confine
**What goes wrong:** rifiuto e filtro in disaccordo quando `until === now`. **How to avoid:** una sola regola: in ricarica se `until > now`; il filtro ammette `≤ now`. Un caso di test sul millisecondo esatto con `FixedClock`.

### Pitfall 7: `power` e `time` fuori forma
**What goes wrong:** `power` negativo abbassa gli HP; `time` 0 o non intero dà una pozione senza ricarica o una data non valida. **How to avoid:** `Math.max(0, power)` come il segnaposto (`placeholder-combat-resolver.ts:151`); `time` valido solo se intero sicuro (soglia: Domanda aperta 3). CONTEXT segnala pozioni con potenza 0 a DB.

### Pitfall 8: riemissione del change stream e sottoscrizioni nei test
**What goes wrong:** una spec che aspetta `characterUpdated` dopo `useItem` senza priming resta appesa. **How to avoid:** `test/harness/prime-change-stream.ts`; `createCharactersTestApp` monta già `CharacterUpdatesPublisher`. `UseItemResult` è la risposta della mutation: la prova del filo non dipende dallo stream.

### Pitfall 9: il callback della transazione viene rieseguito
**What goes wrong:** log, contatori o letture parallele dentro il callback si ripetono o falliscono in sessione (Phase 4 Pitfall 6). **How to avoid:** dentro solo snapshot, piano, scrittura; la lettura delle lore del risultato e il log dopo il commit.

### Pitfall 10: `LootItem.relatedLore` selezionata in un harness senza il resolver
**What goes wrong:** id grezzi in un `[Lore!]!` → errore sul filo. **How to avoid:** le spec del campo vivono in `src/lore/lore-related.int-spec.ts`, che monta `LoreVisibilityModule`.

### Pitfall 11: i casi esistenti del piano che dipendono dal tipo `heal`
**What goes wrong:** helper come `questOf(QuestType.heal)` (`outcome-plan.spec.ts:457`) e `jobQuest({}, 'heal')` (`quest-resolution.service.int-spec.ts:232`) non portano `prizes`: dopo la fase una heal «nuda» non cura. **How to avoid:** estendere gli helper con la cura come parametro; un caso esplicito «heal senza `cure` → nulla (D-01, D-07)».

### Pitfall 12: override del GM e cura insieme
**What goes wrong:** `completePendingRequest` con `hpAfter` e `injuries` d'override su una quest che porta `cure`: la cura si applica sopra l'override. **How to avoid:** è il comportamento voluto da D-07 (ogni vittoria), ma va pinnato con un caso in `gm-completion.service.int-spec.ts` o nel piano puro, e scritto nel handoff.

## Code Examples

### Primitiva delle ferite (D-13)

```typescript
// src/quests/outcomes/injuries/cure-injuries.ts — stile di woundsAfter (outcome-plan.ts:194-202)
export function cureInjuries(
    injuries: readonly InjuryType[],
    canHeal: readonly unknown[],
): { injuries: InjuryType[]; healed: InjuryType[] } {
    const curable = new Set(canHeal.filter(isInjuryType));
    return {
        injuries: injuries.filter((injury) => !curable.has(injury)),
        healed: [...new Set(injuries.filter((injury) => curable.has(injury)))],
    };
}
```

### Lettore sanificante e tetto (D-01, D-02)

```typescript
// src/quests/outcomes/injuries/quest-cure.ts
export interface Cure {
    lifePointsShare: number;
    canHeal: InjuryType[];
}

// assente o malformata = nessuna cura; quota fuori scala = solo ferite (fail-safe D-01)
export function cureOf(raw: unknown): Cure | null {
    if (raw == null || typeof raw !== 'object') return null;
    const { lifePointsShare, canHeal } = raw as Record<string, unknown>;
    const share =
        typeof lifePointsShare === 'number' &&
        lifePointsShare >= 0 &&
        lifePointsShare <= 1
            ? lifePointsShare
            : 0;
    return {
        lifePointsShare: share,
        canHeal: Array.isArray(canHeal) ? canHeal.filter(isInjuryType) : [],
    };
}

export const lifePointsAfterCure = (
    hp: number,
    max: number,
    share: number,
): number => lifePointsWithin(Math.max(hp, Math.round(max * share)), max);
```

### Guardia della ricarica e filtro di `useItem`

```typescript
// src/characters/items/item-use.plan.ts — oggetto letterale, nessuna interfaccia di dominio nell'update
const recoveryOver = (now: Date) => ({
    $or: [
        { 'status.potionRecoveryUntil': null },
        { 'status.potionRecoveryUntil': { $lte: now } },
    ],
});

const filter = {
    ...activeCharacterById(snapshot._id),
    'status.awaitingAid': null,
    'status.currentLifePoints': snapshot.status.currentLifePoints ?? null,
    'status.injuries': snapshot.status.injuries ?? [],
    ...soldQuantityGuards([drunk], [recoveryOver(now)]),
};
```

### Chiave in più nelle `extensions`

```typescript
// src/graphql/format-domain-error.ts — gemella di revokeReasonOf
export function potionRecoveryOf(
    code: unknown,
    recoveryUntil: unknown,
): { recoveryUntil?: string } {
    if (code !== GameRuleErrorCode.POTION_RECOVERING) return {};
    return isIsoInstant(recoveryUntil) ? { recoveryUntil } : {};
}
```

## State of the Art

| Vecchio | Nuovo | Da quando | Impatto |
|---------|-------|-----------|---------|
| heal vinta = tutte le ferite via e HP al massimo (Phase 9 D-15) | cura = `prizes.cure` di ogni quest vinta | questa fase | le 166 heal non curano nulla fra la merge e lo script di contenuto (finestra dichiarata da D-14) |
| pozioni consumate solo dal combattimento | anche dal Diario, con ricarica globale | questa fase | il combattimento resta com'è (D-16) |

**Finestra operativa da scrivere nel handoff:** dal deploy della fase allo script dell'orchestratore le heal a DB non hanno `cure` e le pozioni non hanno `recovery`: le heal vinte non curano e ogni `useItem` risponde `ITEM_NOT_USABLE`. È il fail-safe voluto; l'ordine merge → script va tenuto stretto.

## Assumptions Log

| # | Affermazione | Sezione | Rischio se sbagliata |
|---|--------------|---------|----------------------|
| A1 | L'ordine alfabetico mette `useItem` fra `unregisterPushDevice` e `useSpell` e i campi di `UseItemResult` nell'ordine indicato | F-9 | solo il letterale dell'asserzione del boot: lo corregge la rigenerazione |
| A2 | Quota fuori da [0, 1] letta come 0 (solo ferite) invece che clampata | Code Examples, Anti-Patterns | una heal con quota errata non restituisce vita: visibile, non regala nulla |
| A3 | `matchedCount === 0` in transazione risponde `ITEM_NOT_OWNED` | F-6 | codice mostrato in un caso quasi irraggiungibile |
| A4 | Oggetto posseduto ma assente dal catalogo → `ITEM_NOT_USABLE` | F-6 | codice mostrato per un orfano |
| A5 | La memo per richiesta del resolver della lore è opzionale | F-8 | N+1 per l'oste su una query che la FE non fa |
| A6 | `src/travel` integration resta verde con i campi additivi | F-10, F-11 | lo scopre il gate; non misurato qui |

## Open Questions

1. **Ordine fra ferite del combattimento e cura nello stesso esito.**
   - Fatto: D-08 dice «`injuriesHealed` = ferite **correnti** presenti in `cure.canHeal`» e «`woundsAfter` continua ad aggiungere quelle del combattimento»; D-02 mette il tetto degli HP **dopo** la progressione, quindi dopo il combattimento.
   - Non chiaro: una `job` con nemici e `cure` guarisce anche le ferite appena prese?
   - Inferenza e raccomandazione: cura **dopo** il combattimento per ferite e HP (`cureInjuries(woundsAfter(existing, added).injuries, canHeal)`), coerente con D-02; `injuriesAdded` resta la lista del combattimento. Oggi nessun contenuto ha entrambi (le heal non hanno nemici): serve solo la regola e un test che la pinni. **Decisione dell'orchestratore.**
2. **Predicato di `ITEM_NO_EFFECT`.**
   - Fatto: D-17 dice «HP già al massimo e nessuna ferita in `canHeal`»; il CONTEXT registra pozioni con potenza 0.
   - Non chiaro: una pozione a potenza 0 senza ferite curabili, a HP non pieni, si consuma senza fare nulla?
   - Raccomandazione: predicato sull'esito, `hpAfter === hpBefore` e nessuna ferita guarita (sovrainsieme di D-17, copre la potenza 0). **Decisione dell'orchestratore.**
3. **`recovery.time` uguale a 0.**
   - Fatto: D-15 dice «intero ≥ 0» e «senza `recovery` o senza `time` non si beve».
   - Non chiaro: 0 è un valore valido (pozione senza ricarica) o un buco di contenuto?
   - Raccomandazione: bevibile solo con `time` intero **> 0** («un buco di contenuto si vede, non regala nulla»); lo schema resta `min: 0`. **Decisione dell'utente o dell'orchestratore.**
4. **La aid clonata eredita la cura?**
   - Fatto: `clonedPrizesOf` copia i premi campo per campo; senza modifiche `cure` non passa.
   - Raccomandazione: non clonarla (il soccorritore non è il paziente); un test lo pinna. **Conferma dell'orchestratore.**
5. **Bypass dell'oste su `useItem`.**
   - Fatto: senza id del personaggio l'oste beve solo per il proprio personaggio; `equipItem` invece ammette l'oste per conto di altri.
   - Raccomandazione: accettare (nessun caso d'uso; la FE non lo chiede). **Conferma dell'orchestratore**, perché cambia la frase «ownership come `equipItem`» delle REPO-RULES.

## Environment Availability

| Dipendenza | Serve a | Disponibile | Versione | Ripiego |
|------------|---------|-------------|----------|---------|
| Node.js | tutto | ✓ | v22.12.0 | — |
| `MongoMemoryReplSet` | integration, transazioni | ✓ (usato dalle probe) | mongodb-memory-server 11.2.0 | — |
| Redis in memoria dei test | boot reale | ✓ (`test/app.int-spec.ts` eseguito) | — | — |
| MongoDB reale, Redis reale, Twitch, Firebase | — | non servono | — | — |

Nessuna dipendenza mancante.

## Validation Architecture

### Test Framework

| Proprietà | Valore |
|-----------|--------|
| Framework | Jest 30.1.3 + ts-jest, progetti `unit` e `integration` (`package.json` → `jest.projects`) |
| Config | `package.json`; setup integration in `test/setup/{global-setup,after-env}.ts` |
| Comando rapido | `npx jest <spec> --selectProjects unit` / `npx jest <spec> --selectProjects integration --runInBand` |
| Suite completa | `npm run test:cov` (≈ 630 s: la lancia l'orchestratore in background); ripiego del gate: unit completo (≈ 10 s) più i due blocchi integration di F-11 e `src/travel` |

### Phase Requirements → Test Map

| Req ID | Comportamento | Tipo | Comando automatico | Il file esiste? |
|--------|---------------|------|--------------------|-----------------|
| BE-HEAL-01 | Schema: `cure` default null, `create` rifiuta quota fuori scala e ferita ignota, `canHeal` default vuota | unit | `npx jest src/models/quest/quest-prizes.schema.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-HEAL-01 | SDL: `QuestCure`, `QuestPrizes.cure`, nessun `input QuestCureInput` | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ (riga 564 RED) |
| BE-HEAL-02 | `cureInjuries`: insieme, ordine del personaggio, ignote ignorate, input intatto | unit | `npx jest src/quests/outcomes/injuries/cure-injuries.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-HEAL-02 | `cureOf` e tetto: null, malformata, quota 0 / 0,5 / 1, fuori scala, HP già sopra, arrotondamento | unit | `npx jest src/quests/outcomes/injuries/quest-cure.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-HEAL-02 | Piano: heal senza `cure` → nulla; `job` e `story` con `cure` → cura; sconfitta → nulla; level up nello stesso esito → tetto sul massimo nuovo; filtro invariato | unit | `npx jest src/quests/outcomes/outcome-plan.spec.ts --selectProjects unit` | ✅ (riga 454 RED) |
| BE-HEAL-02 | Risoluzione: heal di villaggio, due ferite di cui una in lista → una tolta, HP al 50 %; `study` con `cure` → cura più magia; `cure` null → nulla | integration | `npx jest src/quests/outcomes/quest-resolution.service.int-spec.ts --selectProjects integration --runInBand` | ✅ (riga 230 RED) |
| BE-HEAL-02 | Completamento del GM con `cure` e override | integration | `npx jest src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand` | ✅ (caso nuovo) |
| BE-HEAL-03 | Contenuto a DB | manuale (orchestratore, fuori repo) | — | runbook nel handoff |
| BE-HEAL-04 | Schema e default di `injuriesHealed`, enum | unit | `npx jest src/models/quest-result/quest-result.schema.spec.ts --selectProjects unit` | ✅ (casi nuovi) |
| BE-HEAL-04 | `injuriesHealed` sul filo (`questResult`, `questResultReceived`), legacy senza campo → `[]` | integration | `npx jest src/quests/results/quest-result.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) |
| BE-HEAL-04 | Soccorso e morte: `injuriesHealed: []` | unit | `npx jest src/quests/outcomes/rescue-plan.spec.ts --selectProjects unit` | ✅ |
| BE-HEAL-05 | Boot reale, SDL additivo verbatim, senza bearer | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ |
| BE-HEAL-06 | Schema: `recovery` default null, interi ≥ 0, `relatedLore` default vuota, ref non Mixed | unit | `npx jest src/models/loot-item.model.spec.ts src/migrations/mixed-refs/mixed-ref-paths.spec.ts --selectProjects unit` | ✅ (casi nuovi) |
| BE-HEAL-06 | `LootItem.relatedLore`: giocatore solo le sbloccate, oste tutte, nessun personaggio nulla, orfani scartati | integration | `npx jest src/lore/lore-related.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) |
| BE-HEAL-06 | SDL: `LootRecovery`, `LootItem.recovery`, `relatedLore`, `potionRecoveryUntil` | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ (riga 443 RED) |
| BE-HEAL-07 | Codici e factory, `extensions.recoveryUntil` sull'eccezione | unit | `npx jest src/gameRules/game-rule.exception.spec.ts --selectProjects unit` | ✅ (riga 227 RED) |
| BE-HEAL-07 | Formatter e sanitizer: la chiave passa solo col suo codice e solo ISO | unit | `npx jest src/graphql/format-domain-error.spec.ts src/graphql/production-errors.spec.ts --selectProjects unit` | ✅ (casi nuovi) |
| BE-HEAL-07 | Produzione HTTP: `POTION_RECOVERING` con `recoveryUntil` | integration | `npx jest src/graphql/production-surface.int-spec.ts --selectProjects integration --runInBand` | ✅ (caso nuovo, sonda in `test/graphql/production-probe.resolver.ts`) |
| BE-HEAL-07 | Piano puro: cinque rifiuti in ordine (tabella a coppie), valori, filtro, update, `quantityLeft`, novità di lore | unit | `npx jest src/characters/items/item-use.plan.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-HEAL-07, 08 | Filo: prima pozione (HP, ferita, pila, data, lore), seconda in ricarica con `extensions.recoveryUntil`, nessun effetto senza scrittura, soccorso, viaggio, non posseduta, non usabile, id malformato, senza personaggio, due bevute parallele, pila a 0 rimossa, lore solo la prima volta | integration | `npx jest src/characters/items/use-item.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-HEAL-07 | Il combattimento non tocca la ricarica | unit | `npx jest src/quests/outcomes/combat/placeholder-combat-resolver.spec.ts --selectProjects unit` (invariata, verde) più un caso nel piano d'esito: `potionRecoveryUntil` fuori dalle chiavi del set | ✅ |
| BE-HEAL-05 | Handoff `BACKEND-NOTES.md` | manuale (documento) | `grep -c recoveryUntil .planning/phases/18-quest-heal-per-taglia/BACKEND-NOTES.md` | ❌ piano di chiusura |

**Solo manuale:** il contenuto a DB (BE-HEAL-03, BE-HEAL-08) e la UAT su device appartengono all'orchestratore e alla FE Phase 18.

### Sampling Rate

- **Per task:** la spec mirata più `npx tsc --noEmit -p tsconfig.json`, poi `pgrep -fl 'bin/jest'` vuoto.
- **Per wave:** `npx jest --selectProjects unit` (≈ 10 s) più `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` (≈ 6 s) più il blocco integration dell'area toccata (F-11: 150 s o 130 s).
- **Gate di fase:** unit completo, i due blocchi integration di F-11, `src/travel` integration, boot reale verde, `git diff --exit-code src/schema.gql` dopo la rigenerazione committata; `test:cov` dell'orchestratore in background.

### Wave 0 Gaps

- [ ] `src/quests/outcomes/injuries/cure-injuries.spec.ts` — primitiva (BE-HEAL-02)
- [ ] `src/quests/outcomes/injuries/quest-cure.spec.ts` — lettore e tetto (BE-HEAL-02)
- [ ] `src/models/quest/quest-prizes.schema.spec.ts` — schema della cura (BE-HEAL-01), sul modello di `src/models/loot-item.model.spec.ts`
- [ ] `src/characters/items/item-use.plan.spec.ts` — piano puro (BE-HEAL-07)
- [ ] `src/characters/items/use-item.int-spec.ts` — filo, con `createCharactersTestApp({ clock: new FixedClock(...) , providers/imports della fase })` e `createPlayer` (BE-HEAL-07, 08)
- [ ] Fixture: `buildQuest` con la cura come override di `prizes` (già possibile), `buildLootItem({ recovery, canHeal, relatedLore })` (già possibile con gli override), `buildQuestResult` con `injuriesHealed: []`
- [ ] Helper delle spec del piano: `questOf` e `jobQuest` con la cura come parametro (Pitfall 11)
- [ ] `test/authz/characters-test-app.ts` — aggiungere il servizio e il resolver di `useItem` (e i modelli `User` e `Lore` se il servizio li inietta e l'harness non li ha già)

Harness: nessuno nuovo. Piano d'esito → `createOutcomeHarness` (`test/quests/outcome-world.ts:136`, clock iniettabile); filo dei personaggi → `createCharactersTestApp`; lore → harness di `src/lore/lore-related.int-spec.ts`; SDL → boot reale.

## Security Domain

### Applicable ASVS Categories

| Categoria ASVS | Si applica | Controllo |
|----------------|------------|-----------|
| V2 Authentication | no (invariata) | guard globale del bearer; caso «senza bearer» nel boot reale |
| V3 Session Management | no | — |
| V4 Access Control | sì | `useItem` agisce solo sul `currentCharacter` del bearer: nessun id del personaggio dal client, nessun IDOR possibile; `LootItem.relatedLore` filtrata per viewer |
| V5 Input Validation | sì | `ObjectIdPipe` su `itemId`; valori di catalogo sanificati alla lettura (quota, ferite, `time`, `power`) |
| V6 Cryptography | no | — |
| V11 Business Logic | sì | una sola scrittura in transazione; `ITEM_NO_EFFECT` senza consumo; ricarica confrontata lato server con `Clock` |

### Known Threat Patterns

| Pattern | STRIDE | Mitigazione |
|---------|--------|-------------|
| Doppia bevuta concorrente (due richieste parallele) | Tampering | transazione con snapshot in sessione; il perdente rilegge e riceve `POTION_RECOVERING` (probe P3) |
| Perdita di un acquisto concorrente per il set dell'inventario | Tampering | stessa transazione; WriteConflict e ritentativo |
| Ricarica aggirata con l'orologio del client | Spoofing | la data è del server; il client non manda tempi |
| Bere per un altro personaggio | Elevation of privilege | nessun id del personaggio nell'argomento |
| Lore non sbloccata letta via `LootItem.relatedLore` | Information disclosure | resolver per viewer; innkeeper tutto, senza personaggio nulla |
| Dati interni nelle `extensions` | Information disclosure | allowlist di una chiave per codice, forma ISO verificata, stessa regola in produzione |
| Cura piena da contenuto malformato | Tampering (contenuto) | `cure` assente o quota fuori scala non restituisce vita (D-01) |
| Log con dati sensibili | Information disclosure | solo id, conteggi, codice (`describeError`) |

Nessun throttling su `useItem`: la lista dei limitati esclude le mutation di gioco per decisione (commento D-08 in `test/app.int-spec.ts:116`); la ricarica è il limite.

## Suggested Plan Breakdown

Esecuzione sequenziale; le wave indicano solo le dipendenze.

| Wave | Piano | Contenuto | Tocca |
|------|-------|-----------|-------|
| 1 | 18-01 | Primitive pure: `cureInjuries`, `cureOf`, `lifePointsAfterCure` | `src/quests/outcomes/injuries/` |
| 1 | 18-02 | Modello della cura e di `injuriesHealed`: `QuestCure`, `QuestPrizes.cure`, `QuestCureInput`, `QuestResult.injuriesHealed`, draft, `rescue-plan`, fixture, SDL e boot reale (righe 564 e 581) | modelli, `outcome-plan.ts` (solo draft), `rescue-plan.ts`, `test/app.int-spec.ts`, `src/schema.gql` |
| 2 | 18-03 | Cura nel piano d'esito: ramo `healed` sostituito, `PrizesSnapshot.cure`, casi unit e integration (heal di villaggio, `job`, `study`, `cure` null, GM), `injuriesHealed` sul filo | `outcome-plan.ts`, `quest-rewards.ts`, spec di risoluzione e del foglio |
| 3 | 18-04 | Modelli delle pozioni: `LootRecovery`, `LootItem.recovery`, `LootItem.relatedLore`, `LootRecoveryInput`, `potionRecoveryUntil`, SDL e boot reale (riga 443) | modelli, `test/app.int-spec.ts`, `src/schema.gql` |
| 3 | 18-05 | `LootItem.relatedLore` per viewer | `src/lore/related-lore.resolvers.ts`, `lore-visibility.module.ts`, `lore-related.int-spec.ts` |
| 3 | 18-06 | Codici e `extensions.recoveryUntil`: enum, factory, formatter, sanitizer, produzione | `src/gameRules/`, `src/graphql/`, `test/graphql/production-probe.resolver.ts` |
| 4 | 18-07 | Piano puro `planItemUse` | `src/characters/items/` |
| 5 | 18-08 | `ItemUseService`, mutation `useItem`, `UseItemResult`, modulo, harness, SDL, boot reale (mutation, tipo, senza bearer), integration sul filo | `src/characters/items/`, `characters.module.ts`, `test/authz/characters-test-app.ts`, `test/app.int-spec.ts`, `src/schema.gql` |
| 6 | 18-09 | Gate e chiusura: suite, `tsc`, SDL, `BACKEND-NOTES.md` (contratto, comportamenti, UAT, runbook dei tre script di contenuto, finestra operativa), VALIDATION, requisiti (01, 02, 04, 05, 06, 07 chiusi; 03 e 08 aperti) | documenti |

Note per il planner:

- 18-02 e 18-04 si possono fondere in un solo piano di modelli; restano separati per tenere i RED del boot reale leggibili e i commit dello SDL piccoli.
- 18-05 e 18-06 non dipendono da 18-03: l'ordine fra loro è libero.
- Le cinque Domande aperte vanno chiuse prima di 18-03 (la 1 e la 4) e di 18-07 (la 2, la 3, la 5).

## Probe eseguite

| Probe | Cosa | Esito |
|-------|------|-------|
| P1 | `QuestSchema` con la cura: `create` valido e non valido, `updateOne` con e senza `runValidators`, lettura lean | `create` rifiuta `prizes.cure.lifePointsShare` e `prizes.cure.canHeal.0`; default `cure: null`; l'update senza validatori scrive `{ lifePointsShare: 2, canHeal: ['nope'] }` e la lean lo rilegge tale e quale; con `runValidators` rifiuta |
| P2 | `CharacterSchema`: un update condizionale con set di HP, ferite, inventario, data e add-to-set della lore, su un documento senza `potionRecoveryUntil` | prima scrittura `matchedCount` 1 (il campo assente passa la guardia), seconda 0 (ricarica nel futuro); data salvata come `Date`; lore aggiunta; ferite `['frostbite']` |
| P3 | due `connection.transaction` parallele che leggono lo stesso snapshot e scrivono pila e ricarica | esiti `['drunk:1', 'POTION_RECOVERING']`, tre tentativi in tutto (un ritentativo del driver), pila da 2 a 1 |
| Prova additiva | i quattro modelli con i campi nuovi (temporanei), `tsc`, unit completo, boot reale, due blocchi integration | `tsc` rosso solo in `quest-result.populate.ts:68`; 3 asserzioni rosse nel boot reale; tutto il resto verde; SDL di F-9 |

File di probe e modifiche temporanee rimossi: `git status --short` mostra solo questo documento.

## Sources

### Primary (HIGH confidence)

- Codice del repo sul branch `feat/18-quest-heal-per-taglia` (percorsi e righe citati nelle sezioni)
- Probe P1–P3 e prova additiva sull'harness del repo (2026-11-10)
- `18-CONTEXT.md`, `18-REPO-RULES.md`, `REQUIREMENTS.md`, `ROADMAP.md` §Phase 18, `CLAUDE.md`
- FE `18-REPO-RULES.md` (nomi consumati dall'app, `LootItem.relatedLore` non selezionata)

### Secondary (MEDIUM confidence)

- `17-RESEARCH.md` (Pitfall 5: gli enum non si validano negli update; allowlist della `reason`)

### Tertiary (LOW confidence)

- nessuna: non è servita documentazione esterna (nessuna libreria nuova, ogni meccanismo provato sul codice)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nessuna aggiunta, versioni lette da `node_modules`
- Architecture: HIGH — pattern esistenti, tre probe verdi
- Pitfalls: HIGH per quelli provati (1, 4, 5, 10, 11); MEDIUM per quelli dedotti dal codice (3, 12)
- Regole di prodotto ai margini: MEDIUM — cinque Domande aperte

**Research date:** 2026-11-10
**Valid until:** 2026-12-10 (stack stabile); da rivedere se la Phase 19 tocca `LootItem`, `CharacterStatus` o il piano d'esito prima dell'esecuzione

## RESEARCH COMPLETE
