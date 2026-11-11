---
phase: 19-revisione-dei-modelli
fixed_at: 2026-11-11T10:34:09Z
review_path: .planning/phases/19-revisione-dei-modelli/19-REVIEW-RULINGS.md
iteration: 1
findings_in_scope: 16
fixed: 15
skipped: 1
status: partial
---

# Phase 19: Code Review Fix Report

**Sorgente:** `19-REVIEW-RULINGS.md` (ruling su `19-REVIEW-A.md`, `19-REVIEW-B.md`, `19-REVIEW-C.md`)
**Iterazione:** 1

I conteggi del frontmatter contano le righe «FIX» dei due blocchi (7 del Blocco 1, 9 del Blocco 2): 15 corrette, 1 chiusa con motivo dal fixer (A-IN-02, «FIX se banale»). I conteggi per finding delle tre review sono in fondo al Blocco 2.

## Blocco 1 — migratore e primo boot

Ogni finding ha un commit RED (`test(...)`) e un commit GREEN (`fix(...)`). Nessun finding saltato.

| Finding | Esito | RED | GREEN | Cosa cambia |
|---------|-------|-----|-------|-------------|
| C-CR-01 + B-WR-01 | corretto | `ce7c2210` | `599ee270` | I nove passi girano dentro la factory asincrona del provider `ModelReviewBoot` (`modelReviewBootProvider` in `model-review.boot.ts`): finiscono prima di OGNI lifecycle hook. `ModelReviewBoot` non implementa più `OnApplicationBootstrap`; il token `MODEL_REVIEW_STEPS` è sparito. La factory inietta anche i sette token dei modelli, così i modelli sono registrati sulla connessione prima che un passo li chieda. |
| C-WR-05 | corretto | `ce7c2210` | `599ee270` | Un passo fallito ferma il boot: riga `fallito`, riga di riepilogo, poi la factory rilancia. I passi successivi NON vengono eseguiti. Il caso «errore non bloccante» del piano 19-01 è diventato «stops at a failed step … and rejects». |
| C-WR-01 | corretto | `25b7911e` | `1e868ea1` | Una voce con `active` booleano è del codice nuovo: il suo flag vince sulla lista vecchia delle equipaggiate e la voce resta (in coda alle conosciute) anche se la magia non è in `status.spells`. Il WARN porta gli id delle magie lasciate fuori. |
| C-WR-02 | corretto | `2e38ac0c` | `1901f2fb` | Passi delle magie, dei pet posseduti e delle magie dei nemici: la guardia e i valori letti stanno nel filtro della scrittura; una scrittura non applicata dà un WARN, conta 1 in «senza corrispondenza» e resta al boot successivo. |
| C-WR-03 | corretto | `44d787be` | `aa4ec213` | Le due rinomine dell'equipaggiamento chiedono «campo nuovo assente»; i documenti con entrambi i campi non si toccano e si contano in «senza corrispondenza». |
| C-WR-04 | corretto | `f7f87413` | `7f5ace40` | Un nemico con anche una sola copia non abbinata o ambigua NON viene scritto: tutte le sue copie restano; un WARN per copia con nome della magia e `_id` del nemico. |
| C-WR-06 | corretto | `5081c228` | `e7a5a4ed` | `CitiesService.findAll` popola con `cityRelations()` (una query in più per tutti i POI, nessun N+1); caso sul filo `cities { name pointsOfInterest { id location } }` in `cities.resolver.int-spec.ts`. |

Tutti i fix sono di logica: ognuno è coperto da un caso rosso prima e verde dopo, ma l'esito sul database reale resta da leggere nel log del primo boot.

### Prova dell'ordine del boot (C-CR-01)

