---
phase: 16-lore-sbloccabili
group: C
reviewed: 2026-11-07T13:45:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - src/quests/outcomes/combat/combat-context.ts
  - src/quests/outcomes/combatant-plan.ts
  - src/quests/outcomes/gm-completion.service.ts
  - src/quests/outcomes/outcome-plan.ts
  - src/quests/outcomes/quest-outcomes.module.ts
  - src/quests/outcomes/rescue-plan.ts
  - src/quests/outcomes/rescue-resolution.service.ts
  - src/quests/outcomes/resolution-loader.service.ts
  - src/quests/outcomes/rewards/quest-rewards.ts
  - src/quests/outcomes/victory-knowledge.ts
  - src/migrations/lore-backfill/lore-backfill.boot.ts
  - src/migrations/lore-backfill/lore-backfill.migrator.ts
  - src/migrations/lore-backfill/lore-backfill.module.ts
  - src/migrations/lore-backfill/lore-backfill.ts
  - src/app.module.ts
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: issues_found
---

# Phase 16 - Review gruppo C (esiti e backfill)

## Summary

Nessun difetto di correttezza o sicurezza. Verificato: dedup per hex e ref malformati scartati in `victoryKnowledgeOf`; `planParticipant` con `won` = verdetto diverso da failure, `loreUnlocked` = sole novità, `update` con `knowledgeAdditionOf` vuoto = `{}` (byte-identico, D-14), sconfitta e `unchangedResult` con `loreUnlocked: []`; `OUTCOME_CHARACTER_PROJECTION` già `status: 1`; tiri dello studio solo con pool e dopo `petDrawOf` (nessun tiro in più per le altre quest, `readCombatCatalog` non legge il pool), chance 0 e 1 corrette (`gate >= chance`), clamp del pick, esclusione per hex incluse le lore della stessa vittoria; `returnCityOf` fuori transazione, `planRescued` aggiunge solo con `cityMarker`; GM e `planCombatant` passano `victoryKnowledgeOf(catalog)` per vincitore; `loreConfigProvider` registrato una volta e `@Optional()` sul loader (default 0.5); backfill idempotente per unione, solo personaggi attivi, `idForms`, nessun set dell'intero insieme, boot che non propaga eccezioni, modulo importato solo da `AppModule` (spec lo prova). Nessun `process.env`, `Date.now` o `Math.random` nuovo (il solo `Math.random` è in `ChanceSource`, preesistente). Spec unit mirate dei file del gruppo verdi (8 suite, 144 test).

## Critical

Nessuno.

## Warning

Nessuno.

## Info

### C-IN-01: helper di dedup duplicato fra victory-knowledge e backfill

**File:** `src/migrations/lore-backfill/lore-backfill.ts:25` (e `src/quests/outcomes/victory-knowledge.ts:31`)
**Issue:** `uniqueIdsOf` e `uniqueByHex` fanno la stessa deduplicazione per esadecimale.
**Why it matters:** micro-duplicazione; il backfill però esce dal repo, quindi il costo è nullo a regime.
**Suggested fix:** nessuna azione: il backfill viene rimosso prima della merge.

### C-IN-02: il boot del backfill ritarda `listen` senza limite di tempo

**File:** `src/migrations/lore-backfill/lore-backfill.boot.ts:12`
**Issue:** `await this.migrator.backfillAll()` in `onApplicationBootstrap` blocca l'avvio finché il passo non termina (mai in errore, ma anche senza timeout). È lo stesso schema di `QuestMaintenanceBoot` e coerente con D-11 (con 4 personaggi è istantaneo).
**Why it matters:** su un DB lento o con un collo di bottiglia il boot reale resterebbe fermo; a regime irrilevante.
**Suggested fix:** nessuna azione; se si volesse, annotare nel handoff che il log `Backfill delle lore: ...` compare prima di `listen`.
