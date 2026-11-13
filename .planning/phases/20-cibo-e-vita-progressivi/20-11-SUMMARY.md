---
phase: 20-cibo-e-vita-progressivi
plan: 11
subsystem: travel
tags: [handoff, uat, validation, requirements, bookkeeping]
requires:
  - 20-10 (gate) e i fix della review (HEAD 3175329d)
provides:
  - handoff BACKEND-NOTES.md per la FE e per la UAT su device
  - VALIDATION firmata, BE-FOODP-01..05 chiusi, ROADMAP e STATE a 11/11
affects: [orchestratore: test:cov, verifica, audit di sicurezza, riavvio reale, UAT su device, PR]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/20-cibo-e-vita-progressivi/BACKEND-NOTES.md
    - .planning/phases/20-cibo-e-vita-progressivi/20-11-SUMMARY.md
  modified:
    - .planning/phases/20-cibo-e-vita-progressivi/20-VALIDATION.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
decisions:
  - "Il passo degli scatti di fame nel handoff segue il codice (un km = un'ora / speedFactor a passo base), non la stima «circa 6 minuti» della ricerca"
  - "Nessuna domanda per la FE: D-10 senza azioni, D-18 senza cambi di testo (la FE non etichetta hpBefore come vita alla partenza)"
metrics:
  duration: ~20 min
  completed: 2026-11-13
---

# Phase 20 Plan 11: Chiusura della fase Summary

Handoff `BACKEND-NOTES.md` sul codice finale (HEAD `3175329d` più i commit di documentazione): nessun cambio sul filo con la prova dello SDL, semantica nuova per la FE Phase 15 (vita a scatti di un km nel tratto scoperto, cibo in blocco una volta, `hpBefore` al km dell'imboscata, `characterUpdated` senza cambi visibili in due casi), comportamenti provati col percorso delle spec, piano di UAT su device «da eseguire»; VALIDATION firmata e BE-FOODP-01..05 chiusi.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 | `ec5c6e54` | docs(phase-20): write the FE handoff and the device UAT plan |
| 2 | `75d5e0dd` | docs(phase-20): sign the validation and close the requirements |
| 2 (bookkeeping) | commit `docs(phase-20): record plan 11 progress` | |

## Sezioni del handoff

- **Intestazione:** fase, data, branch → PR verso `develop` dell'orchestratore, gate POST-FIX (unit 274/3591, integration 141/2037, coverage travel 98,75/86,99/99,37, acceptance 99,06/92,79/99,73), `test:cov`, verifica e audit «in arrivo».
- **§0 TL;DR:** niente di nuovo sul filo, partenza senza scritture, scatti di un km e cibo in blocco, tutto da `characterUpdated`, `hpBefore` al km dell'imboscata.
- **§1 Nessun cambio sul filo:** `git diff 466be7e7 -- src/schema.gql` vuoto (verificato), piano interno `ActiveTravelFood`, mutation/query invariate (nomi verificati nello SDL), indice nuovo.
- **§2 Semantica nuova (a–i, l):** emenda `15-VERIFICATION.md` della FE (frase trovata lì, non in un'altra cartella); D-19 con la frase chiarita dopo la review; D-17; D-18 col riscontro sulla FE (`quest_result_sheet.dart`, `completion_recap.dart`); A-IN-02 dichiarato.
- **§3 Comportamenti provati:** 15 righe, ogni percorso verificato con `test -f` e ogni describe/titolo citato verificato con grep sulla HEAD.
- **§4 UAT su device:** prerequisiti (nessun migratore, indice al boot, viaggi nuovi, spostamento di `startTime`/`endTime` per tempi da UAT), 7 passi uno per messaggio (viaggio lungo con poco cibo, confine, scatti con pozione, arrivo, sconfitta seminata al km 30 nelle due varianti di copertura, teleport, legacy), diagnosi con i testi di log copiati dal codice.
- **§5:** nessuna domanda per la FE; deviazioni e scelte (passo dei km, casi verdi al primo colpo, spec riscritte oltre la ricerca, scelte del planner, fix interni della review).

## Controllo sugli operatori

`grep -nE '[$](set|unset|inc|and|or|gte|lte|in|elemMatch)\b' BACKEND-NOTES.md` non stampa nulla: nessun operatore Mongo nel handoff (le semine sono descritte coi soli nomi dei campi). Nessuna URI, host, nome del database né `twitchId` reale; solo segnaposto `<characterId>`, `<poiId>`, `<twitchId di test>`.

## Requisiti chiusi

BE-FOODP-01..05 con `requirements mark-complete` (dopo il gate verde del piano 10 e quello post-fix): cinque checkbox `[x]` e cinque righe di tracciabilità `Complete`, controllate a mano; nessun'altra riga di `REQUIREMENTS.md` toccata.

## Deviazioni dal piano

**1. [Rule 1 - Fatto errato nel piano] Passo degli scatti di fame**
- **Trovato durante:** Task 1
- **Problema:** il piano (da RESEARCH C-3) scrive «circa ogni 6 minuti a passo base (10 km/h)». Nel codice `BASE_SPEED = 10` è un'unità di velocità, non km/h: `durationMsOf(baseHours, speed)` = ore base × `BASE_SPEED` / velocità, con ore base = km / `speedFactor` (`src/roads/`); a passo base un km dura un'ora / `speedFactor` (la prova fine a fine su R1: 20,015 km in 72 054 312 ms).
- **Fix:** l'handoff usa il valore del codice e spiega in §4 come la UAT accorcia i tempi (spostamento di `startTime`/`endTime`); deviazione dichiarata anche in §5. La regola di gioco non cambia.
- **Commit:** `ec5c6e54`

**2. Nessun jest eseguito (sanzionato dall'orchestratore):** il piano non chiede spec, e l'orchestratore stava eseguendo `npm run test:cov` sullo stesso albero; i numeri citati sono quelli del gate post-fix (`20-REVIEW-FIX.md`).

**3. Stato della fase:** riga della Progress Table a `11/11 | In Progress`, nessun `phase complete`, riga d'elenco della fase in ROADMAP a `[ ]` (istruzione dell'orchestratore). Gli strumenti `state advance-plan` / `update-progress` / `record-metric` non usati: STATE aggiornato a mano (Edit e python3 utf-8) per non riscrivere il formato del corpo.

**4. Data:** il handoff porta 2026-11-12 (scritto prima della mezzanotte), ROADMAP, STATE e VALIDATION 2026-11-13.

## Known Stubs

Nessuno (piano di soli documenti).

## Self-Check: PASSED

- `BACKEND-NOTES.md`, `20-11-SUMMARY.md` presenti; commit `ec5c6e54`, `75d5e0dd` nel log del ramo.
