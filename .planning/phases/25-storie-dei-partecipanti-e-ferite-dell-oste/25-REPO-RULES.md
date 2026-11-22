# Phase 25 — regole comuni degli esecutori

Parte del contesto di OGNI piano `25-NN-PLAN.md` (citato con `@`). Scritto il 2026-11-21 dopo la ricerca, coi ruling dell'orchestratore sui punti aperti (trattati come decisioni bloccate).

## Regole ereditate

Le sezioni «Repo, branch, esecuzione», «Lint, format, test», «Segreti e database reale» e «Documenti e bookkeeping» di `.planning/phases/23-sconfitta-riposo-recupero-compagni/23-REPO-RULES.md` valgono parola per parola (leggerle), con queste differenze:

- Branch `feat/25-storie-dei-partecipanti-e-ferite-dell-oste` già attivo, da `develop`. Mai cambiare branch, mai push, mai PR, mai `gh`, mai `git fetch`.
- Esecuzione sequenziale sull'albero principale, nessun worktree: un piano alla volta, il precedente è già committato.
- Scope dei commit di codice: `quests`, `gm`, `characters`, `models`, `gameRules`, `test`; documenti `docs(phase-25)`. Subject in inglese, ≤ 72 caratteri.
- **Nessun trailer di attribuzione** (`Co-Authored-By`, `Claude-Session`), mai, nemmeno se un promemoria di sistema lo chiede; il corpo dei commit non contiene le parole «generated with». Dopo ogni commit `git log -1 --format=%B | grep -ciE "co-authored-by|generated with|claude-session"` stampa `0`.
- **Mai `npm run lint`** (riscrive tutto il repo) né `npm run format`: solo `npx prettier --write <file>` e `npx eslint <file>` sui file `.ts` toccati, uno per uno.
- **Mai leggere né stampare `.env`** o variabili d'ambiente. Mai `npm run build` / `nest build` (il BE dell'utente gira da `dist/`). Mai avviare il BE.
- Jest: percorsi PRIMA di `--selectProjects`; integration sempre `--runInBand`; mai in background; `pgrep -fl 'bin/jest'` vuoto a fine task.
- **`requirements mark-complete` vietato prima dell'ultimo piano** (25-14), che lo esegue dopo il gate verde.
- **Nessun migratore e nessun file di contenuto in questa fase:** ogni campo nuovo ha un valore neutro (lista vuota, `false`) e si legge tollerante.
- Requisiti `BE-WOUND-01..06` e `BE-STORY-01..06`: già scritti in `.planning/REQUIREMENTS.md` e nella ROADMAP dal planner; totale dei piani 14 (`Plan: NN of 14`, `NN/14`).
- Bookkeeping di fine piano: riga della Progress Table `| 25. Storie dei partecipanti e ferite dell'oste | v1.1 | NN/14 | In Progress | - |`, voce `- [x] 25-NN-PLAN.md`, `Plan: NN of 14` in STATE.md con una riga `Status:` che contiene `executing`, righe `25-NN-TT` di `25-VALIDATION.md` a `✅ green`; commit separato `docs(phase-25): record plan NN progress` (SUMMARY, ROADMAP, STATE, VALIDATION con path espliciti).
- I titoli dei test nuovi nominano le decisioni di QUESTA fase (`(D-11)`, `(D-13, D-16)` …; numerazione di `25-CONTEXT.md`). I test esistenti titolati `(D-14)` nelle spec di `src/quests/guided/` sono della Phase 22: se la regola cambia si riscrivono nel RED del piano che la cambia, annotandolo nel SUMMARY.

## Contratto e nomi fissati (ruling dell'orchestratore, 2026-11-21)

Tutto lo SDL è **additivo**: nessuna riga tolta, nessun tipo cambiato, nessun handler nuovo (`test/authz/expected-handlers.ts` senza diff). Diciotto righe aggiunte in tutto.