- **Boot reale** (`test/app.int-spec.ts`, caso «ends the one-off model review steps before any lifecycle hook runs (D-12)»): tre sonde montate prima del boot annotano le righe del migratore già uscite nel momento in cui Nest chiama il hook, poi lasciano lavorare il hook. Le sonde sono su `BullExplorer.onModuleInit` (è il punto in cui `@nestjs/bull` aggancia i processor alle code), `QuestResolutionSweeper.onApplicationBootstrap` e `SpellStateMigrator.onApplicationBootstrap`. RED col codice precedente: tutte e tre vedono zero righe. GREEN: tutte e tre vedono le nove righe, nell'ordine.
- **Contenitore Nest con passi finti** (`model-review.boot.spec.ts`): a `compile()` risolto, prima di `init()`, i passi sono già conclusi; con un passo fallito `compile()` rigetta e nessun provider arriva al proprio `onModuleInit`.
- **Sorgente di Nest 11.1.6:** `NestFactory.initialize` attende `instanceLoader.createInstancesOfDependencies()` (che attende ogni factory asincrona) prima che `init()` chiami `callInitHook` e `callBootstrapHook`. Gli unici `onModuleInit` del repo sono `QuestResolutionScheduler`, `TravelSchedulerService` (listener d'errore sulla coda), `ChangeStreamPublisher`, `RoadsService`; nessun `registerQueue` passa `processors`, quindi nessun processor nasce nella factory della coda.
- Scelta dichiarata: le sonde sono spie sui hook di provider veri e non un provider-sonda aggiunto al modulo di test, per non allargare l'harness condiviso `test/harness/real-app-boot.ts` con un'opzione che sparirebbe col migratore. Il provider-sonda vero (`LifecycleProbe`) è nella spec unitaria del contenitore.

### Rimovibilità del modulo (C-IN-07 resta vero)

Fuori da `src/migrations/model-review/` i riferimenti sono solo:

- `src/app.module.ts`: riga 29 (import), righe 117-118 (commento e voce di `imports`);
- `test/app.int-spec.ts`: riga 2 (import di `BullExplorer`, usato solo dalle sonde), riga 59 (import di `ModelReviewBoot`), righe 146-163 (costanti delle nove righe e tipo `LifecycleHook`), righe 264-286 (`logSpy`, `modelReviewLinesSeenBy`, `modelReviewLinesSoFar`, `probeLifecycleHook`), righe 291-300 (spia sul log e tre sonde in `beforeAll`), righe 992-1010 (i due casi «mounts the one-off…» e «ends the one-off…»). In `afterAll` i due `mockRestore` sono diventati un solo `jest.restoreAllMocks()` (riga 307): alla rimozione può restare.

Il modulo resta importato solo da `AppModule`; gli header `UNA TANTUM` sono intatti; `legacy-fixtures.ts` (ora con `writeAfterNextRead`) è importato solo dalle spec del modulo.

### Comportamento nuovo del boot reale (per il runbook)

**Quando escono le righe.** Le nove righe escono durante la creazione dei provider: prima di ogni `onModuleInit`, quindi prima dei processor Bull, degli sweep, del taglio di `SpellStateMigrator`, dei verifier degli indici e di `ShopBoot`. Conseguenze attese (non provate da un test sui dati reali):

- il WARN «167 senza pool» di `ShopBoot` (C-IN-01) NON è più atteso al primo boot: `ShopBoot` gira dopo il passo dei pool;
- il taglio di `SpellStateMigrator` gira dopo il passo delle magie, su voci che hanno già `active`.

Il controllo «nulla in scadenza» prima del boot resta nel runbook, come da ruling.

**Successo.** Formato delle righe invariato: `Revisione dei modelli, <label>: trovati N, migrati N, già a posto N, senza corrispondenza N`. Nessuna riga di riepilogo in caso di successo.

**Passo fallito.** Due righe a livello ERROR, poi l'errore di Nest, poi il processo esce con codice 1 (`NestFactory.create` con `abortOnError` di default: `ExceptionHandler` stampa l'errore e `process.exit(1)`); HTTP e WS non si aprono, nessun hook parte:

```
Revisione dei modelli, <label>: fallito (<NomeErrore>, code <N>), il boot si ferma
Revisione dei modelli, boot interrotto: passi conclusi <K> su 9, fallito «<label>», non eseguiti <M>
Revisione dei modelli: boot interrotto dal passo «<label>»
```

