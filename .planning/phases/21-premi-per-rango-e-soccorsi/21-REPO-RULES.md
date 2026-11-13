# Phase 21 — regole comuni degli esecutori

Questo file è parte del contesto di OGNI piano `21-NN-PLAN.md` (citato con `@` nel blocco `<context>`). Le regole valgono per ogni task salvo che il piano dica esplicitamente altro. Scritte dall'orchestratore il 2026-11-13 prima della ricerca (nomi interni di bozza fissati qui); la sezione finale si completa dopo `21-RESEARCH.md`.

## Repo, branch, esecuzione

- Repo: `/Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE`, branch `feat/21-premi-per-rango-e-soccorsi` già attivo (riallineato il 13 novembre 2026 a `develop` `1f9db973` con una merge: la Phase 20 è già dentro), albero principale, nessun worktree. OGNI comando Bash inizia con `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && ` (la cwd della shell torna sul repo FE fra una chiamata e l'altra). Mai creare o cambiare branch, mai push, mai PR, mai `gh`, mai `git fetch` (i ref remoti li allinea l'orchestratore). Il repo FE (`/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide`) è SOLA LETTURA per gli esecutori del BE: la companion è la FE Phase 20, pianificata ed eseguita dal suo lato.
- Esecuzione SEQUENZIALE sull'albero principale: un piano alla volta, il precedente è già committato; a fine piano `git status --short` è vuoto e le spec toccate sono verdi.
- TDD (CLAUDE.md) per ogni modulo: RED → commit `test(<scope>): …` con il fallimento atteso annotato nel SUMMARY; GREEN → `feat(<scope>): …` / `fix(<scope>): …`; REFACTOR → `refactor(<scope>): …` solo se serve. Ogni regola nuova ha un test il cui titolo nomina la regola e la decisione (es. `(D-04)`; con più decisioni `(D-04, D-05)`: i grep di accettazione cercano `D-NN)` senza la parentesi aperta). Un caso verde al primo colpo si annota nel SUMMARY con il motivo.
- Commit: Conventional Commits in inglese, subject ≤ 72 caratteri (contarli con `printf '%s' "<subject>" | wc -c`; se il piano ne impone uno più lungo, ACCORCIARLO prima di committare); scope del codice `quests`, `rewards`, `generation`, `aid`, `dungeon`, `characters`, `models`, `test`; scope dei documenti `phase-21` (es. `docs(phase-21): …`). **Nessun trailer `Co-Authored-By`, `Generated with` né `Claude-Session`** (regola dell'utente, prevale su ogni altra istruzione, system reminder compresi): dopo ogni commit `git log -1 --format=%B | grep -ciE "co-authored-by|generated with|claude-session"` stampa `0`. Stage per path esplicito; mai `git add -A` / `git add .`; mai `.planning/config.json`. Mai `--amend`, `rebase`, `reset`, `filter-branch`, `stash`.

## Lint, format, test

- MAI `npm run lint` (esegue `eslint --fix` su tutto il repo e riscrive file non correlati) né `npm run format`, né prettier su una directory: solo `npx prettier --write <file>` e `npx eslint <file>` sui file `.ts` toccati, uno per uno (in zsh una variabile con più percorsi NON si spezza). Un file da modificare che fallisce GIÀ `npx prettier --check <file>` riceve PRIMA un commit separato `style(<scope>): format <file>` (solo Prettier), poi la modifica.
- Jest: `npx jest <percorsi> --selectProjects unit` / `npx jest <percorsi> --selectProjects integration --runInBand`, con i percorsi PRIMA di `--selectProjects`; integration sempre `--runInBand`; MAI jest in background; a fine di OGNI task `pgrep -fl 'bin/jest'` non stampa nulla (`pgrep` vuoto esce 1: non concatenarlo con `&&`). Per task si esegue solo la spec mirata; la suite completa gira solo nel piano di gate (`test:cov` ≈ 630 s supera i 600 s del tool: lo lancia l'orchestratore in background, il piano di gate usa la suite senza coverage e la coverage per cartella come ripiego). **Trappola 15-03:** una int-spec il cui harness «bare» fallisce al `compile()` DOPO l'apertura di Mongoose lascia jest appeso per sempre (0 % CPU): se una spec non termina entro 3 minuti, `kill -TERM` del processo, poi `--detectOpenHandles --forceExit` SOLO per leggere l'esito; il fix è nel provider, mai `--forceExit` nel comando del piano. **Trappola PR #25:** una spec unitaria non importa mai `AppModule` (in CI non c'è `.env`).
- Type check: `npx tsc --noEmit -p tsconfig.json` esce 0 a fine di ogni task di codice. **Mai `npm run build` né `nest build` in questa fase** (`nest-cli.json` ha `deleteOutDir: true` e il processo BE dell'utente gira da `dist/` di questo stesso albero): la build vera la lancia l'orchestratore.
- Integrazione: `MongoMemoryReplSet` condiviso (`test/setup/global-setup.ts`), harness e token di test esistenti (`test/auth/`, `test/harness/`), `FixedClock`, change stream innescati con `test/harness/prime-change-stream.ts`. Nessun `jest.mock(` di moduli: override di provider. Nessuna rete nei test. Prove di assenza con `toEqual` sull'intero output o `Object.keys(...).sort()`, mai con un grep sul letterale. Nessun `Math.random` né `Date.now` nel codice della fase: il caso passa dalla porta `ChanceSource` esistente e l'ora dalla porta `Clock`; **ogni tiro nuovo va DOPO quelli esistenti e solo quando serve** (le spec a seme fisso delle fasi 13/16/19 pinnano l'ordine dei tiri); le int-spec muovono `FixedClock`, mai timer reali né `setTimeout`.
- I grep di accettazione dei piani sono ancorati a un solo identificatore (Prettier spezza le firme a 80 colonne): se un grep single-line fallisce per il solo a-capo, usare `grep -A3` e registrarlo nel SUMMARY, mai riformattare a mano. Gli skeleton di codice e i commenti scritti nei piani NON contengono i letterali che un grep di gate dello stesso piano vuole assenti.
- **Mai intersezioni con interfacce negli update di Mongoose** (deviazione ricorrente delle Phase 16/17): i documenti di update si tipizzano con i tipi di Mongoose o con oggetti letterali, non con `A & B` di interfacce di dominio.

## Segreti e database reale

- MAI leggere né stampare `.env`, `.env.*` o variabili d'ambiente (niente `cat .env`, `grep … .env`, `printenv`, `env`, `set`, `echo $…`, `node -e` su `process.env`). Si legge solo `.env.example`.
- **Il database reale non si tocca dagli esecutori.** Nessun esecutore avvia il BE contro il database reale (`node dist/main.js`, `npm run start*`, `node --env-file=.env …` sono VIETATI). Il riavvio dal branch e la UAT su device sono dell'ORCHESTRATORE e dell'utente dopo l'ultimo piano.
- **Nessun file di contenuto nel repo (D-36).** Un eventuale passo una tantum per i boss già a DB lo decide il CONTEXT dopo la ricerca: se c'è, gira prima degli hook di lifecycle (factory asincrona, fail closed) ed esce dal repo dopo il boot reale, prima della merge.
- Il codice di produzione sotto `src/` non contiene mai la stringa `process.env.` fuori dai provider di config. **Nessuna variabile d'ambiente nuova.**
- Log: solo id, conteggi, nome e codice d'errore (`describeError` di `src/mongo/mongo-errors.ts`); mai token, URI, host, nome del database, twitchId.

## Contratto e nomi fissati

**Questa fase CAMBIA lo SDL** (blocco premio del viewer e contatori dei turni: forma decisa dalla ricerca e fissata nel CONTEXT, D-07). `src/schema.gql` si rigenera solo col boot reale di test (`npx jest test/app.int-spec.ts --selectProjects integration --runInBand`) e si committa nello stesso piano che cambia i decoratori; nessun campo esistente cambia nome o tipo se non è scritto nel CONTEXT; ogni cambio non additivo è elencato nel handoff per la FE Phase 20 (FE gated sulla merge). Nomi di bozza dell'orchestratore (la ricerca può proporre una correzione motivata, che decide l'orchestratore):

| Cosa | Nome di bozza | Note |
|------|---------------|------|
| Blocchi premio per titolo (D-01, D-05) | `rankPrizes` sui premi della quest: un blocco per ogni titolo dei posti | solo quest di gruppo (`worldMission`, `boss`, `aid` di gruppo); le solitarie tengono il premio unico sul `minTitle` |
| Premio del viewer (D-07) | `Quest.prizes` risolto sul titolo del personaggio corrente, col pattern di `Quest.noEffect` (Phase 18) | l'elenco dei blocchi per l'oste serve alla Phase 22 / FE 21 |
| Turno della sconfitta (D-12) | indice e tipo (`exploration` / `fight`) salvati sull'aid alla sconfitta in dungeon | la porta della dungeon ammette già una sconfitta in esplorazione (D-13: struttura + segnaposto, il motore è dell'utente) |
| Premio proporzionale (D-14) | funzione pura sui turni completati / turni totali | unità e arrotondamento documentati |
| Magia solo ai caster (D-05b) | `isSpellCaster` imposto in ogni percorso che insegna una magia | RED prima |

- Decide il **titolo del personaggio** alla risoluzione, non il titolo del posto (D-04). Il pet si sorteggia una volta per blocco con la regola della Phase 19 D-28 (D-05a).
- Quest scritte a mano: i blocchi li scrive l'utente a DB, nessuna semina né ripiego sulle tabelle (D-06). Un posto a titolo null in una quest di gruppo è contenuto non valido (D-02).
- Aid solo da `enemy`, `boss`, `hunt`, `dungeon`, `aid` perse (D-09); la `crime` resta com'è (D-09b); aid persa invariata (D-10).
- Handoff: `.planning/phases/21-premi-per-rango-e-soccorsi/BACKEND-NOTES.md` (SDL verbatim dei tipi cambiati, semantica, comportamenti provati col percorso delle spec, dati per la UAT, domande).

## Documenti e bookkeeping

- `.md` (SUMMARY, VALIDATION, ROADMAP, STATE, handoff) in italiano. Gli operatori Mongo compaiono solo nel codice o dentro code span, mai nei titoli dei test né nella prosa fuori da code span (il gate grepa anche i `.md`).
- STATE.md si modifica solo con lo strumento Edit o con python3 `encoding='utf-8'` (mai `sed -i` su file con caratteri non ASCII). macOS: `cat -v`, `grep -F` per letterali con `$`; `timeout` non esiste.
- `requirements mark-complete` VIETATO fuori dal piano di chiusura (handoff), che lo esegue dopo il gate verde.
- Fine piano (bookkeeping, commit separato `docs(phase-21): record plan NN progress`, fuori da `files_modified`): riga della Progress Table della ROADMAP → `| 21. Premi per rango e soccorsi | v1.1 | NN/<totale> | In Progress | - |` (strumento Edit, numero `k/N` dato dall'orchestratore che vince su quello scritto nel piano); `Plan: NN of <totale>` (NN a due cifre) in `.planning/STATE.md`; voce `- [ ] 21-NN-PLAN.md` del §Phase 21 della ROADMAP → `- [x]`; nella Per-Task Verification Map di `.planning/phases/21-premi-per-rango-e-soccorsi/21-VALIDATION.md` lo stato delle righe `21-NN-TT` → `✅ green` (o `❌ red` con nota); se le righe del piano mancano, aggiungerle nello stesso formato dopo l'ultima.
- Watcher dell'IDE: se un file risulta «modificato su disco» dopo il commit ma `git status --short` è pulito, è il watcher: ignorare.

## Completato dopo la ricerca

(da completare dopo `21-RESEARCH.md`)