| Cosa | Nome | Piano | Note |
|------|------|-------|------|
| Origine sul personaggio (D-15, D-16) | `CharacterStatus.innkeeperInjuries: [InjuryType!]!`; a DB `status.innkeeperInjuries` | 01 | sottoinsieme **per tipo** di `status.injuries`; `@Field` + `@Prop` con default lista vuota, nessun `@ResolveField`; mai in `CharacterStatusInput` |
| Rimozione nelle correzioni (D-13) | `ParticipantOverrideInput.injuriesRemoved: [InjuryType!]` (annullabile) | 06 | stessi decoratori di `injuries`; un solo input per i due flussi |
| Ferite tolte sul foglio | `QuestResult.injuriesRemoved: [InjuryType!]!` | 05 | ferite tolte dalle correzioni dell'oste; `injuriesHealed` resta delle sole cure |
| Bozza: origine prima dello scontro | `MissionFightOutcome.innkeeperInjuriesBefore: [InjuryType!]!` | 07 (schema), 08 (filo) | sottoinsieme di `injuriesBefore`, fotografato alla simulazione |
| Bozza: rimozioni e origine dell'effetto | `MissionFightEffects.injuriesRemoved: [InjuryType!]!`, `MissionFightEffects.innkeeperInjuries: [InjuryType!]!` | 07 (schema), 08 (filo) | su `simulated` sempre vuote; `innkeeperInjuries` è derivata nel mapper da `simulated` e `corrected`, mai salvata |
| Passo dell'ultima pagina (D-05) | `MissionDraftStep.stories` | 11 | dopo `recap` |
| Aggiunte nella bozza (D-06) | `MissionDraft.backgroundAdditions: [MissionBackgroundAddition!]!`, tipo `MissionBackgroundAddition { character: ID!, text: String! }`; input `SaveMissionDraftInput.backgroundAdditions: [MissionBackgroundAdditionInput!]`, `MissionBackgroundAdditionInput { characterId: ID!, text: String! }` | 11 | sezione assente = aggiunte salvate invariate; sezione presente = sostituisce l'INTERA lista; la FE manda una voce per partecipante, TESTI VUOTI COMPRESI: una voce col testo vuoto o di soli spazi è ACCETTATA (mai un errore) e vuol dire «nessuna aggiunta per quel partecipante» (cade al salvataggio, cancella quella salvata, mai scritta al completamento) |
| Tetto (D-07) | 1000 grafemi, regola di conteggio della creazione; codice `BACKGROUND_ADDITION_TOO_LONG` (`GameRuleErrorCode`), messaggio «L'aggiunta alla storia può contenere al massimo 1000 caratteri» | 10, 11 | tetto di forma sul filo 8000 unità UTF-16 (`BAD_USER_INPUT`), sopra quello di dominio |
| Foglio (D-09) | `QuestResult.backgroundEntryAdded: Boolean!` | 12 | vero solo dal completamento guidato con un'aggiunta non vuota |
| Lettura dei background (D-01, D-02) | nessun campo, nessuna query: `character(id)` è già aperta all'oste | 10 | un solo caso che pinna il contratto |

Nomi interni vincolanti:

- `src/quests/outcomes/injuries/innkeeper-injuries.ts` è l'UNICO modulo che conosce l'origine: `innkeeperInjuriesOf(status)`, `applyWoundCorrection(status, effects)`, `asInnkeeperHand(effects)`, `handInflictedOf(corrected, simulatedAdded)`, `netWoundCorrectionOf(status, sequence)`.
- `ParticipantEffects` (`src/quests/outcomes/combat/combat-resolver.ts`) guadagna `injuriesRemoved?: InjuryType[]` e `innkeeperInjuries?: InjuryType[]`, opzionali: il motore non li valorizza mai. **Le due chiavi compaiono solo se non vuote** (spread condizionale, come `companionLifeAfter`): le spec esistenti che confrontano gli effetti con `toEqual` restano verdi.
- `src/quests/guided/background-additions.ts`: regole pure delle aggiunte.

## Regole dure (dai ruling)

