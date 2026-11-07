# Phase 16: Lore sbloccabili - Context

**Gathered:** 2026-11-07 (discuss congiunto con la FE Phase 17, condotto dal repo FE; branch `feat/16-lore-sbloccabili` da `develop` `9103440`, la merge della PR #24 della Phase 15)
**Status:** Ready for planning — fase di regole server-side con contratto additivo per la FE Phase 17; i nomi del contratto (`CharacterStatus.unlockedLore`, `QuestEnemy.known`, `QuestResult.loreUnlocked`) sono default tecnici da fissare in `16-REPO-RULES.md` prima della ricerca (pattern 15-REPO-RULES). Nessun one-off a regime: il backfill dei personaggi esistenti (D-10) gira al boot reale e esce dal repo prima della merge, come da regola di casa.

<domain>
## Phase Boundary

La conoscenza è del personaggio e la decide il server. Il `Character` porta due insiemi additivi: le lore sbloccate (`status.unlockedLore`, id esposti sul filo) e i nemici sconfitti (`status.knownEnemies`, interno). Alla creazione il personaggio conosce la geografia della città natale (lore della città, le sue regioni, il suo stato); ogni arrivo sul marker di una città (completamento di un viaggio libero o da quest, deviazione dopo un'imboscata, salto istantaneo dell'accettazione, teleport dell'oste) sblocca la stessa geografia di quella città; ogni esito vinto con nemici sblocca le lore dei nemici affrontati e segna i nemici esatti come conosciuti per ogni partecipante vincente; una `study` vinta senza magia appresa sblocca al 50 % una lore casuale ancora chiusa fra i tipi da studio. Nessuna cascata sulle `relatedLore`. Le query di lore (`lores`, `lore(id)`, le `relatedLore` annidate, `City.relatedLore`, `Enemy.relatedLore`) rispondono per il personaggio corrente del bearer; l'innkeeper vede tutto; le quest espongono su ogni voce di `enemies` se il nemico è conosciuto dal viewer; gli esiti elencano le lore nuove dell'esito. `characterUpdated` riemette perché il documento cambia.

Fuori scope: lore «comuni» a tutti (il flag `Lore.unlocked` non esiste più dalla Phase 11 D-25), conoscenza per specie, filtro della narrativa delle quest (`Quest.infos.relatedLore` resta intera), link fra lore, immagini delle lore non di città, qualunque calcolo di conoscenza nel FE.

</domain>

<decisions>
## Implementation Decisions

### Insiemi e contratto (BE-LORE-01)
- **D-01 (utente, «Lista di id sul personaggio»):** `Character.status.unlockedLore: ObjectId[]` (ref `Lore`, default `[]`) e `Character.status.knownEnemies: ObjectId[]` (ref `Enemy`, default `[]`), additivi, scritti solo con add-to-set. Sul filo `CharacterStatus.unlockedLore: [ID!]!` (soli id, nessun populate; ~26 byte per lore in ogni evento `characterUpdated`, 473 lore a DB); `knownEnemies` non compare nello SDL. L'alternativa a collezione dedicata (`characterlore` con `unlockedAt`/`source`) è stata scartata: lo stream dei personaggi riemette già il documento.
- **D-02 (fatto di codice):** nessun campo `unlocked` esiste sul modello `Lore` né a DB (0 documenti su 473): la voce «rimosso o ridefinito» della ROADMAP è superata, nessuna conoscenza comune, nessuna migrazione del catalogo.

### Geografia (BE-LORE-01, BE-LORE-02)
- **D-03 (utente, «Città + regioni + stato, nascita e arrivo»):** la geografia di una città = la lore della città (`City.relatedLore`, 167/167 presenti) più le lore di tipo `region` e `state` fra le `relatedLore` di quella lore di città (a DB: 88 città con 1 regione, 74 con 2, 5 con 3; sempre 1 stato; es. Murnborim → Regno della Madre, Lamstone, Lontano Nord). Un'unica funzione pura `geographyOf(cityLore, relatedLore)` serve la nascita e l'arrivo; le altre lore collegate (personaggi, religioni) non si aprono (nessuna cascata).
- **D-04 (utente, nascita):** `buildStartingCharacter` riceve la geografia della città natale scelta da `StartingLocationService` (oggi restituisce solo il marker: estendere il servizio o leggere la città nel servizio di creazione) e scrive `status.unlockedLore` nello stesso inserimento; `status.knownEnemies: []`.
- **D-05 (utente, arrivo = marker della città):** conta solo l'arrivo su un POI che è `City.markerLocation` (167 marker; i 475 POI del territorio — dungeon, portali, campi di battaglia — non sono una visita). Punti d'innesto, tutti nella stessa transazione della scrittura che muove il personaggio: completamento del viaggio (`TravelCompletionService.complete`, `COMPLETION_UPDATE`, sia `free` sia `quest`, compresa la deviazione dopo una sconfitta in imboscata che è un viaggio `free` verso una città), salto istantaneo dell'accettazione (`laneClaimUpdate` con `movement.kind === 'jump'`), teleport (`teleportUpdate`). La città e la sua geografia si leggono prima dell'update nella stessa sessione; add-to-set idempotente; un marker senza città (difetto di catalogo) non sblocca nulla e non blocca il movimento.

### Nemici (BE-LORE-03, BE-LORE-06)
- **D-06 (utente, «Solo il nemico esatto sconfitto»):** a ogni esito `success` con nemici, per ogni partecipante vincente (individuale `QuestResolutionService`, party `BossResolutionService`, dungeon superata; l'imboscata vinta di `AmbushResolutionService` segue la stessa regola, default tecnico del Claude da vetare), lo stesso update del piano aggiunge con add-to-set le `Enemy.relatedLore` di tutti i nemici del contesto a `status.unlockedLore` e gli id dei nemici a `status.knownEnemies`. Sconfitta, soccorso, morte, `gmCompleted` senza combattimento: nulla. `known` sul filo = l'id esatto del nemico è in `knownEnemies` del personaggio corrente del viewer (una vittoria su un Goblin apre la pagina «Goblin» condivisa da 4 nemici, ma non schiarisce il Goblin boss).
- **D-07 (contratto):** `QuestEnemy.known: Boolean!` risolto per viewer (field resolver) su `Quest.infos.enemies[]` e `QuestResult.enemies[]`: innkeeper → `true`; utente senza personaggio corrente → `false`; una sola lettura del personaggio del viewer per richiesta (cache per request). Il risultato di una vittoria mostra `known: true` perché la conoscenza è scritta nella stessa transazione del `QuestResult`.

### Studio (BE-LORE-04)
- **D-08 (utente, «50 %»):** `study` vinta (`infos.type === study`, le 30 «Ricerche in biblioteca» a DB non hanno magia fissa né sorteggio) senza `spellLearned` → con probabilità `LORE_STUDY_CHANCE` (config validata in [0, 1], default `0.5`) una lore casuale fra quelle non ancora sbloccate dei tipi `knowledge`, `god`, `religion`, `ceremony`, `material`, `state`, `character` (110 a DB); pool letto nel loader della risoluzione ordinato per id e tirato con la `ChanceSource` del piano (riproducibile nei test); pool vuoto → nulla; la lore appresa entra in `unlockedLore` nello stesso update e in `loreUnlocked`.

### Esiti (BE-LORE-03, BE-LORE-04)
- **D-09 (utente, «Studio e prima pagina del bestiario»):** `QuestResult.loreUnlocked: ObjectId[]` (ref `Lore`, default `[]`) = le sole lore aggiunte da quell'esito (differenza rispetto allo snapshot di `status.unlockedLore` preso in sessione); sul filo `loreUnlocked: [Lore!]!` popolato (la FE seleziona `id name type` e scrive «Nuova pagina del Bestiario: …» per `enemy`/`animal`/`plant`, «Conoscenza appresa: …» per gli altri). Un esito senza novità → `[]`. Mai filtrato per viewer: è sbloccato per costruzione.

### Query filtrate (BE-LORE-05)
- **D-10 (utente, «Mappa: solo il nome; quest intere»):** `lores` e `lore(id)` restituiscono solo le lore in `unlockedLore` del personaggio corrente del bearer, con le `relatedLore` annidate filtrate allo stesso modo; `lore(id)` di una lore chiusa → `NOT_FOUND` (stesso codice di una lore inesistente: nessun oracolo); `City.relatedLore` → `null` per il giocatore finché la città non è conosciuta (il FE mostra il solo nome); `Enemy.relatedLore` (query `enemy`/`enemys`) filtrata allo stesso modo; `Quest.infos.relatedLore` intera (voce del committente); l'innkeeper vede tutto senza filtro; utente senza personaggio corrente → `[]`/`null`/`NOT_FOUND`.

### Dati esistenti, prove e handoff (BE-LORE-01, BE-LORE-06)
- **D-11 (regola di casa, migrazioni one-shot):** i 4 personaggi a DB nascono senza i due campi: un backfill one-off al boot reale li inizializza con la geografia della città del marker su cui si trovano (se `status.location` è un marker di città) più lore e id dei nemici dei loro `questresults` vinti (`success`/`gmCompleted` con `enemies`); report nel handoff, codice rimosso prima della merge (PR in draft finché non gira). I personaggi archiviati non si toccano.
- **D-12 (prove):** int-spec su nuovo personaggio (città + regioni + stato, nulla di più), arrivo libero/da quest/salto/teleport/deviazione (+ geografia, idempotente, POI del territorio ignorato), vittoria individuale e di party (tutti i vincitori; sconfitto nulla), dungeon, imboscata vinta, study con e senza tiro (chance stubbata), `loreUnlocked` solo novità, `lores`/`lore`/`City.relatedLore`/`Enemy.relatedLore` per giocatore e innkeeper, `known` per viewer, cancellazione e ricreazione → insieme nuovo, SDL verbatim della FE (selezioni `unlockedLore`, `known`, `loreUnlocked { id name type }`), `characterUpdated` riemesso; gate `test:cov` con le soglie di `src/` invariate; handoff `BACKEND-NOTES.md` per la FE Phase 17 con lo SDL finale, l'identità di prova per la UAT (il bypass dev è l'innkeeper e vede tutto: serve una seconda identità via env, come il 2026-11-01) e i trucchi a DB (svuotare `unlockedLore`, forzare il tiro dello studio, spostare un personaggio).

### Claude's Discretion
- Nome e forma della funzione di geografia, del field resolver `known` e della cache per request; dove vive il filtro (service vs resolver) e come si legge il personaggio corrente del bearer (pattern `@CurrentUser` + `users.currentCharacter`); forma del backfill (`--dry-run/--apply/--verify` come la Phase 10) e del suo report; nome della variabile d'ambiente oltre a `LORE_STUDY_CHANCE`; ordine delle `loreUnlocked`; indici (nessuno previsto: gli insiemi vivono nel documento); fixture e harness.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap e requisiti
- `.planning/ROADMAP.md` — sezione «Phase 16: Lore sbloccabili» (criteri riscritti il 2026-11-07) e tabella di allineamento FE↔BE (riga FE Phase 17)
- `.planning/REQUIREMENTS.md` — BE-LORE-01..06 (emendati il 2026-11-07)

### Lore, città, nemici (Phase 11)
- `.planning/phases/11-popolamento-del-mondo/BACKEND-NOTES.md` — lore a DB e collegamenti; D-25 (nessun `unlocked`)
- `src/lore/lore.service.ts`, `src/lore/lore.resolver.ts`, `src/lore/related-lore.ts` (populate e orfani), `src/models/lore.model.ts`, `src/models/enums/lore-type.enum.ts`, `src/models/city.model.ts` (`relatedLore` scalare nullable), `src/models/enemy.model.ts` (`relatedLore: [Lore]`), `src/cities/cities.service.ts` + `city-relations.ts`, `src/enemies/enemies.service.ts`

### Creazione, viaggio, accettazione, esiti
- `src/characters/creation/character-creation.service.ts` (`buildStartingCharacter`, inserimento in transazione), `src/characters/creation/starting-location.service.ts` (città patria → marker), `src/characters/creation/race-traits.ts`
- `.planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md` §3–§6, `src/travel/travel-completion.service.ts` (`complete`, `COMPLETION_UPDATE`, report trattenuti), `src/travel/travel.service.ts` (`teleportInSession`), `src/travel/travel.updates.ts`
- `.planning/phases/14-viaggio-e-cibo/14-CONTEXT.md` e `.planning/phases/08-travel-lifecycle-travel-01/08-CONTEXT.md` (salto istantaneo nel claim: `laneClaimUpdate`, `LaneMovement`), `src/quests/acceptance/quest-acceptance.updates.ts` (`laneClaimUpdate`, `LaneMovement`), `src/quests/acceptance/quest-acceptance.service.ts`
- `.planning/phases/09-combat-result-admin-outcomes/09-CONTEXT.md` e `.planning/phases/09.2-quest-result-delivery-contract/BACKEND-NOTES.md`, `src/quests/outcomes/quest-resolution.service.ts`, `boss-resolution.service.ts`, `combatant-plan.ts`, `outcome-plan.ts` (`planParticipant`, un unico operatore set, `spellLearned` D-31), `outcome-writer.service.ts` (`writeParticipant`), `resolution-loader.service.ts` (`readCatalog`, `readSpellPool`), `src/models/quest-result/quest-result.model.ts`, `src/models/quest/quest-enemy.model.ts`
- `.planning/phases/15-imboscate-in-viaggio/BACKEND-NOTES.md` §3–§4, `src/travel/ambush/ambush-resolution.service.ts` (vittoria d'imboscata)

### Viewer e ruoli
- `src/auth/auth-identity.ts` (`userId`, `role`), `src/auth/decorators/current-user.decorator.ts`, `src/quests/results/quest-results.resolver.ts` (pattern owner-only per utente), `src/characters/characters.resolver.ts` (`@Roles(RoleType.innkeeper)`, ownership D-04), `src/characters/character-updates.publisher.ts` (change stream → `characterUpdated`)

### FE companion
- `../Klimmeck-Guide/.planning/phases/17-unlockable-lore/17-CONTEXT.md` — D-01..D-14 (cosa seleziona e come rende la FE)
- `../Klimmeck-Guide/lib/graphql/fragments/character_fragment.dart`, `quest_fragment.dart`, `quest_result_fragment.dart`, `../Klimmeck-Guide/lib/graphql/queries/lore_queries.dart`, `city_queries.dart` (selezioni verbatim da fissare nelle int-spec)

### Regole del repo
- `CLAUDE.md`, `.planning/phases/15-imboscate-in-viaggio/15-REPO-RULES.md` (modello per `16-REPO-RULES.md`), `.planning/phases/10-hardening-trasversale/` (CLI `--dry-run/--apply/--verify` del piano 10-26)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `LoreService.findAll/findOne` con `RELATED_LORE_POPULATE` e `withoutOrphanRelatedLore`: il filtro per personaggio si aggiunge a monte (query con `_id in unlockedLore`) e a valle (filtro delle `relatedLore` popolate)
- `CharacterStatus` (`src/models/character/character-status.model.ts`): `spells` è già un array di ref con `@Field(() => [Spell])`; `unlockedLore` segue lo stesso stile con `@Field(() => [ID])`; `knownEnemies` solo `@Prop`
- `planParticipant` costruisce un unico oggetto di update con il solo operatore set: gli add-to-set si affiancano nello stesso oggetto (filtro di staleness inalterato); `OutcomeWriter.writeParticipant` scrive personaggio, saldo e risultato nella stessa session
- `ResolutionLoader.readCatalog` legge nemici e catalogo per i partecipanti: le `relatedLore` dei nemici e il pool dello studio si leggono lì; `ChanceSource` per il tiro
- `TravelCompletionService.complete` e `TravelService.teleportInSession`: `findOneAndUpdate` in transazione con `returnDocument: 'before'`; la geografia si legge prima (città per `markerLocation`, lore per id) e si aggiunge all'update
- `laneClaimUpdate` (accettazione): il salto scrive `status.location` nello stesso update del claim; la geografia del marker si aggiunge lì
- `CharacterUpdatesPublisher`: ogni update del documento riemette il personaggio popolato (nessun lavoro per la liveness)
- `@CurrentUser()` + `users.currentCharacter` (pattern di `quest-results.resolver.ts`) per il personaggio corrente del bearer; `RoleType.innkeeper` per il bypass
- Pattern CLI `--dry-run/--apply/--verify` della Phase 10 per il backfill one-off

### Established Patterns
- Un solo `findOneAndUpdate` in transazione «il filtro è la regola»; operazioni idempotenti con add-to-set; `lean()` con tipi espliciti; errori di dominio con `extensions.code` (`NOT_FOUND` da `ResourceNotFoundException.lore()`)
- Int-spec con harness `createAuthTestApp` + fixture (`persistCity`, `persistEnemy`, `persistQuest`, `createPlayer`), selezioni FE verbatim nei test di contratto, `test:cov` come gate con soglie per cartella
- Config validata in `src/config/*.ts` con default e `ConfigService` opzionale nei provider (trappola 15-03)
- One-off al boot reale, report nel handoff, rimozione in TDD prima della merge (Phase 11/13/13.1)

### Integration Points
- SDL additivo: `CharacterStatus.unlockedLore`, `QuestEnemy.known`, `QuestResult.loreUnlocked`; `City.relatedLore` già nullable; nessuna rimozione → `production-surface.int-spec.ts` e gli snapshot dello schema restano verdi se aggiornati
- `QuestEnemy` è condiviso da `Quest.infos.enemies` e `QuestResult.enemies`: un solo field resolver con cache per request copre entrambi
- Imboscata (Phase 15): l'esito vinto passa da `AmbushResolutionService` con il proprio writer: stesso helper di add-to-set e stesso `loreUnlocked` sul report
- Backfill: tocca `characters` attivi; i `questresults` vinti forniscono i nemici (26 risultati a DB)

</code_context>

<specifics>
## Specific Ideas

- «Battere un Goblin apre la pagina Goblin ma il Goblin boss resta in ombra»: due insiemi distinti, lore per il libro e id per i ritratti
- L'arrivo è «sulla città», non «nel territorio»: 464 quest hanno il marker su una città, 286 su un POI del territorio; solo le prime insegnano la geografia all'arrivo (le seconde al ritorno in città)
- Lo studio insegna al 50 %: la UAT stubba o ripete; `LORE_STUDY_CHANCE=1` nell'env di prova rende il passo deterministico
- Il bypass dev è l'innkeeper: la UAT della FE vede la Biblioteca piena finché non si usa una seconda identità

</specifics>

<deferred>
## Deferred Ideas

- Conoscenza per specie (scartata dall'utente); collezione dedicata con storico (scartata)
- Conoscenza comune / `Lore.unlocked` (non esiste più; nessuna lore condivisa)
- Filtro della narrativa delle quest (scartato: voce del committente)
- Lore sbloccate dalle quest narrative lette, dai negozi o dai pet; link fra lore (v2)
- Un contatore o una pagina «storia delle scoperte» (nessun `unlockedAt`)

</deferred>

---

*Phase: 16-lore-sbloccabili*
*Context gathered: 2026-11-07*