- La riga 349 di `BACKEND-NOTES.md` cita ancora la riga vecchia `…fallito (…), il boot prosegue`: va aggiornata dall'orchestratore.
- I passi prima di quello fallito restano applicati (sono idempotenti); quelli dopo non sono partiti. Rimedio: correggere o ripristinare, poi nuovo boot; le righe dei passi già fatti diranno `migrati 0`.
- L'errore rilanciato è nuovo e senza causa: lo stack stampato da Nest non porta quello del driver.

**Righe dei nove passi: numeri.** Sui dati dell'inventario dell'11 novembre i numeri attesi del primo e del secondo boot NON cambiano (nessuna copia non abbinata, nessun personaggio con entrambi i campi, nessuna voce con `active`). Cambia il significato dei conteggi nei casi anomali:

| Passo | Cosa cambia |
|-------|-------------|
| magie dei nemici | Un nemico con una copia non abbinata non è più in `migrati`: non è né migrato né già a posto, e ogni sua copia non abbinata conta in «senza corrispondenza». Al secondo boot ricompare con gli stessi numeri (prima il secondo boot era a zero). |
| equipaggiamento indossato | Un personaggio con entrambi i campi conta in «senza corrispondenza» (prima era in `migrati` e il campo nuovo veniva sovrascritto); ricompare a ogni boot finché non lo si cura a mano. Il controllo «entrambi i campi = 0» della prova a secco resta utile, ma non è più distruttivo se fallisce. |
| lista delle magie | Una voce con `active` booleano fuori da `status.spells` non conta più in «stati lasciati fuori»: resta nella lista. |
| lista delle magie, pet posseduti, magie dei nemici | Una scrittura non applicata (documento cambiato fra lettura e scrittura) conta 1 in «senza corrispondenza» e non è né migrata né già a posto; il boot NON si ferma. Se compare, non aprire ai client: riavviare e leggere la riga del passo a `senza corrispondenza 0`. |

**Righe WARN di dettaglio: testo.**

- Cambiata (passo delle magie): `Revisione dei modelli, lista delle magie: personaggio <id>, usi in conflitto N, equipaggiate non conosciute N [<idMagia>, …], stati lasciati fuori N [<idMagia>, …]` (una voce senza riferimento leggibile compare come `<senza riferimento>`).
- Cambiata (magie dei nemici): `Revisione dei modelli, magie dei nemici: copia senza corrispondenza «<nome>» sul nemico <id>: nemico non scritto, le copie restano`.
- Nuova (tre passi): `Revisione dei modelli, <label>: personaggio|nemico <id> cambiato durante il passo, scrittura non applicata: si ritenta al prossimo boot`.

Al primo boot sui dati reali nessuna di queste righe è attesa.

### Verifiche

- Unit: 275 suite / 3507 test (base 3501).
- Integrazione, intero progetto a blocchi sequenziali: 148 suite / 2042 test (base 2033) — 36/552, 29/421, 35/519, 48/550. Boot reale: 92 test (base 91).
- `tsc --noEmit` 0 dopo ogni GREEN; `git diff --exit-code src/schema.gql` 0 (nessun cambio di SDL).
- I casi «numeri salvati come double o long» (passi delle magie e delle magie dei nemici) provano che il confronto sul valore letto non scarta un documento per il solo tipo numerico.

### Note

- Nel GREEN di C-WR-01 è entrata anche la correzione di un caso della spec unitaria che pinnava i contatori come numeri (ora liste di id).
- `CitiesModule` popola `PointOfInterest` e `Lore` senza registrarli nel proprio `forFeature` (li dà il modulo globale; gli harness li registrano a mano): forma preesistente, non toccata.
- `PointOfInterest.city` a profondità 2 (`pointsOfInterest { city { id } }`) resta non popolato, come annotato in C-WR-06: fuori dal ruling.

---

_Fixer: Claude (gsd-code-fixer), Blocco 1, 2026-11-11_

## Blocco 2 — pet, catalogo, personaggio

Un finding = RED (`test(...)`) + GREEN (`fix(...)`); un refactor senza cambio di comportamento = un solo commit `refactor(...)` con le suite verdi prima e dopo. Lo SDL non cambia.

