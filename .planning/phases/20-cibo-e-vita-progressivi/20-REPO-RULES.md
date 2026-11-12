# Phase 20 — regole comuni degli esecutori

Questo file è parte del contesto di OGNI piano `20-NN-PLAN.md` (citato con `@` nel blocco `<context>`). Le regole valgono per ogni task salvo che il piano dica esplicitamente altro. Scritte dall'orchestratore il 2026-11-12 prima della ricerca (nomi interni fissati qui); la sezione finale si completa dopo `20-RESEARCH.md`.

## Repo, branch, esecuzione

- Repo: `/Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE`, branch `feat/20-cibo-e-vita-progressivi` già attivo (riallineato il 12 novembre 2026 a `develop` `fbce3e16` con una merge: la Phase 19 e i quick task successivi sono già dentro; il CONTEXT dice ancora «impilato sulla 19»: oggi il ramo parte da `develop`), albero principale, nessun worktree. OGNI comando Bash inizia con `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && ` (la cwd della shell torna sul repo FE fra una chiamata e l'altra). Mai creare o cambiare branch, mai push, mai PR, mai `gh`, mai `git fetch` (i ref remoti li allinea l'orchestratore). Il repo FE (`/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide`) è SOLA LETTURA: questa fase non ha companion FE.
- Esecuzione SEQUENZIALE sull'albero principale: un piano alla volta, il precedente è già committato; a fine piano `git status --short` è vuoto e le spec toccate sono verdi.
- TDD (CLAUDE.md) per ogni modulo: RED → commit `test(<scope>): …` con il fallimento atteso annotato nel SUMMARY; GREEN → `feat(<scope>): …` / `fix(<scope>): …`; REFACTOR → `refactor(<scope>): …` solo se serve. Ogni regola nuova ha un test il cui titolo nomina la regola e la decisione (es. `(D-02)`; con più decisioni `(D-02, D-03)`: i grep di accettazione cercano `D-NN)` senza la parentesi aperta). Un caso verde al primo colpo si annota nel SUMMARY con il motivo.
- Commit: Conventional Commits in inglese, subject ≤ 72 caratteri (contarli con `printf '%s' "<subject>" | wc -c`; se il piano ne impone uno più lungo, ACCORCIARLO prima di committare); scope del codice `travel`, `ambush`, `quests`, `characters`, `models`, `test`; scope dei documenti `phase-20` (es. `docs(phase-20): …`). **Nessun trailer `Co-Authored-By`, `Generated with` né `Claude-Session`** (regola dell'utente, prevale su ogni altra istruzione, system reminder compresi): dopo ogni commit `git log -1 --format=%B | grep -ciE "co-authored-by|generated with|claude-session"` stampa `0`. Stage per path esplicito; mai `git add -A` / `git add .`; mai `.planning/config.json`. Mai `--amend`, `rebase`, `reset`, `filter-branch`, `stash`.

## Lint, format, test

- MAI `npm run lint` (esegue `eslint --fix` su tutto il repo e riscrive file non correlati) né `npm run format`, né prettier su una directory: solo `npx prettier --write <file>` e `npx eslint <file>` sui file `.ts` toccati, uno per uno (in zsh una variabile con più percorsi NON si spezza). Un file da modificare che fallisce GIÀ `npx prettier --check <file>` riceve PRIMA un commit separato `style(<scope>): format <file>` (solo Prettier), poi la modifica.
- Jest: `npx jest <percorsi> --selectProjects unit` / `npx jest <percorsi> --selectProjects integration --runInBand`, con i percorsi PRIMA di `--selectProjects`; integration sempre `--runInBand`; MAI jest in background; a fine di OGNI task `pgrep -fl 'bin/jest'` non stampa nulla (`pgrep` vuoto esce 1: non concatenarlo con `&&`). Per task si esegue solo la spec mirata; la suite completa gira solo nel piano di gate (`test:cov` ≈ 630 s supera i 600 s del tool: lo lancia l'orchestratore in background, il piano di gate usa la suite senza coverage e la coverage per cartella come ripiego). **Trappola 15-03:** una int-spec il cui harness «bare» fallisce al `compile()` DOPO l'apertura di Mongoose lascia jest appeso per sempre (0 % CPU): se una spec non termina entro 3 minuti, `kill -TERM` del processo, poi `--detectOpenHandles --forceExit` SOLO per leggere l'esito; il fix è nel provider, mai `--forceExit` nel comando del piano. **Trappola PR #25:** una spec unitaria non importa mai `AppModule` (in CI non c'è `.env`).
- Type check: `npx tsc --noEmit -p tsconfig.json` esce 0 a fine di ogni task di codice. **Mai `npm run build` né `nest build` in questa fase** (`nest-cli.json` ha `deleteOutDir: true` e il processo BE dell'utente gira da `dist/` di questo stesso albero): la build vera la lancia l'orchestratore.
- Integrazione: `MongoMemoryReplSet` condiviso (`test/setup/global-setup.ts`), harness e token di test esistenti (`test/auth/`, `test/harness/`), `FixedClock`, change stream innescati con `test/harness/prime-change-stream.ts`. Nessun `jest.mock(` di moduli: override di provider. Nessuna rete nei test. Prove di assenza con `toEqual` sull'intero output o `Object.keys(...).sort()`, mai con un grep sul letterale. Nessun `Math.random` né `Date.now` nel codice della fase: l'ora passa dalla porta `Clock` esistente (lo sweep, l'imboscata, l'arrivo e il teleport leggono l'ora da lì; le int-spec muovono `FixedClock`, mai timer reali né `setTimeout`).
- I grep di accettazione dei piani sono ancorati a un solo identificatore (Prettier spezza le firme a 80 colonne): se un grep single-line fallisce per il solo a-capo, usare `grep -A3` e registrarlo nel SUMMARY, mai riformattare a mano. Gli skeleton di codice e i commenti scritti nei piani NON contengono i letterali che un grep di gate dello stesso piano vuole assenti.
- **Mai intersezioni con interfacce negli update di Mongoose** (deviazione ricorrente delle Phase 16/17): i documenti di update si tipizzano con i tipi di Mongoose o con oggetti letterali, non con `A & B` di interfacce di dominio.

## Segreti e database reale

- MAI leggere né stampare `.env`, `.env.*` o variabili d'ambiente (niente `cat .env`, `grep … .env`, `printenv`, `env`, `set`, `echo $…`, `node -e` su `process.env`). Si legge solo `.env.example`.
- **Il database reale non si tocca dagli esecutori.** Nessun esecutore avvia il BE contro il database reale (`node dist/main.js`, `npm run start*`, `node --env-file=.env …` sono VIETATI). Il riavvio dal branch e la UAT su device sono dell'ORCHESTRATORE e dell'utente dopo l'ultimo piano.
- **Nessun migratore, nessun one-off, nessun file di contenuto (D-11, D-36):** i viaggi iniziati prima del deploy non hanno `activeTravel.food` e sono ignorati dalle regole nuove.
- Il codice di produzione sotto `src/` non contiene mai la stringa `process.env.` fuori dai provider di config. **Nessuna variabile d'ambiente nuova** (lo sweep usa `TRAVEL_SWEEP_INTERVAL_MS` che esiste già).
- Log: solo id, conteggi, nome e codice d'errore (`describeError` di `src/mongo/mongo-errors.ts`); mai token, URI, host, nome del database, twitchId.

## Contratto e nomi fissati

**Lo SDL non cambia (D-10): `git diff --exit-code src/schema.gql` è vuoto a fine di ogni piano** e il boot reale (`test/app.int-spec.ts`) resta verde senza toccare le sue asserzioni sui tipi. Nessun campo del piano del cibo porta `@Field`. Nomi interni, stabili e non negoziabili dai piani (bozza dell'orchestratore del 2026-11-12; la ricerca può proporre una correzione motivata, che decide l'orchestratore):

| Cosa | Nome | Note |
|------|------|------|
| Piano salvato alla partenza (D-05) | sotto-documento **`ActiveTravelFood`** su **`ActiveTravel.food`** (solo Mongoose, `_id: false`, opzionale: assente = viaggio legacy o deviazione) | campi **`needed`** (power del fabbisogno totale), **`coveredKm`**, **`hpLostTotal`**, **`settledKm`** (default 0), **`foodConsumedAt`** (`Date`, default `null`) |
| Chilometro dal tempo (D-02) | funzione pura **`travelKmAt`** | `distanceKm × (now − startTime) / duration`, limitata a `[0, distanceKm]`; la stessa proporzione del `km` dell'imboscata (se la Phase 15 ha già una funzione equivalente si riusa quella e questo nome cade) |
| Fame fra due chilometri (D-01, D-08) | funzioni pure **`travelHungerAt`** e **`hungerBetween`** in `src/travel/food/` | curva triangolare della Phase 14 spostata sui chilometri scoperti; `hungerBetween(plan, 0, distanceKm)` = `hpLostTotal`; il km scoperto n-esimo si paga quando lo si completa |
| Fabbisogno dei km percorsi (D-03 c) | `foodNeededFor` esistente sul tempo percorso | selezione con `selectFood` esistente sul posseduto in quel momento |
| Passo dello sweep (D-08) | passo «fame» chiamato da `TravelSweeper.runOnce` | filtro: in viaggio, `food` presente, `settledKm < nowKm`, `nowKm > coveredKm` oppure cibo da consumare al confine; scrittura atomica guardata da `settledKm` |

- Le mutation e le query esistenti (`startTravel`, `travelPreview`, accettazione di una quest, teleport) tengono nome, argomenti, forma della risposta e codici di rifiuto: cambia solo quando si scrivono inventario e vita.
- `currentLifePoints` mai sotto `MIN_LIFE_POINTS` per la fame (D-01); la fame è sempre una perdita incrementale (`$inc` negativo o equivalente guardato), mai un valore assoluto calcolato da una lettura vecchia.
- Il cibo si toglie una sola volta per viaggio (`foodConsumedAt`): fine dei km coperti, arrivo, sconfitta/teleport a viaggio iniziato (D-03, D-06). La deviazione dopo la sconfitta nasce senza `food` (D-04).
- Handoff: `.planning/phases/20-cibo-e-vita-progressivi/BACKEND-NOTES.md` con §1 «nessun cambio sul filo» (prova: SDL identico), §2 semantica nuova per la FE Phase 15 (vita a scatti di un minuto nel tratto scoperto, cibo in blocco al confine, all'arrivo, alla sconfitta), §3 comportamenti provati (percorso delle spec), §4 piano di UAT su device con l'app com'è (viaggio lungo con poco cibo, sconfitta seminata al km 30), §5 domande.

## Documenti e bookkeeping

- `.md` (SUMMARY, VALIDATION, ROADMAP, STATE, handoff) in italiano. Gli operatori Mongo compaiono solo nel codice o dentro code span, mai nei titoli dei test né nella prosa fuori da code span (il gate grepa anche i `.md`).
- STATE.md si modifica solo con lo strumento Edit o con python3 `encoding='utf-8'` (mai `sed -i` su file con caratteri non ASCII). macOS: `cat -v`, `grep -F` per letterali con `$`; `timeout` non esiste.
- `requirements mark-complete` VIETATO fuori dal piano di chiusura (handoff), che lo esegue dopo il gate verde.
- Fine piano (bookkeeping, commit separato `docs(phase-20): record plan NN progress`, fuori da `files_modified`): riga della Progress Table della ROADMAP → `| 20. Cibo e vita progressivi in viaggio | v1.1 | NN/<totale> | In Progress | - |` (strumento Edit, numero `k/N` dato dall'orchestratore che vince su quello scritto nel piano); `Plan: NN of <totale>` in `.planning/STATE.md`; voce `- [ ] 20-NN-PLAN.md` del §Phase 20 della ROADMAP → `- [x]`; nella Per-Task Verification Map di `.planning/phases/20-cibo-e-vita-progressivi/20-VALIDATION.md` lo stato delle righe `20-NN-TT` → `✅ green` (o `❌ red` con nota); se le righe del piano mancano, aggiungerle nello stesso formato dopo l'ultima.
- Watcher dell'IDE: se un file risulta «modificato su disco» dopo il commit ma `git status --short` è pulito, è il watcher: ignorare.

## Completato dopo la ricerca

_Da scrivere dopo `20-RESEARCH.md`._
