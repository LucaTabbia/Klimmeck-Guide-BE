---
phase: 12-negozi-per-citta
plan: 19
subsystem: docs
tags: [handoff, runbook, shops, pets, closure]
requires:
  - phase: 12-negozi-per-citta
    provides: "contratto SDL della fase, gate 12-18 verde"
provides:
  - "BACKEND-NOTES.md: handoff per la FE Phase 13 e runbook del primo boot (D-21)"
  - "Phase 12 chiusa in ROADMAP (19/19 Complete) e STATE (Plan 19 of 19)"
affects: [FE Phase 13 piani 13-10/13-11, primo boot sul DB reale, BE Phase 13/14]
tech-stack:
  added: []
  patterns: ["handoff per-fase con SDL copiato da src/schema.gql e solo placeholder"]
key-files:
  created:
    - .planning/phases/12-negozi-per-citta/BACKEND-NOTES.md
  modified:
    - .planning/ROADMAP.md
    - .planning/STATE.md
    - .planning/phases/12-negozi-per-citta/12-VALIDATION.md
key-decisions:
  - "REQUIREMENTS.md non toccato: caselle BE-SHOP-01..06 e riga di tracciabilità già `Complete (gate 12-18, 2026-11-03; …)`"
  - "Nessun id reale (né delle città né dei pet) nel handoff: i pet si citano per nome e per la costante SELLABLE_PET_PLACEMENTS"
metrics:
  duration: "~20 min"
  completed: 2026-11-03
  tasks: 2
  files: 4
---

# Phase 12 Plan 19: Handoff FE Phase 13 e chiusura della fase Summary

Handoff `BACKEND-NOTES.md` in italiano (13 sezioni `##`, §0–§12) con lo SDL copiato da `src/schema.gql`, l'ordine dei rifiuti di `doTransaction`, i casi limite per il FE, le città della UAT, le costanti della semina, il runbook del primo boot con i log reali del codice e le query di controllo; Phase 12 chiusa in ROADMAP/STATE/VALIDATION.

## Task

| Task | Nome | Commit | File |
| --- | --- | --- | --- |
| 1 | `BACKEND-NOTES.md` per la FE Phase 13 e runbook | `b23369d` | `.planning/phases/12-negozi-per-citta/BACKEND-NOTES.md` |
| 2 | Chiusura in ROADMAP, STATE, VALIDATION | `f26f1c9` | `.planning/ROADMAP.md`, `.planning/STATE.md`, `12-VALIDATION.md` |

## Contenuto del handoff

- §0 TL;DR (6 punti, PR BE prima dei piani gated FE D-12/D-16); §1 SDL nuovo (blocchi `CityShop`, `CitySize`, `City`, `CharacterAssets`, `Pet`, `TransactionItems`, `EquipPetRequest`, `UnequipPetRequest`, `ShopPoolReportEntry`, `ShopPoolReportItem`, righe Query/Mutation); §2 le due righe deprecate; §3 `cityShop` (query d'esempio, veti, ordine, `quantity: 1`, `NOT_FOUND`/`BAD_USER_INPUT`); §4 `size`/`hasShop`; §5 compagni (fragment `PetFields`, `equipPet`/`unequipPet` idempotenti, ammessi in viaggio); §6 ordine dei rifiuti D-19, codici nuovi, INSUFFICIENT_ITEM_QUANTITY sulla guardia pet fallita in scrittura; §7 città UAT con i 4 pet e i prezzi; §8 quote/pesi/garanzie/seme; §9 runbook (a–g) con i messaggi di log copiati da `src/shops/maintenance/*.ts`; §10 A1/A2/A5; §11 note per le fasi successive; §12 numeri del gate.
- Log copiati dal codice, non dalle note: l'etichetta del primo passo di `ShopBoot` è `valorizzazione di Pet.sellable` (corretta dopo la prima stesura, prima del commit).

## Verifiche

- Verify automatico del Task 1: tutti i grep verdi; URI Mongo = 0; `^## ` = 13; Talmvere 4, Necrorian 7, `Phase 12: use cityShop` 3, `ITEM_NOT_IN_SHOP` 4, A1 1, A2 1; nessuna stringa esadecimale da 24 caratteri; operatori Mongo (`$unset`) e variabili GraphQL solo nei blocchi di codice.
- Task 2: `- [ ] 12-NN-PLAN.md` = 0; riga Progress Table = 1; `- [x] **BE-SHOP-0` = 6; righe VALIDATION `⬜ pending` = 0; trailer = 0 su entrambi i commit; `git status --short` vuoto.
- Nessun codice toccato: tsc/jest/prettier non applicabili (nessun file `.ts` nel diff del piano); `src/schema.gql` invariato.

## Deviations from Plan

- **REQUIREMENTS.md non modificato:** il piano chiedeva la riga di tracciabilità `Complete (<data>)`, già presente dal gate 12-18 (`Complete (gate 12-18, 2026-11-03; …)`); per istruzione dell'orchestratore non è stato toccato.
- **STATE.md a mano (python3 utf-8), senza `gsd-tools phase complete`:** frontmatter `stopped_at`/`last_updated`/`last_activity`/`completed_phases` 15/`completed_plans` 191/`percent` 100, Current focus, Current Position (`Plan: 19 of 19`, `Status:` con «complete» e review/PR a carico dell'orchestratore), Session Continuity. Il campo frontmatter `status: executing` lasciato invariato.
- **Bookkeeping:** fatto nel Task 2 come prescrive il piano; il SUMMARY va nel commit separato `docs(phase-12): record plan 19 progress`.

## Self-Check: PASSED

- FOUND: `.planning/phases/12-negozi-per-citta/BACKEND-NOTES.md`
- FOUND: `b23369d`, `f26f1c9`