| Finding | Esito | Commit | Cosa cambia |
|---------|-------|--------|-------------|
| A-WR-01 | corretto | RED `931a1e9b`, GREEN `6c24da6e` | Resolver sui campi `base` ed `energy` di `Weaknesses` (`src/enemies/weaknesses.resolver.ts`) che lascia passare solo i valori dei due enum; lista assente o nulla = vuota. Il filtro è uno solo (`src/enemies/known-weaknesses.ts`) e lo usa anche il motore (`combat-context.ts`, che prima aveva la sua copia). Il resolver vive in `WeaknessesModule`, importato da `EnemiesModule`, `QuestsModule`, `QuestResultsModule` e `PendingRequestsModule`. Casi sul filo: `src/enemies/weaknesses.wire.int-spec.ts` (`enemys`, `enemy`, valore fuori enum e liste nulle scritti col driver) e un caso in `quests.resolver.int-spec.ts` (la lista `quests` non si annulla). |
| A-WR-02 | chiuso per ruling | — | Nessun cambio di codice (ruling dell'utente: i pet leggendari possono uscire dalle quest boss di rango hero). Controllato: nessun titolo di spec né commento afferma il contrario; `pet-prize.spec.ts` pinna già boss/hero → `legendary`. |
| A-WR-03 | corretto | RED `b7c44299`, GREEN `412127b5` | Un solo helper in `src/characters/pets/owned-pet-entry.ts`: `ownedPetCountOf` (numero da 0 al tetto di `Int` arrotondato per difetto, ogni altro valore 0) e `normalisedOwnedPets` (ref letto anche da stringa, numeri normalizzati, voce senza ref leggibile lasciata fuori). Lo usano il filo (`ownedPetsOnTheWire`: la voce si serve coi numeri validi, quella senza pet popolato resta fuori) e i tre punti che riscrivono l'array intero: premio del compagno (`companion-xp.ts`, quindi esiti e imboscate), pet vinto (`outcome-plan.ts`), negozio (`trade-pets.ts`). Una voce rotta guarisce alla prima riscrittura e non fa più fallire il cast dell'array a ogni tentativo. Casi sul filo in `character-updated.subscription.int-spec.ts`: query `character` e snapshot di `characterUpdated` con `xp` nullo, vita assente, valori frazionari e negativi, ref non leggibile. |
| A-IN-01 | corretto | `7df00338` (refactor) | Tabelle e primitive del loot (`GeneratedQuestType`, `LootSlot`, `LOOT_POOLS`, `RARITY_RANK`, `indexOf`) nel modulo foglia `src/quests/generation/loot-pools.ts`; `pet-prize.ts` non importa più da `generated-prizes.ts` (che riesporta i nomi per gli importatori esistenti); `import type` per `PetCandidate`. `BOSS_PET_PRIZE_CHANCE` resta definita solo in `pet-prize.ts`. |
| A-IN-02 | chiuso con motivo | — | Non banale. La lettura dei tetti prima dell'early return è voluta e pinnata («returns the pet caps even without enemies (D-17)» in `resolution-loader.service.spec.ts`): una quest `guard` non ha nemici propri e il premio del compagno sullo scontro di guardia vinto usa proprio i tetti del catalogo della quest, che `encounterCatalogOf` conserva (caso pinnato in `guard-outcome.spec.ts`). Spostare la lettura vorrebbe dire cambiare la firma del loader e chi porta i tetti nello scontro, per risparmiare una query piccola. |
| A-IN-04 | corretto | RED `f61619e4`, GREEN `7831e7cf` | Gli xp frazionari del compagno si arrotondano per difetto invece di valere 0: il premio non scrive mai sotto la parte intera già posseduta; sopra il tetto non cambia nulla. Dal GREEN di A-WR-03 la regola vive in `ownedPetCountOf` (una sola definizione). |
| A-IN-05 | corretto | `a50defc2` (refactor) | Una sola guardia `isObjectId` esportata da `src/mongo/document-id.ts` (con il suo caso unitario) al posto delle tre copie. |
| A-IN-07 | corretto | `69e94eb0` (test) | Caso «refuses a legendary pet curated in the pool with ITEM_NOT_IN_SHOP (D-05, D-27)» in `shop-transaction.service.int-spec.ts`; verde al primo colpo (pinna un comportamento già presente). |
| B-IN-04 | corretto | RED `71f82f7b`, GREEN `65c03c2a` | `state?.active` e `state?.usages` in `gm-overrides.ts`; caso con un elemento vuoto accanto a una voce senza flag. |
| B-IN-06 | corretto | `911bb28a` (refactor) | Tolto il wrapper `spellBook()` (i tre chiamanti usano `spellStatesOf`), `StoredSpellState` elenca `active`, i due commenti «slot» parlano ora del flag `active`. |
| A-IN-03, A-IN-06, A-IN-08, B-IN-01, B-IN-02, B-IN-03, B-IN-05 | chiusi per ruling | — | Non toccati: A-IN-03 è D-28 alla lettera (riga nel runbook); B-IN-03 è coperto dal Blocco 1; gli altri richiedono dati incoerenti scritti a mano a DB o sono forme già esistenti prima della fase. |

I fix di A-WR-01, A-WR-03, A-IN-04 e B-IN-04 sono di logica: coperti da un caso rosso prima e verde dopo, ma da confermare a occhio (stato «corretto, da verificare»).

### Scelte dichiarate

- **A-WR-03, valore oltre il tetto di `Int`:** un numero sopra 2^31 − 1 non è servibile sullo SDL e vale 0, come ogni altro valore non valido (il ruling dice «interi ≥ 0, altrimenti 0»).
- **A-WR-03, voce senza ref leggibile:** viene tolta dall'array alla prima riscrittura, senza log (le funzioni sono pure e non conoscono l'id del personaggio; il WARN proposto dal reviewer non è nel ruling). Finché nessuno riscrive l'array la voce resta a DB e fuori dal filo.
- **A-WR-03, ref salvato come stringa:** alla riscrittura torna `ObjectId` (prima restava stringa); il caso della spec del compagno è stato aggiornato di conseguenza, insieme alle due asserzioni d'identità «le altre voci sono lo stesso oggetto», superate dal ruling.
- **A-WR-01, harness:** nell'app il resolver vale per tutto lo schema; negli harness, che montano un modulo alla volta, vale dove il modulo importa `WeaknessesModule` (i quattro elencati).
- Nel GREEN di A-WR-03 sono entrate due correzioni delle spec del RED: un caso di `outcome-plan.spec.ts` era finito nel `describe` sbagliato (falliva per un nome non definito) e una fixture di `owned-pets.mapper.spec.ts` riceveva il valore di default al posto di «assente».
- In `quest-composition.ts` resta una seconda copia locale di `indexOf`: fuori dal finding, non toccata.

