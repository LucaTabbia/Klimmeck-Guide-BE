---
phase: 19-revisione-dei-modelli
fixed_at: 2026-11-11T10:07:11Z
review_path: .planning/phases/19-revisione-dei-modelli/19-REVIEW-RULINGS.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 19: Code Review Fix Report

**Sorgente:** `19-REVIEW-RULINGS.md` (ruling su `19-REVIEW-A.md`, `19-REVIEW-B.md`, `19-REVIEW-C.md`)
**Iterazione:** 1

I conteggi del frontmatter valgono per il solo Blocco 1; il Blocco 2 lo aggiunge il secondo fixer.

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
