# Runbook — caricamento del contenuto del mondo (Phase 11, D-26)

Runbook dell'utente per caricare e ricaricare nel database il contenuto del mondo di Klimmeck (lore, magie, equipaggiamenti, loot, nemici, pet, quest fisse) scritto nei file di `content/`. Lo script è `src/content/run-content.ts`, compilato in `dist/content/run-content.js`; il generatore delle quest fisse è `src/content/run-generate-quests.ts` (`dist/content/run-generate-quests.js`). Il formato dei file è in `content/README.md`.

Il primo caricamento sul database unico è stato fatto nel piano 11-24 (2026-11-02, report in `.planning/phases/11-popolamento-del-mondo/reports/11-24-*.json`): questo runbook serve per le ricariche successive e per un eventuale ambiente separato.

Ogni comando che tocca il database stampa **una riga JSON** con soli id, nomi delle voci e conteggi (mai URI, host o nome del database). I comandi usano solo placeholder: `<uri>`, `<db>`, `<cartella>`, `<file env>`.

## Perché

- I file di `content/` sono la **fonte di verità** del catalogo (D-04): ciò che si vuole nel database si scrive nei file, mai a mano con mongosh. Un documento cambiato a mano viene riportato al valore del file alla prima `--apply`.
- Il CLI carica le voci per `_id` (D-01): ogni voce porta il suo `id` e i riferimenti fra voci sono id. Inserisce le voci nuove, aggiorna quelle cambiate, lascia intatte quelle uguali.
- Il CLI **non cancella mai** nulla senza `--prune <collezione>` (D-05): i documenti presenti nel database e assenti dai file sono elencati come `orphans` e basta. Le correzioni puntuali (tipi dei POI, rinomine, quest di prova) sono dichiarate in `content/fixes/` e applicate da `--apply` (D-06).
- Le quest fisse non si scrivono a mano: le genera `npm run content:generate-quests` dal mondo, dal catalogo e da `content/config.yaml`, con un seme fisso (stessi file a ogni corsa, id stabili).

## Prerequisiti

- **Node 22** (`node --version`), necessario per l'opzione `--env-file`.
- Strumenti `mongodump`, `mongorestore` e `mongosh` installati.
- La build del backend, dalla radice del repo:

    ```bash
    npm ci && npm run build
    ls dist/content/run-content.js
    ```

- Un file d'ambiente **fuori dal repo** (mai committato, mai stampato né copiato nei report) con le sole chiavi `MONGO_URI` e `DB_NAME`, nella forma:

    ```bash
    MONGO_URI=<uri>
    DB_NAME=<db>
    ```

    Gli script npm `content:dry-run`, `content:verify` e `content:apply` usano il `.env` della radice del repo; per un altro database si usa il comando `node --env-file=<file env> …` di questo runbook.

- **Il backend che serve il database gira con il codice della Phase 11** (branch `feat/11-popolamento-del-mondo` o la sua merge): popola `relatedLore` scartando i riferimenti orfani e non espone più `Lore.unlocked`. Un backend su un codice precedente risponde `data: null` alle liste `lores`/`enemys` del contenuto nuovo (Pitfall 1).
- **L'app FE già rilasciata non seleziona più `unlocked`** nella query delle lore (quick task FE richiesto prima della merge della PR BE, vedi `BACKEND-NOTES.md` della fase).

## Sequenza sul database unico (oggi)

Esiste un solo database (D-26): gli `_id` nei file sono quelli reali. Ogni passo si esegue solo se il precedente è andato a buon fine; conservare i report JSON.

1. **Controllo offline dei file** (nessun database):

    ```bash
    npm run content:check
    ```

    Atteso: exit 0. Gli `errors` vanno corretti nei file; i `warnings` si leggono (oggi uno solo: il titolo doppio di una dungeon di Necrorian).

2. **Backup** (obbligatorio prima di ogni scrittura: `--apply` non ha un annullamento):

    ```bash
    mongodump --uri "<uri>" --out <cartella>
    ```

