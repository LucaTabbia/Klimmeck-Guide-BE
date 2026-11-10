# Roadmap: Klimmeck Guide — Backend

**Created:** 2026-07-16
**Last updated:** 2026-11-10 — v1.0 Core Loop (BE) consegnata e archiviata in `milestones/v1.0-ROADMAP.md`
**Milestone:** nessuna attiva — v1.1 da definire con `/gsd-new-milestone`

## Milestones

- ✅ **v1.0 Core Loop (BE)** — Phases 1–17 con le inserite 2.1, 3.1, 9.1, 9.2, 13.1 (consegnata il 2026-11-10) — [archivio roadmap](milestones/v1.0-ROADMAP.md) · [archivio requisiti](milestones/v1.0-REQUIREMENTS.md) · [riepilogo](MILESTONES.md)
- 📋 **v1.1** — da definire. Candidati già discussi su branch: Phase 18 Quest heal per taglia (+ pozioni dal Diario con ricarica globale) su `feat/18-quest-heal-per-taglia` ↔ FE 18; Phase 19 Revisione dei modelli su `feat/19-revisione-dei-modelli` ↔ FE 19; Phase 20 Cibo e vita progressivi (solo BE) su `feat/20-cibo-e-vita-progressivi`. Quei branch toccano questo file, `REQUIREMENTS.md` e `STATE.md` e vanno ribasati sulla chiusura della v1.0.

## Phases

<details>
<summary>✅ v1.0 Core Loop (BE) (Phases 1–17 + 2.1, 3.1, 9.1, 9.2, 13.1) — SHIPPED 2026-11-10</summary>

- [x] Phase 1: Fondazione Test & Consolidamento Spell WIP (5/5 plans) — completed 2026-07-23
- [x] Phase 2: Auth & Identity Foundation (10/10 plans) — completed 2026-10-06
- [x] Phase 2.1: Character Creation Contract (8/8 plans, INSERTED) — completed 2026-10-09
- [x] Phase 3: Autorizzazione: Ownership, Ruoli, Audit (10/10 plans) — completed 2026-10-14
- [x] Phase 3.1: Character Deletion Contract (6/6 plans, INSERTED) — completed 2026-10-16
- [x] Phase 4: Integrità Economica (Atomics) (9/9 plans) — completed 2026-10-18
- [x] Phase 5: Infrastruttura Push FCM (8/8 plans) — completed 2026-10-18
- [x] Phase 6: EventSub: Punti Canale & Streamer Live (9/9 plans) — completed 2026-10-21
- [x] Phase 7: Quest Lanes (QUEST-04) (8/8 plans) — completed 2026-10-21
- [x] Phase 8: Travel Lifecycle (TRAVEL-01) (14/14 plans) — completed 2026-10-21
- [x] Phase 9: Combat Result & Admin Outcomes (20/20 plans) — completed 2026-10-26
- [x] Phase 9.1: Spell State and Recovery Contract (10/10 plans, INSERTED) — completed 2026-10-27
- [x] Phase 9.2: Quest Result Delivery Contract (7/7 plans, INSERTED) — completed 2026-10-28
- [x] Phase 10: Hardening Trasversale (31/31 plans) — completed 2026-10-30
- [x] Phase 11: Popolamento del mondo (27/27 plans) — completed 2026-11-02
- [x] Phase 12: Negozi per città (19/19 plans) — completed 2026-11-03
- [x] Phase 13: Generazione quest (20/20 plans) — completed 2026-11-04
- [x] Phase 13.1: Correzioni generazione quest (8/8 plans, INSERTED) — completed 2026-11-05
- [x] Phase 14: Viaggio e cibo (8/8 plans) — completed 2026-11-05
- [x] Phase 15: Imboscate in viaggio (12/12 plans) — completed 2026-11-06
- [x] Phase 16: Lore sbloccabili (12/12 plans) — completed 2026-11-07
- [x] Phase 17: Autorizzazione e sessioni (10/10 plans) — completed 2026-11-09

Ordine seguito: numerico, con le inserite subito dopo la fase madre; ogni contratto consumato dalla FE è arrivato su `develop` prima della fase FE corrispondente (tabella «Backend ↔ Frontend alignment» nell'archivio). Goal, criteri di successo, piani e tracciabilità: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md).

</details>

### 📋 v1.1 (da definire)

Le fasi dalla 18 in su vengono aggiunte qui da `/gsd-new-milestone`; la numerazione continua da 18 (mai riparte). I contesti delle Phase 18, 19 e 20 esistono già sui rispettivi branch (vedi Milestones).

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Fondazione Test & Consolidamento Spell WIP | v1.0 | 5/5 | Complete | 2026-07-23 |
| 2. Auth & Identity Foundation | v1.0 | 10/10 | Complete | 2026-10-06 |
| 2.1. Character Creation Contract | v1.0 | 8/8 | Complete | 2026-10-09 |
| 3. Autorizzazione: Ownership, Ruoli, Audit | v1.0 | 10/10 | Complete | 2026-10-14 |
| 3.1. Character Deletion Contract | v1.0 | 6/6 | Complete | 2026-10-16 |
| 4. Integrità Economica (Atomics) | v1.0 | 9/9 | Complete | 2026-10-18 |
| 5. Infrastruttura Push FCM | v1.0 | 8/8 | Complete | 2026-10-18 |
| 6. EventSub: Punti Canale & Streamer Live | v1.0 | 9/9 | Complete | 2026-10-21 |
| 7. Quest Lanes (QUEST-04) | v1.0 | 8/8 | Complete | 2026-10-21 |
| 8. Travel Lifecycle (TRAVEL-01) | v1.0 | 14/14 | Complete | 2026-10-21 |
| 9. Combat Result & Admin Outcomes | v1.0 | 20/20 | Complete | 2026-10-26 |
| 9.1. Spell State and Recovery Contract | v1.0 | 10/10 | Complete | 2026-10-27 |
| 9.2. Quest Result Delivery Contract | v1.0 | 7/7 | Complete | 2026-10-28 |
| 10. Hardening Trasversale | v1.0 | 31/31 | Complete | 2026-10-30 |
| 11. Popolamento del mondo | v1.0 | 27/27 | Complete | 2026-11-02 |
| 12. Negozi per città | v1.0 | 19/19 | Complete | 2026-11-03 |
| 13. Generazione quest | v1.0 | 20/20 | Complete | 2026-11-04 |
| 13.1. Correzioni generazione quest | v1.0 | 8/8 | Complete | 2026-11-05 |
| 14. Viaggio e cibo | v1.0 | 8/8 | Complete | 2026-11-05 |
| 15. Imboscate in viaggio | v1.0 | 12/12 | Complete | 2026-11-06 |
| 16. Lore sbloccabili | v1.0 | 12/12 | Complete | 2026-11-07 |
| 17. Autorizzazione e sessioni | v1.0 | 10/10 | Complete | 2026-11-09 |

---

_Roadmap creata: 2026-07-16_ · _v1.0 Core Loop (BE) archiviata: 2026-11-10_
