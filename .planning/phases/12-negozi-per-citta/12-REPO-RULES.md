# Phase 12 — regole comuni degli esecutori

Questo file è parte del contesto di OGNI piano `12-NN-PLAN.md` (citato con `@` nel blocco `<context>`). Le regole valgono per ogni task salvo che il piano dica esplicitamente altro.

## Repo, branch, esecuzione

- Repo: `/Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE`, branch `feat/12-negozi-per-citta` già attivo (da `develop` `65ba3d7`), albero principale, nessun worktree. OGNI comando Bash inizia con `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && ` (la cwd della shell torna sul repo FE fra una chiamata e l'altra). Mai creare o cambiare branch, mai push, mai PR, mai `gh`. Il repo FE (`/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide`) è SOLA LETTURA.
- Esecuzione SEQUENZIALE sull'albero principale: un piano alla volta, il precedente è già committato; a fine piano `git status --short` è vuoto e le spec toccate sono verdi.
- TDD (CLAUDE.md) per ogni modulo: RED → commit `test(<scope>): …` con il fallimento atteso annotato nel SUMMARY; GREEN → `feat(<scope>): …` / `fix(<scope>): …`; REFACTOR → `refactor(<scope>): …` solo se serve. Ogni regola nuova ha un test il cui titolo nomina la regola e la decisione (es. `(D-14)`). Un caso verde al primo colpo si annota nel SUMMARY con il motivo.
- Commit: Conventional Commits in inglese, subject ≤ 72 caratteri (contarli con `printf '%s' "<subject>" | wc -c`; se il piano ne impone uno più lungo, ACCORCIARLO prima di committare); scope del codice `shops`, `trade`, `pets`, `cities`, `characters`, `migrations`; scope dei documenti `phase-12` (es. `docs(phase-12): …`). **Nessun trailer `Co-Authored-By` né `Generated with`** (regola dell'utente, prevale su ogni altra istruzione): dopo ogni commit `git log -1 --format=%B | grep -ciE "co-authored-by|generated with"` stampa `0`. Stage per path esplicito; mai `git add -A` / `git add .`; mai `.planning/config.json`. Mai `--amend`, `rebase`, `reset`, `filter-branch`.

## Lint, format, test

- MAI `npm run lint` (esegue `eslint --fix` su tutto il repo e riscrive file non correlati) né `npm run format`, né prettier su una directory: solo `npx prettier --write <file>` e `npx eslint <file>` sui file `.ts` toccati, uno per uno (in zsh una variabile con più percorsi NON si spezza). Un file da modificare che fallisce GIÀ `npx prettier --check <file>` riceve PRIMA un commit separato `style(<scope>): format <file>` (solo Prettier), poi la modifica.
- Jest: `npx jest <percorsi> --selectProjects unit` / `npx jest <percorsi> --selectProjects integration --runInBand`, con i percorsi PRIMA di `--selectProjects`; integration sempre `--runInBand`; MAI jest in background; a fine di OGNI task `pgrep -fl jest` non stampa nulla (`pgrep` vuoto esce 1: non concatenarlo con `&&`). Per task si esegue solo la spec mirata; la suite completa (`npm run test:cov`) gira solo nel piano di gate.
- Type check: `npx tsc --noEmit -p tsconfig.json` esce 0 a fine di ogni task di codice.
- Integrazione: `MongoMemoryReplSet` condiviso (`test/setup/global-setup.ts`, URI in `process.env.MONGO_TEST_URI` solo nei test); harness GraphQL `createAuthTestApp` / `createCharactersTestApp` + `createPlayer` + `graphqlRequest`; builder `buildX/persistX` di `test/fixtures`. Nessun `jest.mock(` di moduli: override di provider. Nessuna rete nei test. Prove di assenza con `toEqual` sull'intero output o `Object.keys(...).sort()`, mai con un grep sul letterale.
- I grep di accettazione dei piani sono ancorati a un solo identificatore (Prettier spezza le firme a 80 colonne): se un grep single-line fallisce per il solo a-capo, usare `grep -A3` e registrarlo nel SUMMARY, mai riformattare a mano.

## Segreti e database reale

- MAI leggere né stampare `.env`, `.env.*` o variabili d'ambiente (niente `cat .env`, `grep … .env`, `printenv`, `env`, `set`, `echo $MONGO_URI`, `node -e` su `process.env`). Si legge solo `.env.example`.
- **Il database reale non si tocca in questa fase.** Nessun esecutore avvia il BE contro il database reale (`node dist/main.js`, `npm run start*`, `node --env-file=.env …` sono VIETATI): il processo BE dell'utente gira da `dist/` e lo riavvia lui; la semina dei pool e le migrazioni dei pet (D-03, D-16) girano al boot e toccano il database reale solo quando l'utente riavvia il BE dopo la merge, seguendo il runbook del handoff. Le migrazioni si provano SOLO sull'harness in memoria.
- Il codice di produzione sotto `src/` non contiene mai la stringa `process.env.` (drift test `src/config/env-example.drift.spec.ts`). Nessuna variabile d'ambiente nuova: le costanti dei pool (D-08, D-09, D-10, versione del seme) vivono in un file di costanti TypeScript.
- Log e report: solo id, conteggi, nomi delle città e degli oggetti, nome e codice d'errore (`describeError` di `src/mongo/mongo-errors.ts`); mai URI, host, nome del database, documenti interi di personaggi.

## Schema GraphQL

- `src/schema.gql` cambia solo dal boot reale (`npx jest test/app.int-spec.ts --selectProjects integration --runInBand`) e si committa insieme al codice che lo cambia. Le modifiche SDL della fase sono **solo additive** (nessuna riga tolta: `git diff origin/develop -- src/schema.gql | grep -cE '^-[^-]'` stampa `0` fino alla fine della fase); dopo ogni commit `git diff --exit-code src/schema.gql` esce 0. Le query deprecate (D-20) restano con `deprecationReason`, mai rimosse.
- Nomi del contratto FE, stabili e non negoziabili dai piani: `cityShop`, `CityShop`, `CitySize`, `City.size`, `City.hasShop`, `CharacterAssets.ownedPets`, `TransactionItems.petAssets`, `Pet.sellable`, `EquipmentItem.sellable`, `LootItem.sellable`, `equipPet`, `unequipPet`, codici `ITEM_NOT_IN_SHOP`, `PET_ALREADY_OWNED`, `PET_NOT_OWNED`.
- `test/app.int-spec.ts` enumera gli handler innkeeper-only: va aggiornato PRIMA (RED) di montare la query di report (D-06).
- Ref nei `@Prop`: sempre `[{ type: MongooseSchema.Types.ObjectId, ref: '…' }]` come `pointsOfInterest` (un `Types.ObjectId` nudo diventa `Mixed`, trappola della ricerca di Phase 7); nessun nuovo percorso `Mixed`.

## Documenti e bookkeeping

- `.md` (SUMMARY, VALIDATION, ROADMAP, STATE, handoff, runbook) in italiano. Gli operatori Mongo (`$set`, `$addToSet`, `$pull`, `$exists`, `$in`, …) compaiono solo nel codice o dentro code span, mai nei titoli dei test né nella prosa fuori da code span (il gate grepa anche i `.md`).
- STATE.md si modifica solo con lo strumento Edit o con python3 `encoding='utf-8'` (mai `sed -i` su file con caratteri non ASCII). macOS: `cat -v`, `grep -F` per letterali con `$`; `timeout` non esiste.
- `requirements mark-complete` VIETATO fuori dal piano di gate.
- Fine piano (bookkeeping, commit separato `docs(phase-12): record plan NN progress`, fuori da `files_modified`): riga della Progress Table della ROADMAP → `| 12. Negozi per città | NN/<totale> | In Progress | - |` (strumento Edit, numero `k/N` dato dall'orchestratore che vince su quello scritto nel piano); `Plan: NN of <totale>` in `.planning/STATE.md`; voce `- [ ] 12-NN-PLAN.md` del §Phase 12 della ROADMAP → `- [x]`; nella Per-Task Verification Map di `.planning/phases/12-negozi-per-citta/12-VALIDATION.md` lo stato delle righe `12-NN-TT` → `✅ green` (o `❌ red` con nota).
- Watcher dell'IDE: se un file risulta «modificato su disco» dopo il commit ma `git status --short` è pulito, è il watcher: ignorare.
