---
phase: 24-origini-delle-magie-quest-void-e-shamanic
plan: 12
subsystem: handoff
tags: [handoff, backend-notes, requirements, validation]
requires: ["24-11"]
provides:
  - "BACKEND-NOTES.md: handoff per la FE Phase 23 e runbook dell'orchestratore (§0..§7)"
  - "BE-ORIGIN-01..12 chiusi; 24-VALIDATION.md firmata; ROADMAP e STATE a 12/12"
affects: []
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/24-origini-delle-magie-quest-void-e-shamanic/BACKEND-NOTES.md
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
    - .planning/phases/24-origini-delle-magie-quest-void-e-shamanic/24-VALIDATION.md
decisions:
  - "Le tre lore d'origine sono descritte come voci `knowledge` già a DB (W-8, dato dell'orchestratore), da creare solo se mancano"
  - "Osservazione nuova nel §7: con il tipo `knowledge` le lore d'origine entrano anche nel pool di lore dello studio (`STUDY_LORE_TYPES`), quindi possono sbloccarsi prima della prima magia; decisione dell'utente"
metrics:
  completed: 2026-11-15
  tasks: 2
  commits: 3
---

# Phase 24 Plan 12: chiusura della fase e handoff — Summary

Handoff `BACKEND-NOTES.md` per la FE Phase 23 e per l'orchestratore (diff SDL verbatim con la riga tolta e le sei aggiunte, semantica per area, finestra FE, runbook del migratore una tantum col segnaposto del log, compiti di contenuto fuori dal repo, comportamenti provati per requisito, UAT in 8 passi, risposte W-7 e W-8, domande aperte, deviazioni); BE-ORIGIN-01..12 chiusi; `24-VALIDATION.md` firmata; ROADMAP e STATE a 12/12 con ciò che resta all'orchestratore.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 | c0dae707 | docs(phase-24): write the FE handoff and the orchestrator runbook |
| 2 | da1a3aa2 | docs(phase-24): close the requirements |
| 2 | (questo) | docs(phase-24): record plan 12 progress |

## Sezioni del handoff

- Intestazione: fase, requisiti, decisioni, data, branch impilato su `fix/23-dungeon-xp-and-innkeeper-corrections`, numeri del gate 24-11, nessuna variabile d'ambiente né dipendenza né handler nuovi, un migratore una tantum, «il codice vince».
- §0 TL;DR (7 punti); §1 blocchi `type Spell` ed `enum CityType` verbatim, tabella vecchio → nuovo, diff dalla base `a208ad3d` (1 tolta, 6 aggiunte), ciò che non cambia; §2 semantica (a) origine, (b) livello minimo, (c) quest di scuola, (d) lore dell'origine, (e) Necrorian, (f) città; §3 finestra FE (cinque punti); §4 migratore e runbook in sette passi con `### Log del boot reale` e il segnaposto letterale, file da cancellare elencati; §5 compiti di contenuto con la forma dei documenti e l'ordine consigliato; §6 comportamenti provati per BE-ORIGIN-01..12; §7 UAT, risposte alla FE (W-7, W-8), domande aperte, deviazioni, casi verdi al primo colpo.
- Controlli di accettazione: `## 0.`..`## 7.` = 8; `### Log del boot reale` 1; «compito dell'orchestratore» 1; «Nessun file di contenuto nel repo» 2; `minXpToLearn` 11; righe con D-07/10/12/18/20/22/24 42; righe con BE-ORIGIN-NN 25; URI 0; commit del handoff con un solo file.
- Operatori Mongo: una sola riga (184, passo 7 del runbook) con `$unset`, dentro un code span. Nessun segreto, host o nome del database; gli unici id reali sono i tre id di città del CONTEXT (D-15).
- Percorsi delle spec del §6 verificati sul disco (uno corretto prima del commit: `src/quests/party/quest-start.service.spec.ts`).

## Requisiti e VALIDATION

- `requirements mark-complete` BE-ORIGIN-01..12: 12 marcati, tabella di tracciabilità aggiornata dallo strumento (12 righe `Complete`).
- `24-VALIDATION.md`: `status: complete`, `nyquist_compliant: true`, `wave_0_complete: true`; tutte le righe `24-NN-TT` `✅ green` (nessuna `⬜ pending`); Wave 0 e Sign-Off spuntati; `**Approval:** approved 2026-11-15`; le tre verifiche manuali restano «da eseguire».

## Deviations from Plan

- I due commit del Task 2 sono separati riportando indietro le sole righe di bookkeeping (casella del piano, riga della Progress Table, `Plan: 12 of 12`) prima del primo commit e riapplicandole per il secondo.
- Osservazione aggiunta al §7 (non prevista dal piano): sblocco possibile delle lore d'origine dal pool di lore dello studio se restano di tipo `knowledge`.

## Per l'orchestratore

`npm run test:cov`, verifica e audit, PR verso `develop`; backup, boot reale dal ramo col migratore e log nel §4, secondo boot, rimozione del migratore in TDD; contenuto a DB dopo la revisione dell'utente (§5) e `$unset` del campo vecchio dopo la merge; UAT su device con la FE Phase 23 (§7).

## Self-Check: PASSED