3. **Verifica di sola lettura**:

    ```bash
    node --env-file=<file env> dist/content/run-content.js --verify
    ```

    Exit 1 è atteso se i file contengono novità (voci da inserire o modificare, fix `pending`). Leggere:
    - `errors`: devono essere vuoti (o riguardare solo valori del database che un fix dichiarato corregge);
    - `probableIdDivergence`: **se non è vuoto, fermarsi**. Significa che nel database c'è una voce con lo stesso nome e tipo di una voce dei file ma con un altro `_id`: caricare creerebbe un doppione. Si corregge l'`id` nel file (o si chiarisce quale delle due voci tenere) prima di andare avanti;
    - `fixes`: nessuno deve essere `blocked` (vedi «Codici d'uscita e report»).

4. **Anteprima** delle scritture (nessuna scrittura):

    ```bash
    node --env-file=<file env> dist/content/run-content.js --dry-run
    ```

    Atteso: exit 0; i conteggi `inserted`/`modified` sono quelli che l'apply scriverà.

5. **Scrittura**:

    ```bash
    node --env-file=<file env> dist/content/run-content.js --apply
    ```

    Atteso: exit 0, con gli stessi conteggi del dry-run e i fix `applied`.

6. **Verifica dopo la scrittura**:

    ```bash
    node --env-file=<file env> dist/content/run-content.js --verify
    ```

    Atteso: **exit 0**, `inserted: 0` e `modified: 0` in ogni collezione, `cities.relatedLore.modified: 0` con `missing: []`, fix tutti `done`.

7. **Seconda scrittura (prova d'idempotenza)**:

    ```bash
    node --env-file=<file env> dist/content/run-content.js --apply
    ```

    Atteso: exit 0 con `inserted: 0` e `modified: 0` ovunque.

**Nota (Pitfall 3):** la prima `--apply` dopo un export può riportare come «modificati» documenti che nei file non sono cambiati: i documenti scritti a suo tempo con mongosh hanno numeri salvati come double invece che int32 o le chiavi in un altro ordine, e il caricatore li riscrive nella forma canonica. È atteso e succede una volta sola (nel piano 11-24: 12 lore, 4 equipaggiamenti, 4 loot, 1 nemico).

## Ricaricare dopo modifiche ai file

Dopo aver cambiato un file di `content/` (una lore, un prezzo, un nemico, un'immagine):

```bash
npm run build
npm run content:check
mongodump --uri "<uri>" --out <cartella>
node --env-file=<file env> dist/content/run-content.js --dry-run
node --env-file=<file env> dist/content/run-content.js --apply
node --env-file=<file env> dist/content/run-content.js --verify
```

Il dry-run deve riportare solo le voci che si volevano cambiare; il verify finale esce 0.

**Quest fisse:** i file `content/quests/*.yaml` sono scritti dal generatore e una modifica a mano si perde alla corsa successiva. Le modifiche durevoli si fanno in `content/config.yaml` (premi, tempi, quote delle hunt, fasce) o nel generatore (`src/content/generation/`, con i suoi test), poi:

```bash
npm run build
npm run content:generate-quests
npm run content:check
```

e la ricarica come sopra. Rigenerare sugli stessi file senza cambiare nulla produce un diff vuoto; gli id delle quest esistenti restano gli stessi (chiave tipo + marker).

## Immagini

1. Caricare le immagini su Cloudinary.
2. Compilare `content/images.yaml`: nelle sezioni `lore`, `enemies` e `pets` una voce `{ id, url }` per immagine, con l'`id` della voce e l'URL `https://res.cloudinary.com/…` (commento col nome accanto all'id, come negli altri file).
3. Stesso ciclo della ricarica: `npm run content:check`, backup, `--dry-run`, `--apply`, `--verify`.

`--apply` scrive `Lore.image`, `Enemy.imagePath` e `Pet.imagePath`; fino ad allora le lore hanno `image: null` e nemici e pet il percorso provvisorio `assets/images/<slug>.png` (D-24).

## Ambiente separato futuro

Oggi non esiste (D-26). Se un giorno ci sarà un database separato (staging, produzione nuova), gli `_id` dei file devono coincidere con quelli di quel database: città, POI e catalogo esportato vengono dal database unico di oggi.

1. Backup del database di partenza e **restore del dump in una copia** (mai la destinazione finale):

    ```bash
    mongodump --uri "<uri di partenza>" --out <cartella>
    mongorestore --uri "<uri della copia>" <cartella>
    ```

2. **`--verify` sulla copia PRIMA di qualunque `--apply`**:

    ```bash
    node --env-file=<file env della copia> dist/content/run-content.js --verify
    ```

    I segnali di id divergenti sono `probableIdDivergence` non vuoto e città mancanti (`cities.relatedLore.missing` non vuoto, warning «snapshot non allineato» su città e POI): in quel caso fermarsi, il database non viene dallo stesso dump dei file.

3. Sulla copia la sequenza completa (`--dry-run`, `--apply`, `--verify` a exit 0, seconda `--apply` a zero modifiche).
4. Sull'ambiente di destinazione la stessa sequenza del paragrafo «Sequenza sul database unico», backup compreso.
5. Allegare alla PR i report JSON di `--verify` della copia e della destinazione.

## Prune

`--prune <collezione>` è una modalità a sé (non si combina con `--apply`) e **cancella** gli orfani di una sola collezione: i documenti presenti nel database e assenti dai file.

```bash
node --env-file=<file env> dist/content/run-content.js --verify
mongodump --uri "<uri>" --out <cartella>
node --env-file=<file env> dist/content/run-content.js --prune <collezione>
```

- Eseguirlo solo dopo aver letto gli `orphans` di quella collezione nel report di `--verify` e aver deciso che vanno davvero cancellati (per tenere una voce basta riportarla in un file).
- Collezioni ammesse: `lore`, `spells`, `equipmentitems`, `lootitems`, `enemies`, `pets`, `quests`.
- **Quest:** sono orfane solo le quest fisse (heal, job, guard, crime, study, hunt, dungeon) non concluse; quest generate, aid, story e worldMission non lo sono mai. Una quest tenuta da un personaggio (pending, corsia occupata, aiuto in attesa) non si cancella: finisce in `blocked` e il comando esce 1.
- Un albero con errori di `--check` non cancella nulla.

## Rollback

Ripristinare il dump fatto prima della scrittura, **solo per le collezioni toccate dal caricamento**, così il resto del database (personaggi, utenti, risultati) non torna indietro:

```bash
mongorestore --uri "<uri>" --drop \
  --nsInclude '<db>.lore' \
  --nsInclude '<db>.enemies' \
  --nsInclude '<db>.pets' \
  --nsInclude '<db>.spells' \
  --nsInclude '<db>.equipmentitems' \
  --nsInclude '<db>.lootitems' \
  --nsInclude '<db>.quests' \
  --nsInclude '<db>.pointsofinterest' \
  --nsInclude '<db>.cities' \
  --nsInclude '<db>.pendingquests' \
  <cartella>
```

`pointsofinterest`, `cities` e `pendingquests` ci sono per i fix (tipi dei POI, rinomina di Kliever, `relatedLore` delle città, pending delle quest di prova cancellate). Il ripristino perde le scritture successive al backup su quelle collezioni (per esempio pending accettate nel frattempo). Dopo il rollback il backend deve tornare al codice compatibile con quei dati.

## Codici d'uscita e report

| Exit | Significato |
| --- | --- |
| 0 | esecuzione riuscita: `--check` senza errori; `--dry-run`/`--apply` senza errori né fix `blocked`; `--verify` senza differenze; `--prune` senza errori né quest bloccate |
| 1 | `--check` con errori; `--verify` con differenze (voci da inserire o modificare, `relatedLore` da allineare, fix `pending`), errori o fix `blocked`; `--dry-run`/`--apply` con errori o fix `blocked`; `--prune` con errori o quest bloccate |
| 2 | uso errato: nessuna modalità o più di una, modalità sconosciuta, `MONGO_URI` o `DB_NAME` mancanti (nessuna connessione), cartella di `--export` non vuota |
| 3 | errore durante l'esecuzione (connessione, permessi, rete): la riga JSON contiene solo nome e codice dell'errore |

Il report di `--dry-run`, `--apply` e `--verify` ha le chiavi `mode`, `collections`, `cities`, `fixes`, `errors`, `warnings`, `probableIdDivergence`. Per ogni collezione:

| Campo | Significato |
| --- | --- |
| `inserted` | voci dei file assenti dal database (inserite da `--apply`, da inserire negli altri modi) |
| `modified` | voci presenti ma diverse dal file (riscritte da `--apply`) |
| `unchanged` | voci identiche al file |
| `orphans` | documenti del database assenti dai file (`{ id, name }`): solo elencati, mai cancellati senza `--prune` |
| `fixes` | documenti toccati dai fix dichiarati per quella collezione |
| `errors` | problemi di quella collezione |

`cities.relatedLore` riporta `modified`, `unchanged` e `missing` (città dei file assenti dal database). Ogni voce di `fixes` ha `key`, `kind`, `status` e `touched` (documenti che cambierebbero o che sono cambiati); gli stati sono:

| Stato | Significato |
| --- | --- |
| `pending` | c'è qualcosa da fare (`--dry-run`, `--verify`) |
| `applied` | scritto ora da `--apply` |
| `done` | niente da fare: il database è già allineato |
| `blocked` | non si può fare senza rischio (per esempio una quest da cancellare tenuta da un personaggio: `blocked` elenca quest, pending, personaggio e corsia); va liberato prima dell'apply |

`probableIdDivergence` elenca `{ collection, id, name, type }` dei documenti orfani che hanno nome e tipo uguali a una voce dei file: è il segnale di id divergenti fra file e database e blocca la sequenza. In errore la riga è `{"error": "<nome o codice dell'errore>"}`.