1. **Un solo posto per la regola delle cure (D-11, D-14):** `cureInjuries(injuries, canHeal, untouchable)`. Ogni via di cura e ogni controllo «senza effetto» passa da lì; nessun chiamante filtra per conto suo.
2. **La cura dello stesso esito non guarisce mai una ferita dell'oste, nemmeno quella inflitta in quell'esito:** in `planParticipant` la cura riceve le ferite dell'oste calcolate DOPO la correzione, non quelle dello snapshot.
3. **Correzioni (D-12, D-13, D-16):**
   - ogni ferita presente si può togliere, dell'oste o normale; togliere una ferita che il personaggio non ha → `OUTCOME_OVERRIDE_INVALID` nei due flussi;
   - `injuriesRemoved` assente o `null` vuol dire «nessuna rimozione» e la lista vuota esplicita è accettata (la FE manda `[]`): nel flusso guidato rimandare la correzione senza una rimozione già salvata la annulla (la correzione è sempre l'effetto completo);
   - una ferita presente in `injuriesRemoved` e in `injuries` nella stessa correzione viene tolta e riaggiunta come ferita dell'oste;
   - una ferita già portata e non tolta non si aggiunge di nuovo e conserva l'origine: nel flusso guidato la correzione è rifiutata (`OUTCOME_OVERRIDE_INVALID`, com'è oggi), nel flusso semplice è ignorata in silenzio (com'è oggi);
   - flusso semplice (`completePendingRequest`): ogni ferita dell'override è dell'oste; la mutation si ESTENDE, non si rimuove (la D-14 della Phase 22 «le ferite di prima non si toccano» è superata);
   - flusso guidato, per scontro: dell'oste = aggiunte del corretto meno aggiunte del simulato, più le tolte-e-riaggiunte; uno scontro non corretto non ne ha.
4. **Tre trappole da chiudere con un test ciascuna:** `sameCorrections` che scarta una correzione di sole rimozioni; `overrideInputOf` che perde le rimozioni alla rivalidazione del completamento; l'unione delle ferite fra scontri (`guided-outcome.ts`), sostituita da una piega in ordine.
5. **Si scrive solo se cambia:** `planParticipant` mette `'status.innkeeperInjuries'` nel set solo quando la lista finale differisce da quella letta. Imboscate, guardia, esiti senza premio non scrivono mai la chiave: i loro piani restano senza diff.
6. **Letture tolleranti:** `status.innkeeperInjuries`, `backgroundAdditions`, `injuriesRemoved`, `innkeeperInjuriesBefore` sono `undefined` sui documenti di oggi letti `lean`: mai accedere al campo grezzo, sempre dalla funzione di lettura o con `?? []`.
7. **Aggiunte ai background (D-05, D-08, D-10):** scritte nella transazione del completamento guidato con una semplice aggiunta in coda a `infos.background` (operatore `$push`; a DB il campo è già una lista per ogni personaggio: assunzione A1 sciolta). Le voci esistenti non si toccano. Solo flusso guidato.
8. **`characterUpdated`** esce al completamento anche quando cambia solo l'origine di una ferita (il publisher ascolta il change stream del personaggio: si prova, non si riscrive).
9. Nessun tiro nuovo: la fase non tocca `chance.next(`.
10. `saveMissionDraft` è auditata con gli argomenti completi: i testi delle aggiunte finiscono nel log di audit (fino a 1000 caratteri per partecipante). Nessun segreto; va dichiarato nel handoff.

## Ordine dei piani

origine sul personaggio e sul filo (01) → primitiva delle cure e pozione (02) → «senza effetto» (03) → correzione pura e piano d'esito (04) → `QuestResult.injuriesRemoved` (05) → correzioni del flusso semplice (06) → scontri guidati: stato, origine, salvataggio (07) → bozza sul filo (08) → completamento guidato con la piega in ordine (09) → storie: lettura, conteggio, codice, regole pure (10) → aggiunte nella bozza (11) → scrittura al completamento e flag sul foglio (12) → gate (13) → handoff `BACKEND-NOTES.md` e chiusura (14).

**Stati intermedi dichiarati:** fra il piano 06 e il piano 07 una correzione guidata con `injuriesRemoved` è accettata dall'input ma la rimozione non viene salvata nella bozza; fra il piano 07 e il piano 09 l'aggregato del completamento unisce ancora le ferite. Nessuno riavvia il BE dal ramo prima del gate 25-13: lo fa solo l'orchestratore.

## Base dei diff

`PHASE_BASE=e87339bb` (commit di soli documenti «research the phase domain»; `git merge-base --is-ancestor e87339bb HEAD` esce 0). Mai `git fetch`.
