# Phase 18: Quest heal per taglia - Context

**Gathered:** 2026-11-09 (discuss congiunto con la FE Phase 18, condotto dal repo FE; branch `feat/18-quest-heal-per-taglia` da `develop` `31dba96`, la merge della PR #26 dei quick task 261109-inj/inj2; worktree separato perché la Phase 17 «Autorizzazione e sessioni» era in pianificazione in un'altra sessione sul working tree principale)
**Amended:** 2026-11-09 sera, su decisione dell'utente («riprendiamo l'idea delle pozioni consumabili»): le pozioni bevute dal Diario escono dallo stand-by con una **ricarica globale** (`LootItem.recovery { time, turns }`, D-15..D-18), e una **lore nuova** spiega nel mondo perché non si bevono in sequenza (D-19). Fuori scope aggiornato di conseguenza.
**Status:** Ready for planning — fase di regole server-side con contratto additivo per la FE Phase 18; i nomi del contratto (`QuestPrizes.cure`, `QuestCure.lifePointsShare`, `QuestCure.canHeal`, `QuestResult.injuriesHealed`, `LootItem.recovery`, `LootItem.relatedLore`, `CharacterStatus.potionRecoveryUntil`, mutation `useItem` e `UseItemResult`) sono default tecnici da fissare in `18-REPO-RULES.md` prima della ricerca (pattern 15/16-REPO-RULES). **Si pianifica ora, si esegue dopo la Phase 17** (decisione dell'utente sull'ordine, D-12): la Phase 17 vive sul ramo `feat/17-autorizzazione-e-sessioni` e non è su `develop` al momento di questo discuss; alla merge di entrambe `ROADMAP.md`/`STATE.md`/`REQUIREMENTS.md` vanno riconciliati (le due fasi aggiungono righe negli stessi punti).

<domain>
## Phase Boundary

Le quest `heal` smettono di essere tutte uguali. Oggi (Phase 9 D-15) una heal vinta toglie tutte le ferite e riporta gli HP al massimo, in ogni città; a DB le 166 heal fisse (98 nei villaggi, 59 nelle città, 9 nelle capitali, tutte sul marker della città, rookie, gratuite, 5 ore, nessun premio) sono identiche. Da questa fase ogni quest porta la propria cura come premio esplicito: un sotto-documento `prizes.cure` con **due manopole indipendenti**, la quota di vita a cui la quest riporta gli HP (tetto) e la **lista delle ferite che guarisce** (`canHeal`, stesso nome e stessa semantica del campo degli oggetti heal). La cura vale per ogni quest vinta che la porta, il tipo non conta più. Il contenuto delle 166 heal (liste per taglia con ritocchi di lore per tipo di città, quota di vita, ore, descrizione) è scritto a DB dall'orchestratore con uno script di sola applicazione dopo la revisione dell'utente su un file, mai dal repo (D-36). Le heal restano gratuite.

Nella stessa fase le **pozioni heal si bevono dal Diario** (mutation `useItem`): HP più `power` fino al massimo, ferite tolte con la stessa primitiva delle quest, una pila in meno; ogni pozione porta `recovery { time, turns }` e il personaggio una sola data di ricarica (`status.potionRecoveryUntil`): bevuta una pozione, nessun'altra di qualsiasi tipo finché la ricarica non è scaduta (30 min per le erbe, fino a 24 h per le più potenti). In combattimento le pozioni funzionano in modo diverso, nel motore dell'utente: `turns` è solo dato. Una **lore nuova** («Il limite del corpo», tipo `knowledge`) spiega la regola e si sblocca alla prima pozione bevuta tramite `LootItem.relatedLore`.

