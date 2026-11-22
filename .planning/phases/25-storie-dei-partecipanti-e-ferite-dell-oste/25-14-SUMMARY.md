---
phase: 25-storie-dei-partecipanti-e-ferite-dell-oste
plan: 14
subsystem: docs
tags: [handoff, backend-notes, requirements, validation, sdl]
requires:
  - "gate 25-13 verde (HEAD 36842e05)"
provides:
  - "BACKEND-NOTES.md: contratto della fase per la FE Phase 24 e compiti dell'orchestratore"
  - "BE-WOUND-01..06 e BE-STORY-01..06 chiusi in REQUIREMENTS.md"
  - "25-VALIDATION.md firmata; ROADMAP e STATE a 14/14"
affects: [FE Phase 24]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/25-storie-dei-partecipanti-e-ferite-dell-oste/BACKEND-NOTES.md
  modified:
    - .planning/phases/25-storie-dei-partecipanti-e-ferite-dell-oste/25-VALIDATION.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
decisions:
  - "La domanda 4 della FE (ferita simulata già portata e rimandata invariata) ha risposta negativa al salvataggio: dichiarata nel handoff e lasciata come punto aperto, senza toccare il codice"
  - "La sezione delle aggiunte è sostituita per intero (non fusa per personaggio): dichiarata alla FE come differenza rispetto alla sua ipotesi, equivalente finché manda una voce per partecipante"
metrics:
  completed: 2026-11-21
  tasks: 2
  commits: 3
---

# Phase 25 Plan 14: handoff `BACKEND-NOTES.md` e chiusura — Summary

Il contratto della fase è consegnato alla FE Phase 24 in `BACKEND-NOTES.md` (dieci blocchi SDL copiati da `src/schema.gql`, semantica per area, codici, nove gruppi di esempi, risposte punto per punto alle undici domande della FE e a N0–N12) e i dodici requisiti della fase sono chiusi dopo il gate verde del piano 13. Nessun file di codice toccato.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 | fd913daa | docs(phase-25): hand off the stories and innkeeper wounds contract |
| 2 | 200b3cc5 | docs(phase-25): close the stories and innkeeper wounds requirements |
| 2 (bookkeeping) | (questo) | docs(phase-25): record plan 14 progress |

## Task 1: sezioni del handoff

| Sezione | Contenuto |
|---------|-----------|
| Intestazione | fase BE 25 ↔ FE 24, ramo, base `e87339bb`, data, numeri del gate 25-13 |
| §0 | otto voci di TL;DR |
| §1 | dieci blocchi SDL verbatim, tabella delle diciotto righe aggiunte, «nessuna riga tolta, nessun handler nuovo», firme delle operazioni usate negli esempi |
| §2 | semantica (a)–(h): origine, cure e «senza effetto», correzioni dei due flussi, bozza, foglio, lettura delle storie, aggiunte, scrittura al completamento |
| §3 | tabella dei codici (`BACKGROUND_ADDITION_TOO_LONG` nuovo, `BAD_USER_INPUT`, `OUTCOME_OVERRIDE_INVALID`, `OUTCOME_NOT_PARTICIPANT`, `QUEST_NO_EFFECT`, `ITEM_NO_EFFECT`) |
| §4 | esempi 4.1–4.9 |
| §5 | finestra FE, cautele, N0–N12, risposte Q1–Q11 al handoff della FE |
| §6 | comportamenti provati per requisito con decisione e percorso della spec; le tre trappole |
| §7 | compiti dell'orchestratore, sette passi di UAT, diagnosi a DB, trappola degli script a DB, decisioni vetabili, punti aperti, deviazioni dei piani |

### Esempi scritti (ogni campo, input e codice nuovo ne ha almeno uno)

| Riga SDL / codice | Semantica | Esempio |
|-------------------|-----------|---------|
| `CharacterStatus.innkeeperInjuries` | §2a | 4.1, 4.2 |
| `ParticipantOverrideInput.injuriesRemoved` | §2c, §2d | 4.3, 4.4 |
| `MissionFightOutcome.innkeeperInjuriesBefore` | §2d | 4.4 |
| `MissionFightEffects.injuriesRemoved` / `innkeeperInjuries` | §2d | 4.4 |
| `MissionDraftStep.stories` | §2g | 4.5 |
| `MissionDraft.backgroundAdditions`, `MissionBackgroundAddition` | §2g | 4.5 |
| `SaveMissionDraftInput.backgroundAdditions`, `MissionBackgroundAdditionInput` | §2g | 4.5 |
| `QuestResult.injuriesRemoved` | §2e | 4.3, 4.7 |
| `QuestResult.backgroundEntryAdded` | §2e, §2h | 4.3, 4.7 |
| `BACKGROUND_ADDITION_TOO_LONG`, `BAD_USER_INPUT` | §3 | 4.6 |
| `QUEST_NO_EFFECT`, `ITEM_NO_EFFECT`, `Quest.noEffect` | §2b | 4.8 |
| `OUTCOME_OVERRIDE_INVALID`, `OUTCOME_NOT_PARTICIPANT` | §2c, §2d, §2g | rimando alla forma di 4.6 (§3) e nota in 4.4 |

### Domande del handoff della FE → risposta

