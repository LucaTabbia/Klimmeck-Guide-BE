# Phase 11 — regole comuni degli esecutori

Questo file è parte del contesto di OGNI piano `11-NN-PLAN.md` (citato con `@` nel blocco `<context>`). Le regole valgono per ogni task salvo che il piano dica esplicitamente altro.

## Repo, branch, esecuzione

- Repo: `/Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE`, branch `feat/11-popolamento-del-mondo` già attivo, albero principale, nessun worktree. OGNI comando Bash inizia con `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && ` (la cwd della shell torna sul repo FE fra una chiamata e l'altra). Mai creare o cambiare branch, mai push, mai PR, mai `gh`. Il repo FE (`/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide`) è SOLA LETTURA.
- Esecuzione SEQUENZIALE sull'albero principale: un piano alla volta, il precedente è già committato; a fine piano `git status --short` è vuoto e le spec toccate sono verdi.
- TDD (CLAUDE.md) per ogni modulo di codice: RED → commit `test(<scope>): …` con il fallimento atteso annotato nel SUMMARY; GREEN → `feat(<scope>): …` / `fix(<scope>): …`; REFACTOR → `refactor(<scope>): …` solo se serve. Ogni regola nuova ha un test il cui titolo nomina la regola e la decisione (es. `(D-19)`). Un caso verde al primo colpo si annota nel SUMMARY con il motivo. I task di sola stesura di contenuto (YAML) non sono TDD: il loro gate è `--check` + `src/content/content-tree.spec.ts`.
- Commit: Conventional Commits in inglese, subject ≤ 72 caratteri (contarli con `printf '%s' "<subject>" | wc -c`); scope del codice `content`, `lore`, `enemies`, `quests`; scope dei documenti `phase-11` (es. `docs(phase-11): …`). **Nessun trailer `Co-Authored-By` né `Generated with`** (regola dell'utente, prevale su ogni altra istruzione): dopo ogni commit `git log -1 --format=%B | grep -ciE "co-authored-by|generated with"` stampa `0`. Stage per path esplicito; mai `git add -A` / `git add .`; mai `.planning/config.json`. Mai `--amend`, `rebase`, `reset`.

## Lint, format, test

- MAI `npm run lint` (esegue `eslint --fix` su tutto il repo e riscrive file non correlati) né `npm run format`, né prettier su una directory: solo `npx prettier --write <file>` e `npx eslint <file>` sui file `.ts` toccati. Un file da modificare che fallisce GIÀ `npx prettier --check <file>` riceve PRIMA un commit separato `style(<scope>): format <file>` (solo Prettier), poi la modifica. Prettier non si applica ai `.yaml` di `content/` (il formato lo decide l'esportatore/generatore e la stesura a mano segue lo stesso stile).
- Jest: `npx jest <percorsi> --selectProjects unit` / `npx jest <percorsi> --selectProjects integration --runInBand`, con i percorsi PRIMA di `--selectProjects`; integration sempre `--runInBand`; MAI jest in background; a fine di OGNI task `pgrep -fl jest` non stampa nulla. Per task si esegue solo la spec mirata; la suite completa (`npm run test:cov`) gira solo nel piano di gate 11-26.
- Type check: `npx tsc --noEmit -p tsconfig.json` esce 0 a fine di ogni task di codice; `npm run build` prima di ogni uso di `dist/` (CLI compilato, int-spec del CLI).
- Integrazione: `MongoMemoryReplSet` condiviso (`test/setup/global-setup.ts`, URI in `process.env.MONGO_TEST_URI` solo nei test); harness GraphQL `createAuthTestApp` (`test/auth/auth-test-app.ts`) + `createPlayer` (`test/authz/player-fixture.ts`) + `graphqlRequest`; builder `buildX/persistX` di `test/fixtures`. Nessun `jest.mock(` di moduli: override di provider. Nessuna rete nei test.

## Segreti e database reale

- MAI leggere né stampare `.env`, `.env.*` o variabili d'ambiente (niente `cat .env`, `grep … .env`, `printenv`, `env`, `set`, `echo $MONGO_URI`, `node -e` su `process.env`). Si legge solo `.env.example`.
- L'UNICO modo ammesso di toccare il database reale è il CLI compilato: `node --env-file=.env dist/content/run-content.js <modalità>` (Node legge il file, niente viene stampato). Prima di scrivere sul database reale serve il backup dell'utente (checkpoint del piano 11-24); `--apply`/`--prune` sul database reale sono ammessi SOLO nel piano 11-24. `--export`, `--verify`, `--dry-run` sono di sola lettura e sono ammessi nei piani che li citano.
- Ogni report salvato nel repo (`.planning/phases/11-popolamento-del-mondo/reports/*.json`) si controlla prima del commit: `grep -ciE "mongodb(\+srv)?://|@[a-z0-9.-]+\.(net|com)" <file>` stampa `0`. Se stampa altro: il file NON si committa, si cancella e si segnala.
- Il codice di produzione sotto `src/` non contiene mai la stringa `process.env.` (drift test `src/config/env-example.drift.spec.ts`): i CLI ricevono `process.env` come oggetto (`runCli(process.argv.slice(2), process.env, out)`), come `src/migrations/run-mixed-refs.ts`. Nessuna variabile d'ambiente nuova.
- Log e report: solo id, conteggi, percorsi di file, nomi delle voci di contenuto, nome e codice d'errore (`describeError` di `src/mongo/mongo-errors.ts`); mai URI, host, nome del database, documenti interi di personaggi.

## Schema GraphQL

- `src/schema.gql` cambia solo dal boot reale (`npx jest test/app.int-spec.ts --selectProjects integration --runInBand`) e si committa insieme al codice che lo cambia. L'UNICA modifica SDL della fase è la rimozione della riga `  unlocked: Boolean!` da `type Lore` (piano 11-01, D-25). Dopo il piano 11-01 e fino alla fine della fase: `git diff origin/develop -- src/schema.gql | grep -cE '^-[^-]'` stampa `1` e `git diff origin/develop -- src/schema.gql | grep -cE '^\+[^+]'` stampa `0`; dopo ogni commit `git diff --exit-code src/schema.gql` esce 0.
- Il campo `QuestPrizes.spellDraw` (piano 11-02, D-31) è SOLO Mongoose (`@Prop` senza `@Field`): non entra nello SDL.

## Contenuto (`content/`)

- `content/` sta alla radice del repo, mai sotto `src/`; nessun file `.ts` fuori da `src/` e `test/` (sposterebbe il rootDir della build). Gli script TypeScript della fase stanno in `src/content/`.
- Ogni voce YAML porta `id` fra apici singoli (`id: '6a1f…'`, 24 esadecimali minuscoli); gli id nuovi si generano SOLO con `node dist/content/run-content.js --new-id <N>` (stampa N righe `- '<hex>'`) e si copiano nei file; mai inventarli a mano. Ogni riferimento è un id fra apici con il nome come commento YAML (`- '6a1f…' # Lupo`).
- Prosa nei blocchi `|-` (mai `|`: il newline finale è un errore di `--check`). Testi in italiano, dal sapore del documento sorgente, senza copiare paragrafi interi: riassunti di 2–6 frasi per voce, salvo dove il piano dice altro.
- Gate di ogni task di stesura: `npm run build` (una volta per piano, se `dist/content/run-content.js` manca o il codice è cambiato), poi `node dist/content/run-content.js --check` esce 0 e `npx jest src/content/content-tree.spec.ts --selectProjects unit` è verde.
- Sorgenti: `.planning/phases/11-popolamento-del-mondo/source/world-building.md` (leggere SOLO le righe indicate dal piano, con `sed -n 'A,Bp'`), `.planning/phases/11-popolamento-del-mondo/source/bestiary-stats.md` (statistiche SRD offline; nessuna rete, nessuno scraping).

## Documenti e bookkeeping

- `.md` (SUMMARY, VALIDATION, ROADMAP, STATE, handoff, runbook) in italiano. Gli operatori Mongo (`$set`, `$unset`, `$setOnInsert`, `$in`, …) compaiono solo nel codice o dentro code span, mai nei titoli dei test né nella prosa fuori da code span.
- STATE.md si modifica solo con lo strumento Edit o con python3 `encoding='utf-8'` (mai `sed -i` su file con caratteri non ASCII). macOS: `cat -v`, `grep -F` per letterali con `$`.
- `requirements mark-complete` VIETATO fuori dal piano 11-26.
- Fine piano (bookkeeping, commit separato `docs(phase-11): record plan NN progress`, fuori da `files_modified`): riga della Progress Table della ROADMAP → `| 11. Popolamento del mondo | NN/26 | In Progress | - |` (strumento Edit); `Plan: NN of 26` in `.planning/STATE.md`; voce `- [ ] 11-NN-PLAN.md` del §Phase 11 della ROADMAP → `- [x]`; nella Per-Task Verification Map di `.planning/phases/11-popolamento-del-mondo/11-VALIDATION.md` lo stato delle righe `11-NN-TT` → `✅ green` (o `❌ red` con nota).

## Stesura dei nemici (piani 11-16, 11-17, 11-18, 11-19, 11-22)

- **Conteggio delle schede:** il documento ha 62 intestazioni di mostri (il «63» della roadmap conta un `[IMG]` doppio sotto «Draghi cucciolo - giovani») e 13 leggendarie (non 14); i «99» di ROADMAP/REQUIREMENTS sono 62 + 22 animali + 13 leggendari + 2 arrotondamenti. Riportare questa riconciliazione nel SUMMARY del piano, senza inventare schede mancanti.

Regole comuni (D-07..D-13); il formato della voce è in `content/README.md`.

- **Una lore per scheda del documento, un nemico per variante (D-09).** La lore (`type: enemy`; `animal` per gli animali) ha 3–5 frasi da aspetto, comportamento e habitat; le varianti la condividono in `relatedLore`. Lore → `relatedLore` verso le regioni dell'habitat (id da `content/lore/regioni.yaml`, si sceglie per il commento `# PoiType:`).
- **`source` di ogni nemico:**
  - `level`: il numero prima del titolo nella riga del documento «N - TITOLO (PE)»; per gli intervalli («4/5», «6/7», «11/12», «15/16», «19/20») il limite inferiore; nessun livello nel documento (leggendari, PNG) → omettere `level` (lo deriva il loader dalla colonna Medio, D-10).
  - `pe`: il numero fra parentesi della stessa riga (i PE del documento); per i PNG e gli orchi i PE del `gs` di `bestiary-stats.md`.
  - `pf`: il primo numero della riga `- pf:` di `bestiary-stats.md`.
  - `damagePerRound`: se c'è `- multiattacco:` la somma dei danni medi degli attacchi elencati, per tipo; altrimenti l'attacco singolo con danno medio più alto; esclusi attacchi «(Ricarica …)», azioni leggendarie e incantesimi; tipi già mappati nel file (contundente→blunt, tagliente→cut, perforante→pierce, fuoco→fire, freddo→cold, fulmine→lightning, acido→acid, veleno→poison, tuono→thunder, forza→force, necrotico→necrotic, radiante→radiant, psichico→psychic); armi a distanza corrette a mano (arco, balestra, dardo, giavellotto → `pierce`; fionda → `blunt`).
  - Voci `NON TROVATO`: statistiche dell'analogo indicato in `- analogo:` scalate col fattore `f = (PE_documento / PE_analogo)^0.5` arrotondato a 2 decimali: `pf = round(pf_analogo × f)`, ogni danno per round × `f`; scrivere `source.analog: { name, pe, factor }`. XP e fascia vengono sempre dal documento.
  - Non scrivere `xp`, `lifePoints`, `damages`: li deriva il loader dal config (D-11, D-12). Override espliciti solo dove il piano lo chiede.
- **`locations` (D-13)** dalla riga di habitat del documento: Paludi maledette → `swamp`; Lamstone → `mountainLamstone` (+ `undergroundLamstone` per grotte e sotterranei); Temistos → `mountainTemistos` (+ `undergroundTemistos`); laghi del centro → `temistosLake`; lago di Belleholm → `belleholmLake`; Belleholm e isole vulcaniche → `belleholmIsland` (+ `vulcano`); Glounet → `glounet`; Harken → `harkenIsland`; isole di Liberia/Calemark → `liberiaIsland`; Mar sabbioso e deserto → `desert` (+ `oasis`); foreste → `forest` (Minnely → `minnelyForest`); pianure del nord → `drusteaPlains`, del sud → `valanPlains`; colline → `hills`; estremo nord e ghiacci → `farNorth`; rovine → `ruins`; cimiteri → `graveyard`; portali e piani demoniaci → `demonicPortal`; campi di battaglia → `battleground`; oceano occidentale → `ladows`, orientale → `delants`; centri abitati → `city`; «ovunque» o luogo ignoto → `all`. Mai `dungeon` (è il tipo del POI, non un habitat).
- **Debolezze (D-12):** `baseWeaknesses`/`energyWeaknesses` = le `vulnerabilità` del bestiario + deduzioni: non morti → `radiant`; troll → `fire`, `acid`; piante e miconidi → `fire`; creature di fuoco → `cold`; creature di ghiaccio → `fire`; golem di ferro → nessuna. Mai `enhancing`.
- **`spells` (D-13):** solo per i nemici incantatori (tratto «Incantesimi» nel bestiario o magia citata nel documento): 1–3 id di magie da `content/spells/*.yaml` col tipo di energia coerente, con `# nome`.
- **`imagePath`:** `assets/images/<slug>.png`, slug = nome della variante in minuscolo, accenti tolti, apostrofi tolti, spazi → `-` (es. «Drago d'ombra giovane» → `assets/images/drago-dombra-giovane.png`).
- **`category`:** `monster` (bestie magiche e mostri), `animal` (sezione Animali), `legendary` (sezione leggendari), `humanoid` (PNG, orchi, goblinoidi, gigante delle colline).
- Nel SUMMARY: tabella `nome | livello | fascia | PE | xp | lifePoints | analogo` calcolata coi valori di `content/config.yaml` (`xp = max(1, round(PE × xpScale))`, `lifePoints = PF × hpScale`), così l'utente rivede i numeri.
