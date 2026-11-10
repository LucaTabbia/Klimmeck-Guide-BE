# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Core Loop (BE)

**Shipped:** 2026-11-10
**Phases:** 21 (17 + 2.1, 3.1, 9.1, 9.2, 13.1) | **Plans:** 261 | **Tasks:** 195 | **Quick task:** 5 | **Sessions:** non contate (una sessione dell'orchestratore per coppia di fasi BE+FE dal repo FE, 2026-10-06 → 2026-11-10; Phase 1 a luglio)

### What Was Built
- Sessione propria con login Twitch mediato, guard deny-by-default su HTTP/REST/WS, ownership e ruoli con audit, matrice di autorizzazione provata sul boot reale, «l'ultimo login caccia l'altro».
- Economia atomica per costruzione, real-time filtrato per identità dai change stream, EventSub per i punti canale, push FCM data-only.
- Contratti di gioco consumati dalla FE: creazione/cancellazione personaggio, corsie quest, viaggio server-autoritativo, esiti di combattimento mai persi, stato delle magie.
- Il mondo come dati: popolamento dal world building, negozi per taglia, generazione delle quest con il multi-nemico, cibo e imboscate del viaggio, lore sbloccabili.
- Hardening trasversale: validazione, superficie di produzione, coverage per cartella, gitleaks, moderazione immagini, ritipizzazione dei ref con migrazione e runbook.

### What Worked
- **Contratti prima del codice:** `REPO-RULES.md` con i nomi fissati nei due repo prima dei planner, il contratto FE verificato con `grep -cF` sull'SDL e il diff di `src/schema.gql` dal boot reale in CI.
- **Boot reale dall'orchestratore** dopo ogni fase con semine o migrazioni (conteggi con script `.mjs` di sola lettura, one-off rimossi in TDD, secondo boot silenzioso) e PR draft fino al boot.
- **Review per area con reviewer paralleli → ruling → fixer sequenziali → security per ultimo**, `test:cov` come gate in background.
- **Regole dell'utente come D-NN** (rassegna dei contenuti a metà corsa, UAT FE) con piano extra o fix TDD nella stessa fase, oppure fase inserita (13.1) quando il perimetro cresceva.
- **Il DB come verità dei timer** (viaggi, recuperi, imboscate): un solo pattern job-trigger + reconciler + sweep riusato tre volte senza bug di concorrenza nelle UAT.

### What Was Inefficient
- Una PR con `content/` e `src/content/` bocciata come rumore (D-36): il mondo doveva vivere nel DB dall'inizio della Phase 11.
- Int-spec appese (harness bare che fallisce dopo l'apertura di Mongoose, jest che non esce) hanno bloccato executor per minuti; `--detectOpenHandles --forceExit` e un kill esplicito sono arrivati tardi.
- `test:cov` ≈ 630 s supera il limite dello strumento: ogni gate ha richiesto il background e l'estrazione del riepilogo.
- `state begin-phase` ha riscritto `stopped_at` con testo vecchio più volte; `STATE.md` è troppo prolisso (tabella delle performance mai aggiornata, decisioni per piano duplicate dai CONTEXT).
- Una spec unitaria che importava `AppModule` senza `.env` ha rotto la CI della PR #25: la repro ha richiesto `env -i` da una cartella vuota.
- Due commit subject oltre i 72 caratteri lasciati perché il classificatore ha negato l'amend.

### Patterns Established
- Atomicità per costruzione (update condizionali, transazioni solo multi-documento), `WalletService` unico scrittore, prezzo dal catalogo.
- Codici di dominio stabili in `extensions.code` (`BAD_USER_INPUT`, `SESSION_REVOKED` + `reason`, `TRAVEL_STARVING`, `ITEM_NOT_IN_SHOP`…), mai testo libero verso la FE.
- Semina idempotente al boot + cura a DB; nessun file di contenuto, CLI o migratore nel repo dopo il boot (resta il report nell'handoff).
- Fase inserita (N.1) per le correzioni che nascono da una UAT FE; companion BE per ogni fase FE che consuma un contratto.
- RED prima di GREEN per ogni task, un commit per task, nessun trailer, PR draft fino al boot reale.

### Key Lessons
1. Le regole di gioco si prendono dall'utente con i dati dentro la domanda (conteggi del DB, id, nomi) e si fissano come D-NN server-side prima di scrivere il generatore.
2. Un contratto non additivo (`infos.enemies`) va dichiarato e allineato con piani FE gated sulla merge, mai consegnato a sorpresa.
3. Le int-spec che aprono Mongoose devono chiudere l'app nel `afterAll` dell'harness, altrimenti jest non esce e l'executor aspetta per sempre.
4. `STATE.md` deve restare un indice: tabelle di performance e decisioni per piano vivono nei SUMMARY e nei CONTEXT.
5. Ogni fase con dati nuovi finisce con un boot reale dall'orchestratore e con i one-off rimossi prima della merge.

### Cost Observations
- Model mix: executor, reviewer, verifier e security auditor su opus (profilo `quality`); orchestrazione nella sessione principale; nessun haiku/sonnet.
- Sessions: non misurate (coppie BE+FE nella stessa sessione dal repo FE).
- Notable: Phase 10 (31 piani) e Phase 11 (27 piani) sono state le più lunghe; i boot reali e le UAT su device hanno pesato più dell'esecuzione dei piani.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | n/a | 21 (+17 FE) | Orchestrazione GSD su due repo con fasi companion, REPO-RULES prima dei planner, boot reale dall'orchestratore, review per area prima di ogni PR |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 4 872 (381 suite) | gate per cartella: `src/auth` 99,86 % righe alla Phase 17 | dipendenze nuove: `firebase-admin`, `class-validator`, `graphology`, `mongodb-memory-server` (dev), gitleaks in CI |

### Top Lessons (Verified Across Milestones)

1. Il contratto si prova sullo schema mergiato, non sul branch: ogni difetto cross-repo della v1.0 è nato da un nome o una forma assunti prima della merge.
2. Il DB è la verità dei timer e dei dati del mondo; i job e i file sono trigger o rumore.