Fuori scope (decisioni dell'utente del 2026-11-09): qualunque cambiamento al cibo e alla vita in viaggio (fame graduale, debito di fame, pasti progressivi: «non è necessaria al momento e rischia di complicare tutto di molto. Ci ripenseremo più avanti»), il consumo delle pozioni in combattimento (resta al motore dell'utente), la cura consigliata nei requisiti delle quest (riadattamento futuro dell'utente), una tabella di gravità delle ferite nel BE (le liste sono la verità), il generatore delle quest (le heal sono fisse, BE-CONTENT-06), Necrorian (resta senza heal).

</domain>

<decisions>
## Implementation Decisions

### Modello e contratto (BE-HEAL-01)
- **D-01 (utente, «dovremmo separare i danni guariti dalle ferite guarite. Così un posto può guarire determinati tipi di ferite e altri un altro»):** `Quest.prizes.cure` è un sotto-documento nullable `{ lifePointsShare: Number (0..1), canHeal: [InjuryType] }` con `@Prop` e `@Field` (tipo GraphQL `QuestCure`, campo additivo `QuestPrizes.cure: QuestCure` nullable), anche in `QuestPrizesInput` (`cure: QuestCureInput`). `canHeal` riusa nome e semantica di `LootItem.canHeal` (quick 261109-inj): lista di `InjuryType` validata dall'enum Mongoose, default `[]`. `cure` assente o null = la quest non cura nulla: un errore di contenuto non regala mai una cura piena (fail-safe).
- **D-02 (utente, tetto 50 / 80 / 100 %):** `lifePointsShare` è un **tetto**, non un incremento: la quest vinta porta `currentLifePoints` almeno a `round(maxLifePoints × share)` e mai sopra il massimo né sotto il valore corrente (`max(hp, floor)`), con il clamp di `lifePointsWithin`. Valori di partenza per taglia: villaggio 0,5, città 0,8, capitale 1. Ripetere la heal di un villaggio non supera mai il 50%: per il pieno serve la città. Valore 0 = la quest cura solo ferite.
- **D-07 (default dichiarato nella domanda, accettato):** la cura si applica a **ogni quest vinta che porta `prizes.cure`**, qualunque sia `infos.type`: `planParticipant` sostituisce il ramo `healed = won && type === heal` con la lettura del campo; una `story` o una `job` con `cure` guariscono; una heal senza `cure` non guarisce. Il tipo `heal` resta per il foglio e per l'eleggibilità (ripetibile, senza registrazione, corsia standard).

### Ferite e contenuto (BE-HEAL-02, BE-HEAL-03)
- **D-03 (utente, «≤20 / ≤40 / tutte»):** liste di partenza per taglia derivate dalla gravità delle ferite della FE (`InjuryType.severity`, 5–80; il BE non ha una tabella di gravità e non la avrà: le liste a DB sono la verità, la gravità serve solo allo script per abbozzarle): **villaggio** le 19 ferite con gravità ≤ 20 (blackEye, contusion, deepCut, exhaustion, sprain, brokenNose, punctureWound, severeBurn, muscleTear, stunned, brokenLeftArm, brokenRightArm, crushedLeftHand, crushedRightHand, brokenLeftLeg, brokenRightLeg, frostbite, dislocatedShoulder, hypothermia); **città** le 28 con gravità ≤ 40 (le 19 più infection, missingLeftEye, missingRightEye, poisonInjection, headConcussion, puncturedLung, missingRightHand, missingLeftHand, internalBleeding); **capitale** tutte e 37 (anche traumaticBrainInjury, blindness, missingLeftArm, missingRightArm, missingLeftLeg, missingRightLeg, fracturedRib, paralysis, spinalInjury). La taglia è quella di `citySizeOf(city.type)` (Phase 12): 98 villaggi, 60 città (Necrorian compreso, senza heal), 9 capitali.
- **D-04 (utente, «Sì, con la tabella proposta»):** ritocchi di lore per `CityType` aggiunti alla lista della taglia: villaggi di montagna e del nord (`mountainVillage` 3, `northVillage` 9) + frostbite, hypothermia; villaggi del deserto (`desertVillage` 7) + severeBurn, exhaustion; villaggi tropicali (`tropicalVillage` 8) + infection, poisonInjection; città di mare (`valanSeaCity` 6, `drusteaSeaCity` 3, `mirwaSeaCity` 3) + hypothermia, infection. Le aggiunte già in lista non si ripetono (insieme). Ogni altra eccezione di lore la scrive l'utente a mano a DB («la mano vince», Phase 12).
- **D-05 (utente, 2 / 5 / 8 ore):** `infos.timeToComplete` delle heal per taglia: villaggio 7 200 000 ms, città 18 000 000 (come oggi), capitale 28 800 000. Solo dato, scritto dallo stesso script.
- **D-10 (utente, «Tre varianti per taglia»):** `infos.description` delle heal riscritta per taglia nella voce del tempio (Phase 11 D-32), una variante per taglia con il nome della città: villaggio = piccola clinica presso il tempio, cure leggere; città = infermeria del tempio; capitale = grande tempio con guaritori esperti. Titoli «Cure al tempio di <città>» invariati, `minTitle` rookie invariato (le heal devono restare accessibili a tutti, Phase 11), `requiredPoints` null invariato.
- **D-06 (utente, «Le quest heal restano gratuite»):** nessun costo: corsia standard a costo zero (`pointsCostOf`), nessun campo nuovo.
- **D-14 (Claude, regola di casa D-36):** il contenuto non passa dal repo: lo script di applicazione (`.mjs` di sola scrittura mirata, con backup `quests` prima dell'applicazione e prova a secco che stampa i conteggi per taglia) e il file di revisione (`heal-cure-content.json`: per quest id, città, taglia, tipo, lista, quota, ore, descrizione) vivono nello scratchpad della sessione e nel handoff; l'applicazione a DB avviene dopo l'OK dell'utente sul file e dopo la merge della fase (le quest con `cure` prima del deploy curerebbero nulla: fail-safe D-01, nessun danno, ma si evita la finestra).

### Esito (BE-HEAL-04)
- **D-08 (Claude):** `planParticipant` calcola `injuriesHealed` = ferite correnti presenti in `cure.canHeal` (insieme, ordine delle ferite del personaggio) e le toglie da `status.injuries` nella stessa scrittura; `woundsAfter` continua ad aggiungere quelle del combattimento (una heal non ha combattimento: `battle` null). Il `QuestResult` del partecipante registra `injuriesHealed: [InjuryType]` (campo additivo `QuestResult.injuriesHealed: [InjuryType!]!`, default `[]`) accanto a `hpBefore`/`hpAfter` già presenti, così la FE elenca «Guarite: …». Le ferite non in lista restano: il personaggio può uscire dal tempio ancora ferito.
- **D-13 (Claude):** una sola primitiva pura `cureInjuries(injuries, canHeal) → { injuries, healed }` in `src/quests/outcomes/injuries/` (dove vivono le regole delle ferite), riusabile dalla futura meccanica degli oggetti (stand-by) senza riscrivere nulla; il tetto degli HP con `lifePointsWithin` (nessuna nuova tabella).

### Ordine, prove e handoff (BE-HEAL-05)
- **D-12 (utente, «12 Hardening prima, poi la 18»):** la coppia 18 si pianifica ora ma **si esegue dopo** la BE Phase 17 (companion della FE 12 Hardening) e la sua merge; ordine d'esecuzione BE `… → 16 → 17 → 18`. I due rami vivono in parallelo da `develop`; alla seconda merge si riconciliano i documenti di pianificazione condivisi.
- **D-11 (utente):** fuori scope dichiarati sopra (uso oggetti dal Diario in stand-by, cibo rinviato, pozioni in combattimento invariate, cura consigliata invariata).
- **D-09 (Claude):** validazione: `lifePointsShare` numero finito in [0, 1] (Mongoose `min`/`max`), `canHeal` enum; `QuestPrizesInput.cure` opzionale per l'admin; nessuna migrazione: le quest senza `cure` non curano (D-01) finché lo script non scrive il contenuto; la spec del boot reale conferma lo SDL additivo (`QuestCure`, `QuestPrizes.cure`, `QuestResult.injuriesHealed`).
- **Prove (default tecnico):** unit sulla primitiva (insieme, ordine, ferite ignote ignorate), sul tetto (0, 0,5, 1, hp già sopra il tetto, massimo cambiato dal level up nello stesso esito: il tetto si calcola sul nuovo massimo), sul piano (`cure` null → nulla; `cure` su una `job` vinta → cura; heal persa impossibile ma piano stabile); integration: heal con `cure` di villaggio su un personaggio con due ferite di cui una in lista → una tolta, HP al 50%, `injuriesHealed` nel risultato e sul filo; `study` con `cure` → cura + magia; SDL verbatim della FE; handoff `BACKEND-NOTES.md` per la FE Phase 18 con i tre esempi di quest (villaggio, città, capitale) per la UAT e lo script di contenuto.

### Pozioni dal Diario e ricarica (BE-HEAL-06, BE-HEAL-07)
- **D-15 (utente, «Ogni oggetto heal ha un suo recoveryTime, come per le magie. Il personaggio può quindi assumere una pozione solo quando il tempo di ricarica per poterne assumere un'altra non esaurisce. Uso una pozione che mi blocca per 10 minuti → non posso più prendere pozioni di qualsiasi tipo per 10 minuti»; forma scelta dall'utente «recovery { time: int; turns: int }»):** `LootItem.recovery` sotto-documento nullable `{ time: Number (ms, intero ≥ 0), turns: Number (intero ≥ 0) }` (`LootRecovery` sullo SDL, campo additivo `LootItem.recovery: LootRecovery` nullable, `LootRecoveryInput` in `LootItemInput`); la **ricarica è globale**: un solo campo sul personaggio, `status.potionRecoveryUntil: Date | null` (additivo sul filo come `CharacterStatus.potionRecoveryUntil: DateTime`), nessuna lista né processor come per le magie (Phase 9.1): il BE confronta la data all'uso, la FE mostra il conto alla rovescia. Una pozione senza `recovery` o senza `time` **non si beve** (codice dedicato): un buco di contenuto si vede, non regala nulla.
- **D-16 (utente, «In combat ho deciso che le pozioni funzioneranno in modo diverso»):** `recovery.turns` è **solo dato** per il motore di combattimento dell'utente (conversione delle ore in turni, non ancora decisa); il combattimento di questa fase non legge né scrive `potionRecoveryUntil` (il segnaposto continua a bere sotto il 30 % come oggi) e la ricarica fuori combattimento non governa il combat. Valori di `turns` a DB: bozza nel file di revisione, decisi dall'utente.
- **D-17 (Claude):** mutation `useItem(itemId: ID!): UseItemResult` (`{ hpBefore, hpAfter, injuriesHealed: [InjuryType!]!, quantityLeft, recoveryUntil: DateTime, loreUnlocked: [Lore!]! }`) sull'identità del bearer (ownership come `equipItem`). Regole, in quest'ordine: in attesa di soccorso → `AWAITING_AID` (Phase 9 D-07); oggetto non posseduto o quantità 0 → `ITEM_NOT_OWNED`; `effect` ≠ heal o `recovery.time` assente → `ITEM_NOT_USABLE`; `potionRecoveryUntil` nel futuro → `POTION_RECOVERING` con `recoveryUntil` nelle `extensions`; HP già al massimo e nessuna ferita in `canHeal` → `ITEM_NO_EFFECT` (nessun consumo, nessuna ricarica). **Consentita in città e in viaggio** (nessun divieto: la ricarica è la regola del mondo). Una sola scrittura atomica: filtro su quantità ≥ 1, ricarica scaduta o nulla, HP e ferite dello snapshot; update con HP = min(max, hp + power) via `lifePointsWithin`, ferite − `canHeal` con `cureInjuries` (D-13), inventario con una riga di vendita senza incasso (`applyTradeToInventory`, pila rimossa a 0, guardie di quantità di Phase 4), `potionRecoveryUntil = now + recovery.time`, add-to-set delle `relatedLore` dell'oggetto in `unlockedLore` (D-19); `characterUpdated` riemesso dal change stream, nessuna pubblicazione a mano. Il cibo (`hunger`) e le munizioni non hanno ricarica né uso manuale.
- **D-18 (utente: «il tempo minimo lo metterei a 30 minuti che può aumentare fino a 24 ore per le pozioni più potenti»; tabella proposta da Claude e accettata come base):** tempi a DB per le 28 pozioni heal dalla scala 30 min / 45 min / 1 h / 1 h 30 / 2 h / 3 h / 4 h / 6 h / 8 h / 10 h / 12 h / 16 h / 20 h / 24 h: base per potenza (≤ 500 → 30 min, 800–1000 → 45 min, 1200–1500 → 1 h, 2000–2500 → 1 h 30, 3000 → 2 h, 4000 → 3 h, 5000–6000 → 4 h, 8000 → 6 h, 10 000 → 8 h, 15 000 → 10 h, 20 000 → 12 h, 25 000 → 16 h, 40 000 → 24 h), uno scalino in più per rare e ultrarare, minimi per la ferita più grave curata (fratture e lussazioni ≥ 2 h; infezione, veleno, commozione, polmone, emorragia interna ≥ 1 h 30; trauma cranico e cecità ≥ 4 h; paralisi e lesione spinale ≥ 8 h; parti mancanti ≥ 12 h). Valori per pozione nel file di revisione (`heal-recovery-proposal.json`: id, minuti, ms, bozza di `turns`), scritti a DB dallo script di D-14 dopo l'OK dell'utente e dopo la merge; ritoccabili a mano («la mano vince»).

### Lore del limite del corpo (BE-HEAL-08)
- **D-19 (utente, «aggiungiamo anche la creazione di una nuova lore che spieghi come mai le pozioni non si possono bere in sequenza, così da giustificare questa scelta»):** una lore nuova di tipo `knowledge` (titolo bozza «Il limite del corpo», testo bozza nel file di revisione, nella voce dei guaritori: le pozioni sono essenze concentrate, il corpo ne assorbe una dose alla volta, una seconda dose prima che la prima si sia posata non fa nulla o avvelena, le più potenti chiedono più riposo), scritta a DB dall'orchestratore dopo la revisione dell'utente (D-36). **Collegamento e sblocco:** campo additivo `LootItem.relatedLore: [Lore]` (stesso nome e semantica di `Enemy.relatedLore` e `City.relatedLore`, ref, default vuoto), le 28 pozioni heal puntano alla lore; **alla prima pozione bevuta** `useItem` aggiunge le `relatedLore` dell'oggetto a `status.unlockedLore` con `knowledgeAdditionOf` (Phase 16) nella stessa scrittura e le riporta in `loreUnlocked` (solo le novità, come `QuestResult.loreUnlocked`); sul filo `LootItem.relatedLore` è filtrata per il viewer come le altre (Phase 16 D-07, innkeeper tutto). Alternative scartate: sblocco alla nascita (servirebbe una regola di «lore comuni» che non esiste dalla Phase 11 D-25), tiro di studio (casuale: il giocatore potrebbe non leggerla mai).

### Emendamenti del plan (2026-11-10, dopo `18-RESEARCH.md`)
- **D-20 (utente, «Sì, cura dopo il combattimento»):** in una quest vinta con nemici e con `prizes.cure` l'ordine è combattimento → ferite nuove → progressione → cura: la cura toglie tutte le ferite in `canHeal`, quelle d'ingresso e quelle appena prese, e il tetto di vita si applica agli HP finali sul massimo dopo la progressione. `injuriesHealed` elenca tutte le ferite tolte; una ferita presa e guarita nello stesso esito non resta su `status.injuries`.
- **D-21 (orchestratore, dalla ricerca C-1/C-4):** `useItem(itemId)` non porta l'id del personaggio: l'identità è bearer → `currentCharacter` (modello `deleteCharacter`), senza `@OwnsCharacter` e senza bypass dell'oste; l'oste beve solo per il proprio personaggio. La frase «ownership come `equipItem`» di D-17 è superata. Nessuna riga nuova nelle liste della matrice di autorizzazione (derivano dai metadati); il boot reale prova «useItem senza bearer → `UNAUTHENTICATED`». Il risultato è `UseItemResult!` (non nullo).
- **D-22 (orchestratore, dalla ricerca C-2):** la «sola scrittura atomica» di D-17 è una `connection.transaction` con lo snapshot letto in sessione e una sola `updateOne`, come il negozio (l'inventario si riscrive come array intero con `applyTradeToInventory`): mai un `updateOne` nudo. Due bevute parallele: una scrive, l'altra riceve `POTION_RECOVERING`.
- **D-23 (orchestratore, dalla ricerca):** `ITEM_NO_EFFECT` si decide sull'esito pianificato (HP invariati e nessuna ferita guarita), così copre anche le pozioni a potenza 0; una pozione è bevibile solo con `recovery.time` intero maggiore di 0 (altrimenti `ITEM_NOT_USABLE`); una quota `lifePointsShare` non finita o fuori da [0, 1] letta dal DB vale 0 (fail-safe D-01, mai clampata a 1); i lettori sanificano `canHeal`, `recovery` e `cure` perché Mongoose non valida gli update e gli script di contenuto usano il driver nativo; la quest `aid` clonata non eredita `cure`.
- **D-24 (orchestratore, dalla ricerca C-3):** `QuestInput` e `LootItemInput` non hanno superficie sullo SDL: i campi `cure` e `recovery` si aggiungono alle classi di input esistenti per coerenza, ma il gate dello SDL non li aspetta.

### Heal senza effetto (BE-HEAL-09)
- **D-25 (utente, 2026-11-10 a plan in corso: «se una quest heal non avrebbe alcun effetto, essa compare strappata o non compare sul tabellone» → scelte «Foglio strappato» e «Solo il tipo heal»):** una quest di tipo `heal` **non ha effetto** per un personaggio quando la sua vita corrente è già pari o sopra il tetto della quest (`round(maxLifePoints × lifePointsShare)`) E nessuna delle sue ferite è in `cure.canHeal`; una heal senza `cure` (o con `cure` sanificata a nulla) non ha effetto per nessuno. Il giudice è il backend: (a) `acceptQuest` di una heal senza effetto è rifiutata con il codice nuovo **`QUEST_NO_EFFECT`**, senza toccare corsie, punti o viaggi; (b) campo additivo per viewer **`Quest.noEffect: Boolean!`**, vero solo per una `heal` senza effetto per il personaggio corrente del bearer, falso per ogni altro tipo (una `story` o una `job` con `cure` resta sempre accettabile), falso senza personaggio corrente; nessuna eccezione per ruolo: l'oste che gioca col proprio personaggio riceve lo stesso valore di chiunque, coerente con il rifiuto di `acceptQuest` (emendato dal checker del plan, 2026-11-10); la FE lo usa per mostrare il foglio strappato e non calcola nulla. Il predicato è una funzione pura unica (stessa aritmetica del tetto di D-02 e stessa sanificazione di D-23), usata dal rifiuto e dal campo. Il campo va risolto per il singolo subscriber anche sulle subscription che portano quest (trappola della cache del viewer condivisa, Phase 16). La regola non tocca la risoluzione: una heal accettata quando aveva effetto e risolta quando non ne ha più si chiude come oggi.

### Claude's Discretion
- Nomi definitivi del contratto in `18-REPO-RULES.md` (default: `QuestCure`, `lifePointsShare`, `canHeal`, `injuriesHealed`, `LootRecovery`, `recovery`, `relatedLore`, `potionRecoveryUntil`, `useItem`, `UseItemResult`, codici `ITEM_NOT_USABLE`, `POTION_RECOVERING`, `ITEM_NO_EFFECT`); forma degli input admin.
- Testo e titolo della lore «Il limite del corpo» (bozza nel file di revisione; l'utente la corregge lì).
- Ordine dei campi nello SDL ordinato, posizione della primitiva, nomi delle spec.
- Le tre descrizioni per taglia (bozze nel file di revisione; l'utente le corregge lì).
- Forma del file di revisione e dello script (pattern `heal-content-apply.mjs` del 2026-11-09).

</decisions>

<canonical_refs>
## Canonical References

### Roadmap e requisiti
- `.planning/ROADMAP.md` — Phase 18 (goal, criteri, dipendenze), riga di allineamento BE ↔ FE
- `.planning/REQUIREMENTS.md` — BE-HEAL-01..05

### Regola attuale e piano d'esito (Phase 9)
- `.planning/phases/09-combat-result-admin-outcomes/09-CONTEXT.md` — D-15 (heal vinta = ferite azzerate e HP al massimo: **superata da questa fase**), D-01 (quest senza nemico = successo automatico), D-12 (nessuna cura al level up)
- `src/quests/outcomes/outcome-plan.ts` — `planParticipant` (ramo `healed`), `woundsAfter`, `consumablesSpent`
- `src/quests/outcomes/progression/level-table.ts` — `lifePointsWithin`, `progressionAfter`, `MIN_LIFE_POINTS`
- `src/quests/outcomes/injuries/injury-rules.ts` — regole delle ferite (segnaposto D-02), `isInjuryType`
- `src/models/quest/quest-prizes.model.ts`, `src/models/quest/quest.model.ts` — `QuestPrizes` (`spell`, `pet`, `spellDraw` come esempi di campi additivi dei premi), `QuestPrizesInput`
- `src/models/quest-result/quest-result.model.ts` — risultato per partecipante (`hpBefore`/`hpAfter`, ferite aggiunte)
- `src/models/loot-item.model.ts` — `LootItem.canHeal` (quick 261109-inj: stesso nome e semantica)
- `src/models/enums/injury-type.enum.ts` — 37 valori (quick 261109-inj2)
- `src/models/spell.model.ts` — `Spell.recoveryTime` (ms): stesso significato di `LootItem.recovery.time`
- `src/models/character/character-status.model.ts` — `status.injuries`, `currentLifePoints`/`maxLifePoints`, `awaitingAid`, `unlockedLore`: sede di `potionRecoveryUntil`
- `src/characters/characters.service.ts`, `src/characters/characters.resolver.ts` — `equipItem` (ownership, un solo `updateOne` con filtro + `classifyEquipItemFailure`): modello della mutation `useItem`
- `src/economy/trade/trade-inventory.ts` — `applyTradeToInventory`, `soldQuantityGuards` (consumo come vendita senza incasso, Phase 14 D-12)
- `src/gameRules/game-rule.exception.ts` — codici esistenti (`itemNotOwned`, `awaitingAid`, `shopNotInCity`) e sede dei tre nuovi
- `src/lore/knowledge-addition.ts`, `src/quests/outcomes/victory-knowledge.ts` — `knowledgeAdditionOf` (add-to-set solo se non vuoto), novità per `loreUnlocked` (Phase 16)
- `src/models/lore.model.ts`, `src/models/enums/lore-type.enum.ts` — `Lore`, tipo `knowledge`
- `.planning/phases/16-lore-sbloccabili/16-CONTEXT.md` — D-07 (filtri per viewer), D-09 (`loreUnlocked` = sole novità)
- `.planning/phases/09.1-spell-state-and-recovery-contract/` — ricarica delle magie (processor): modello da NON replicare, qui basta una data

### Taglia, città, eleggibilità
- `src/cities/city-size.ts` — `CITY_SIZE_BY_TYPE`, `citySizeOf` (Phase 12)
- `src/quests/acceptance/quest-eligibility.ts` — `REPEATABLE_TYPES`, `REGISTERED_TYPES`, `pointsCostOf` (heal ripetibile, gratuita, senza registrazione)
- `.planning/phases/11-popolamento-del-mondo/11-CONTEXT.md` — D-17 (una heal per città, Necrorian esclusa), D-19 (heal senza premi), D-20 (minTitle rookie), D-21 (5 h, marker della città), D-32 (descrizione nella voce del tempio)

### FE companion
- `../Klimmeck-Guide/.planning/phases/18-heal-quests-by-size/18-CONTEXT.md` — decisioni FE (foglio con le sole ferite curabili del personaggio, riga della vita, «Guarite: …» sull'esito)

### Regole del repo
- `CLAUDE.md`, `.planning/PROJECT.md` (Key Decisions: D-36 il mondo vive nel DB), `.planning/phases/16-lore-sbloccabili/16-REPO-RULES.md` (pattern delle regole di fase; «mai intersezioni con interfacce negli update di Mongoose»)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lifePointsWithin(hp, max)` e `progressionAfter` (level-table): il tetto si applica dopo la progressione, sul nuovo massimo.
- `woundsAfter(existing, added)` e `isInjuryType`: stesso stile per `cureInjuries`.
- `assetQuantitySchemaAt`, `CoinsSchema`: esempi di sotto-schema `_id: false` dentro `QuestPrizes`.
- `LootItem.canHeal`: `@Prop({ type: [String], enum: Object.values(InjuryType), default: [] })` da copiare; `Spell.recoveryTime` per il significato di `recovery.time`.
- `equipItem`: filtro con ownership + `updateOne` + classificazione del fallimento: lo stesso scheletro per `useItem`.
- `knowledgeAdditionOf` e il calcolo delle novità di `loreUnlocked` (Phase 16) per la lore della pozione.
- Script DB di sola lettura/scrittura mirata del 2026-11-09 (`heal-content-apply.mjs`, `heal-inventory.mjs`, `heal-by-size.mjs` nello scratchpad della sessione): join quest → POI → città e taglia da `city-size.ts` con regex.

### Established Patterns
- Esiti pianificati come documento di update unico (`planParticipant` → filtro + operatore set) con snapshot in sessione; nessun read-modify-write fuori transazione (Phase 4).
- Campi additivi sui premi con ref o scalari (`spell`, `pet`), nullable sul filo, `default: null`.
- SDL ordinato a mano con asserzione nel boot reale (`git diff --exit-code src/schema.gql`).
- Contenuto curato a DB dall'orchestratore con file di revisione e backup (quick 261109-inj: 28 oggetti heal).

### Integration Points
- `planParticipant` (outcome-plan.ts ~349): il ramo `healed` diventa `cureOf(quest.prizes?.cure, …)`.
- `QuestResult` draft: nuovo campo `injuriesHealed` accanto a `hpBefore`/`hpAfter`.
- `QuestPrizes`/`QuestPrizesInput`: sotto-documento `cure`.
- Loader della risoluzione: `prizes.cure` fa parte dello snapshot della quest già letto (nessuna lettura nuova della città: la taglia vive solo nel contenuto).
- `CharactersService`/resolver: mutation `useItem` con `LootItem` letto lean (`effect`, `power`, `canHeal`, `recovery`, `relatedLore`) e una sola scrittura sul personaggio.
- `LootItem` sul filo: `recovery` e `relatedLore` (filtrata per viewer) additivi; `CharacterStatus.potionRecoveryUntil` additivo.

</code_context>

<specifics>
## Specific Ideas

- Verbatim dell'utente: «Secondo me dovremmo separare i danni guariti dalle ferite guarite. Così un posto può guarire determinati tipi di ferite e altri un altro. Le quest heal restano gratuite.»; «Variamo le ore richieste per taglia»; «L'uso delle cure per adesso mettiamolo in stand-by. ci voglio ripensare bene.»; «questa parte [cibo] non è necessaria al momento e rischia di complicare tutto di molto. Ci ripenseremo più avanti. Portiamo avanti solo la questione delle quest heal».
- Dati del discuss (DB di sola lettura, 2026-11-09): 166 heal aperte tutte sul marker della città (98 village / 59 city / 9 capital), tutte rookie, `requiredPoints` null, 18 000 000 ms, nessun premio; 167 città (98/60/9); 28 oggetti heal con `canHeal` (copertura per ferita da 2 a 13 oggetti); 6 personaggi, 3 con ferite, 4 ferite in tutto; tabella livelli: 1 000 HP al livello 1.
- Dati delle pozioni (DB di sola lettura, 2026-11-09 sera): 28 pozioni heal con `canHeal`, potenza 0–40 000, prezzi da 3 rame a 30 oro; nessuna ha ancora `recovery`. Tasso di recupero fuori battaglia con la tabella di D-18: 1000–1700 HP/h per quasi tutte, 400 HP/h per le erbe da campo.
- Frasi in gioco (bozze): rifiuto per ricarica «Il tuo corpo non reggerebbe un'altra pozione: aspetta che la prima si sia posata»; nessun effetto «Questa pozione non ti farebbe nulla adesso».

</specifics>

<deferred>
## Deferred Ideas

- **Ricarica in combattimento** (`recovery.turns`): solo dato in questa fase; il motore di combattimento dell'utente deciderà come leggerlo.
- **Debito di fame / «in battaglia le cure non superano la vita d'ingresso»**: idee della conversazione sul cibo, rinviate con esso.
- **Cibo in viaggio**: vita graduale per chilometro, pasti consumati solo quando servono, debito di fame, regola «in battaglia le cure non superano la vita d'ingresso»: rinviati («ci ripenseremo più avanti»); il viaggio resta Phase 14 D-04 (tutto alla partenza, nessun rimborso).
- **Tabella di gravità nel BE**: non serve finché le liste sono esplicite a DB.
- **Cura consigliata nei requisiti delle quest generate**: riadattamento futuro col motore di combattimento dell'utente.
- **Pesatura del sorteggio delle ferite in combattimento**: regola futura dell'utente (quick 261109-inj2).

</deferred>

---

*Phase: 18-quest-heal-per-taglia*
*Context gathered: 2026-11-09*