| Domanda | Risposta in breve |
|---------|-------------------|
| Q1 | sezione sostituita per intero (non fusa); testo vuoto accettato; una voce per partecipante a ogni salvataggio va bene |
| Q2 | al salvataggio e, in difesa, al completamento; `extensions` col solo `code` |
| Q3 | `stories`, definitivo |
| Q4 | **no al salvataggio** (`OUTCOME_OVERRIDE_INVALID`), sì al completamento senza correzione; oggi non si produce perché la simulazione sceglie solo ferite non portate; punto aperto in §7 |
| Q5 | `characterUpdated` pubblicato sul solo cambio d'origine (provato sul filo) |
| Q6 | `Quest.noEffect` segue l'origine a ogni lettura |
| Q7 | chiave assente e `null` = «nessuna rimozione»; `[]` accettata, stesso significato |
| Q8 | liste vuote sulle bozze di prima finché lo scontro non è rilanciato |
| Q9 | preso atto (lettura tollerante della FE) |
| Q10 | nessun lavoro BE |
| Q11 | nessun lavoro BE; il BE non confronta l'aggiunta con le voci esistenti |

Dichiarati inoltre, come chiesto dall'orchestratore: un togli-e-riaggiungi non compare né in `injuriesAdded` né in `injuriesRemoved`; uno script di UAT a DB che toglie una ferita da `status.injuries` deve toglierla anche da `status.innkeeperInjuries` nello stesso update.

### Controlli

- Verify automatico del task: verde (otto sezioni, blocchi e nomi presenti, nessun URI).
- Accettazione: `BE-WOUND-0[1-6]` 12 righe, `BE-STORY-0[1-5]` 10, decisioni 54, `N0`..`N12` 14, intestazione delle risposte 1, `Q1`..`Q7` 8, `status.innkeeperInjuries` 6, `<characterId>` 12, ObjectId di 24 cifre esadecimali 0.
- **Operatori Mongo:** tre occorrenze (`$push`, `$set`, `$pull`), tutte dentro code span; controllo a grep e lettura a mano. **Segreti:** nessun URI, host, nome di database, id reale; soli segnaposto fra parentesi angolari.
- I titoli dei casi citati fra caporali sono stati cercati nelle spec e trovati nel file indicato.

## Task 2: chiusura

- `25-13-SUMMARY.md` letto: gate verde, quindi `requirements mark-complete` eseguito per i dodici id (12 caselle e 12 righe della tabella di tracciabilità a `Complete`: lo strumento ha aggiornato entrambe, nessun Edit a mano).
- `25-VALIDATION.md`: righe `25-14-01..02` a verde, frontmatter `status: complete`, `nyquist_compliant: true`, `wave_0_complete: true`, dieci caselle spuntate, `**Approval:** approved 2026-11-21`. Le verifiche manuali restano «da eseguire».
- `ROADMAP.md`: riga `**Stato (2026-11-21)**`, Progress Table a `14/14 | In Progress`, `- [x] 25-14-PLAN.md`; la riga d'elenco della fase resta `[ ]`.
- `STATE.md`: Current focus, Status (con `executing`), Last activity, Next step e `Plan: 14 of 14`; i contatori del frontmatter (`total_plans`, `completed_plans`, `percent`) non toccati, come nei piani precedenti.

## Deviations from Plan

1. **Segnaposto in più negli esempi:** oltre a `<characterId>`, `<pendingQuestId>` e `<questResultId>` servivano `<otherCharacterId>`, `<enemyId>`, `<questId>` e `<itemId>` per scrivere operazioni complete; stessa forma, nessun valore reale.
2. **Domanda 4 della FE con risposta negativa:** il piano chiedeva una risposta per ogni domanda; il codice (caso «passes through a simulated injury the character already owns (D-14)») rifiuta al salvataggio la correzione che la FE intendeva mandare. Dichiarato in §5 e come punto aperto in §7; nessun cambio di codice (fuori dallo scopo di un piano di soli documenti).
3. **Voce BE-STORY-06 in §6:** aggiunta per completezza (il piano elencava BE-STORY-01..05).
4. **STATE.md:** oltre ai campi del piano, aggiornati `stopped_at`, `last_updated` e `last_activity` del frontmatter.
5. Bookkeeping fatto con Edit mirati via script, non con `state advance-plan` / `roadmap update-plan-progress` (trappole note di gsd-tools su questo repo); `requirements mark-complete` è l'unico comando di gsd-tools usato.

Nessun `npm run build`, nessun `npm run test:cov`, nessun avvio del BE, nessuna lettura di `.env`, nessun push, nessuna PR.

## Resta all'orchestratore

- `npm run test:cov` in background; verifica e audit della fase.
- Push del ramo e PR verso `develop`.
- Build e riavvio del BE dal ramo (nessun migratore); controllo delle bozze guidate aperte.
- Brief della FE con §0–§5 del handoff; in particolare **Q1** (sostituzione intera) e **Q4** (risposta negativa) vanno portate al gate della FE.
- UAT su device, un passo per messaggio (`BACKEND-NOTES.md` §7), con la trappola degli script a DB.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- `BACKEND-NOTES.md` presente; commit `fd913daa` e `200b3cc5` in `git log`.
- `REQUIREMENTS.md`: 12 caselle e 12 righe `Complete`; `25-VALIDATION.md`: nessuna riga `pending`, una riga `Approval` approvata.
