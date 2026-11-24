# Phase 26 — regole comuni degli esecutori

Parte del contesto di OGNI piano `26-NN-PLAN.md` (citato con `@`). Scritto il 2026-11-24 dopo la ricerca e il suo addendum, coi ruling dell'utente e dell'orchestratore (decisioni bloccate). Dove questo file e `26-RESEARCH.md` discordano, vince questo file; sopra entrambi sta `26-CONTEXT.md`.

## Regole ereditate

Le sezioni «Repo, branch, esecuzione», «Lint, format, test», «Segreti e database reale» e «Documenti e bookkeeping» di `.planning/phases/23-sconfitta-riposo-recupero-compagni/23-REPO-RULES.md` valgono parola per parola (leggerle), con le differenze già elencate in `.planning/phases/25-storie-dei-partecipanti-e-ferite-dell-oste/25-REPO-RULES.md` §«Regole ereditate» e queste:

- Branch `feat/26-eliminazione-account-e-consenso` già attivo, da `develop`. Mai cambiare branch, mai push, mai PR, mai `gh`, mai `git fetch`.
- Esecuzione sequenziale sull'albero principale, nessun worktree.
- Scope dei commit di codice: `auth`, `users`, `characters`, `quests`, `travel`, `push`, `authz`, `models`, `test`; documenti `docs(phase-26)`. Subject in inglese, ≤ 72 caratteri (se il piano ne impone uno più lungo, accorciarlo PRIMA di committare; mai riscrivere la storia).
- **Nessun trailer di attribuzione**, mai: dopo ogni commit `git log -1 --format=%B | grep -ciE "co-authored-by|generated with|claude-session"` stampa `0`.
- **Mai `npm run lint`**, mai `npm run format`, mai `npm run build` / `nest build`, mai avviare il BE. Solo `npx prettier --write <file>` e `npx eslint <file>` sui file toccati; controllo dei tipi con `npx tsc --noEmit`.
- **Mai leggere né stampare `.env`** o variabili d'ambiente.
- Jest: percorsi PRIMA di `--selectProjects`; integration sempre `--runInBand`; mai in background; `pgrep -fl 'bin/jest'` vuoto a fine task.
- `requirements mark-complete` vietato prima dell'ultimo piano.
- **Nessun migratore e nessun file di contenuto** (D-11): i campi nuovi si leggono tolleranti sui documenti di oggi. I dati di sviluppo orfani sono dell'orchestratore al boot reale.
- STATE.md solo con Edit o python3 UTF-8 esplicito, mai `sed -i`.
- I titoli dei test nuovi nominano le decisioni di QUESTA fase (numerazione di `26-CONTEXT.md`).

## Contratto e nomi fissati

Tutto lo SDL è **additivo**; il piano di gate verifica `git diff` di `src/schema.gql` contro questa tabella.

| Cosa | Nome | Note |
|------|------|------|
| Cancellazione propria (D-20) | `deleteMyAccount: Boolean!` | autenticata, nessun argomento; `INNKEEPER_ACCOUNT_PROTECTED` per il ruolo oste (D-16) |
| Cancellazione dell'oste (D-15, D-20) | `deleteAccountByTwitchLogin(twitchLogin: String!): DeletedAccount!`, `type DeletedAccount { twitchId: String! }` | solo oste; errori `TWITCH_USER_NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `INNKEEPER_ACCOUNT_PROTECTED`, `TWITCH_UNAVAILABLE`; `test/authz/expected-handlers.ts` aggiornato nel RED |
| Motivo di revoca (D-18) | `accountDeleted` in `extensions.reason` di `SESSION_REVOKED`; chiusura WS 4409 | sessioni revocate con scadenza a 15 minuti; lista in memoria di 15 minuti per gli access token ancora validi (`UNAUTHENTICATED`) |
| Consenso (D-09, D-19) | query `termsVersion` su `GET /auth/twitch/start`, formato `^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$`; rifiuto = redirect all'app con `?error=terms_not_accepted` | firmata nello state OAuth, scritta nell'upsert del callback con la data del BE; campi interni sull'utente (non nello SDL); bypass di sviluppo esente |
| Proprietario del personaggio (D-24) | campo interno `Character.user` | scritto alla creazione; mai nello SDL |
| Rimborso del tragitto (D-13, D-26) | campi interni sulla `PendingQuest`: cibo mangiato e punti vita persi per fame nel viaggio verso la quest | scritti nella stessa transazione del pasto; mai nello SDL |
| Push dell'annullamento (D-26) | evento `questCancelled` esistente, testo nuovo da un builder suo | nessun tipo di evento nuovo |

Il planner fissa i nomi interni restanti (moduli, funzioni, campi) e li elenca nel primo piano che li introduce; da lì sono vincolanti.

## Regole dure

1. **Una sola cancellazione:** la mutation propria e quella dell'oste chiamano lo stesso servizio; cambia solo chi è il bersaglio e la voce di registro.
2. **Ordine (D-26):** dentro la transazione, per ogni quest effettivamente cominciata (`startedAt != null`, `concludedAt == null`) con un personaggio dell'utente registrato si esegue l'annullamento (membri rimasti: `PendingQuest` cancellata, corsia libera, posizione al `City.markerLocation` della città della quest, rimborso di cibo, `pointsSpent` e vita persa per fame; quest tornata non avviata con `startedQuestResetOf`) PRIMA di ogni rilascio «alla maniera dell'archivio». Eccezione: `aid` avviata il cui unico ferito è il personaggio cancellato → regole di oggi.
3. **L'archiviazione del personaggio non cambia:** `archiveWithinReporting` chiamato da «Elimina personaggio» e dalla morte resta byte per byte nel comportamento; le sue spec restano verdi senza modifiche.
4. **Niente resta:** dopo il commit nessun documento riferisce l'utente o i suoi personaggi, tranne registro dell'oste, registro EventSub e sessioni revocate in scadenza (D-18). Un test d'integrazione fa l'inventario per collection.
5. **Dopo il commit, mai dentro:** Cloudinary (ritratto), disiscrizione dal topic FCM `streamer-live` (D-25), push `questCancelled`, pubblicazioni. Un fallimento di questi passi non annulla la cancellazione e non resta muto: registro e ritentativo secondo la ricerca.
6. **Registro dell'oste (D-25):** per `deleteAccountByTwitchLogin` gli argomenti sono oscurati e il bersaglio è il Twitch ID risolto; il nome utente Twitch non finisce in nessuna collection né nei log applicativi.
7. **Nessuna traccia per il rientro (D-04):** nessuna collection conserva il Twitch ID cancellato; la lista in memoria di D-18 contiene id utente, non Twitch ID, e scade.
8. **Consenso obbligatorio dal callback (D-09, D-11):** nessun utente nasce senza versione e data; gli utenti di sviluppo già a DB senza consenso non devono rompere refresh né bypass.
9. Nessun tiro nuovo: la fase non tocca `chance.next(`.

## Base dei diff

`PHASE_BASE=9a084248` (commit di soli documenti «research the phase domain and amend the context»). Mai `git fetch`.