### Conteggi finali delle tre review

1 critical, 10 warning, 21 info (32 finding):

- **corretti 16:** 1 critical (C-CR-01), 9 warning (B-WR-01, C-WR-01…06, A-WR-01, A-WR-03), 6 info (A-IN-01, A-IN-04, A-IN-05, A-IN-07, B-IN-04, B-IN-06);
- **chiusi per ruling 16:** 1 warning (A-WR-02, ruling dell'utente), 15 info (A-IN-02 con motivo dal fixer, A-IN-03, A-IN-06, A-IN-08, B-IN-01, B-IN-02, B-IN-03, B-IN-05, C-IN-01…07).

### Verifiche

- Unit: 276 suite / 3534 test (base 275 / 3507).
- Integrazione, intero progetto a blocchi sequenziali: 149 suite / 2050 test (base 148 / 2042) — 36/554, 29/422, 35/520, 49/554. Boot reale: 92 test (invariato).
- `tsc --noEmit` 0 dopo ogni GREEN e a fine blocco; `git diff --exit-code src/schema.gql` 0.
- Nel range del blocco c'è anche `e67d36a1` (`docs(claude)`, solo `CLAUDE.md`): non è del fixer.

---

_Fixer: Claude (gsd-code-fixer), Blocco 2, 2026-11-11_
