---
phase: 18-quest-heal-per-taglia
verified: 2026-11-10T12:45:00Z
status: passed
score: 8/8 criteri di successo verificati nel codice (6 pieni; 7 e 8 con la sola parte di contenuto a DB differita) — BE-HEAL-01, 02, 04, 05, 06, 07, 09 soddisfatti; BE-HEAL-03 e BE-HEAL-08 (parte di contenuto) deferred
overrides_applied: 0
re_verification: false
gaps: []
deferred:
  - truth: "BE-HEAL-03 / criterio 4: contenuto delle 166 heal fisse a DB (`prizes.cure` per taglia, `timeToComplete` 2/5/8 h, descrizioni per taglia)"
    addressed_in: "script di contenuto dell'orchestratore dopo la merge (BACKEND-NOTES §3 c)"
    evidence: "CONTEXT D-14 e REPO-RULES: contenuto fuori repo (D-36) dopo la revisione dell'utente e dopo la merge; script 1 con prova a secco 98 villaggi / 59 città / 9 capitali. Finestra merge→contenuto = fail-safe voluto (ogni heal rifiutata con `QUEST_NO_EFFECT`), documentata in BACKEND-NOTES §3 e"
  - truth: "BE-HEAL-08 / criterio 8 (parte di contenuto): `recovery` delle 28 pozioni heal a DB e lore «Il limite del corpo» collegata dalle 28 pozioni"
    addressed_in: "script di contenuto dell'orchestratore dopo la merge (BACKEND-NOTES §3 c)"
    evidence: "Script 2 (28 pozioni) e script 3 (1 lore, 28 collegamenti) nel runbook; tabella dei tempi D-18 in BACKEND-NOTES §3 d. Fino ad allora nessuna pozione è bevibile (`ITEM_NOT_USABLE`), fail-safe documentato. La parte di codice del criterio 8 (integration su prima pozione, ricarica, nessun effetto, attesa di soccorso, viaggio) è invece verificata"
human_verification:
  - test: "UAT su device con la FE Phase 18 (piano FE 18-13): differita, dopo la merge e dopo l'applicazione degli script di contenuto"
    expected: "Heal di villaggio su un personaggio con una ferita in lista e una fuori: una sola tolta, HP al 50 %, `injuriesHealed` sul filo; stesso personaggio a vita piena e senza ferite curabili: foglio strappato (`Quest.noEffect` vero) e `QUEST_NO_EFFECT` forzando l'accettazione; pozione dal Diario: HP e ferita curati, pila − 1, `potionRecoveryUntil` nel futuro, lore «Il limite del corpo» in `loreUnlocked` alla prima bevuta; seconda pozione entro la ricarica: `POTION_RECOVERING` con `recoveryUntil`; pozione a HP pieni senza ferite in lista: `ITEM_NO_EFFECT` senza consumo; in attesa di soccorso `AWAITING_AID`; in viaggio consentita"
    why_human: "Esperienza su device con la FE; richiede il contenuto a DB applicato dopo la merge. Dati e passi: BACKEND-NOTES §3 a (tre heal d'esempio per taglia: quota 0,5 / 0,8 / 1, liste 19 / 28 / 37, 2 / 5 / 8 h), §3 b (bypass dev con `<twitchId di test>` distinto, un solo processo BE, personaggio ferito, pila di pozioni e ricarica preparati dall'orchestratore con script di sola scrittura mirata), §3 c (runbook dei tre script), §3 d (tabella dei tempi), §3 e (finestra merge→contenuto). Differita alla UAT FE 18-13, non bloccante per questa fase BE"
---

# Phase 18: Quest heal per taglia — Verification Report

**Phase Goal:** la cura è un premio esplicito della quest (`Quest.prizes.cure { lifePointsShare, canHeal }`), applicato a ogni quest vinta che la porta con `QuestResult.injuriesHealed`; heal gratuite e rifiutate se senza effetto (`QUEST_NO_EFFECT`, `Quest.noEffect`); pozioni heal bevute dal Diario (`useItem`) con ricarica globale (`LootItem.recovery`, `status.potionRecoveryUntil`) e lore via `LootItem.relatedLore`; contenuto a DB (166 heal, 28 pozioni, lore) scritto dall'orchestratore dopo la merge.
**Verified:** 2026-11-10T12:45:00Z (branch `feat/18-quest-heal-per-taglia`, HEAD `d00c6857`, base `origin/develop` `86095d89`)
**Status:** passed (con due voci deferred di contenuto e UAT differita)
**Re-verification:** No — verifica iniziale

## Goal Achievement

### Criteri di successo (ROADMAP §Phase 18)

| # | Criterio | Stato | Evidenza |
|---|----------|-------|----------|
| 1 | `QuestPrizes.cure` nullable su Mongoose, SDL additivo e input; `cure` assente = nessuna cura | VERIFIED | `src/models/quest/quest-prizes.model.ts`: `QuestCure` + `QuestCureSchema` con `@Prop({ type: QuestCureSchema, default: null })`, `QuestCureInput` in `QuestPrizesInput.cure` (input senza superficie SDL per D-24: lo SDL non lo elenca, coerente col ruling B-IN-06). `cureOf` legge assente/malformata come nessuna cura, quota fuori [0, 1] = 0, `canHeal` filtrata con `isInjuryType`. `quest-prizes.schema.spec.ts`, `quest-cure.spec.ts` (8 casi). Dopo la review A-WR-01: `dropOrphanCatalogRefs` sanifica anche `prizes.cure` sul filo (`quest-catalog.populate.ts`) |
| 2 | Quest vinta con `cure`: HP almeno a `round(max × quota)` col tetto sul massimo dopo la progressione, ferite in `canHeal` tolte nella stessa scrittura; tipo irrilevante; `cureInjuries` pura | VERIFIED | `outcome-plan.ts` righe 354-364: `cure = won ? cureOf(quest.prizes?.cure) : null`, `cureInjuries(fought.injuries, cure?.canHeal ?? [])`, `lifePointsAfterCure` sulla progressione, `'status.injuries': cured.injuries` nello stesso `$set` (riga 439). `cureInjuries` pura e senza effetti (`cure-injuries.ts`, 7 casi). Il ramo Phase 9 D-15 è superato: asserzioni aggiornate in `outcome-plan.spec.ts` e `quest-resolution.service.int-spec.ts` (19 casi, `injuriesHealed` `['deepCut']` / `[]`). Aid clonata senza `cure` (`aid-quest.ts`, `aid-quest.spec.ts`) |
| 3 | `QuestResult.injuriesHealed: [InjuryType!]!` | VERIFIED | Riga SDL `injuriesHealed: [InjuryType!]!` in `QuestResult`; `outcome-plan.ts` riga 490 (`injuriesHealed: cured.healed`), `rescue-plan.ts`, `quest-result.populate`, fixture `test/quests/quest-result.fixture.ts`; `quest-result.schema.spec.ts`, `quest-result.resolver.int-spec.ts` |
| 4 | Contenuto delle 166 heal a DB (script fuori repo) | DEFERRED | Vedi frontmatter: lo applica l'orchestratore dopo la merge. Il codice lo rende leggibile in sicurezza (sanificazione in lettura); runbook e conteggi attesi in BACKEND-NOTES §3 c |
| 5 | Integration (heal villaggio, `cure` null, non heal con `cure`, SDL verbatim, handoff con tre quest d'esempio e runbook) | VERIFIED | `quest-resolution.service.int-spec.ts`, `gm-completion.service.int-spec.ts`, `quest-updated.subscription.int-spec.ts`; `BACKEND-NOTES.md` §0-§4 presente (tre heal d'esempio per taglia §3 a, runbook §3 c). SDL: vedi sotto |
| 6 | `LootItem.recovery`, `LootItem.relatedLore`, `CharacterStatus.potionRecoveryUntil` additivi; nessun processor | VERIFIED | `loot-item.model.ts`: `LootRecovery` (`time`, `turns` interi ≥ 0, `max` `MAX_RECOVERY_VALUE` = 2 147 483 647 dopo B-WR-02), `LootRecoveryInput`; `character-status.model.ts` `potionRecoveryUntil?: Date \| null`; `related-lore.resolvers.ts` field resolver su `LootItem` filtrato per viewer (`visibleRelated`). Nessun sweep né processor aggiunto (grep sui file della fase) |
| 7 | `useItem`: rifiuti in ordine, viaggio consentito, una scrittura atomica, `UseItemResult` completo | VERIFIED | `item-use.plan.ts`: `planItemUse` nell'ordine `refuseWhileAwaitingAid` → `refuseUnlessOwned` → `usablePotionOf` (`ITEM_NOT_USABLE`) → `refuseWhileRecovering` (`POTION_RECOVERING` con data) → `refuseWithoutEffect` (`ITEM_NO_EFFECT`, prima di ogni scrittura); un solo `$set` (HP, ferite via `cureInjuries`, `assets.ownedItems`, `potionRecoveryUntil`) più `$addToSet` della lore con `knowledgeUpdateOf`; filtro di guardia sul valore letto (B-WR-01). `item-use.service.ts`: `connection.transaction`, snapshot in sessione, una `updateOne`, `loreInOrder` dopo il commit, nessuna emissione a mano. `item-use.resolver.ts` su bearer → `currentCharacter` (nessuno `@OwnsCharacter`). Nessun controllo su viaggio: consentita. Prove: `item-use.plan.spec.ts` (33), `use-item.int-spec.ts` (15, tra cui `POTION_RECOVERING` con istante), `item-use.service.int-spec.ts` (corsa fra due bevute parallele, scrittura unica nella transazione, scrittura interposta conservata, `ITEM_NOT_OWNED` su scrittura nulla). `extensions.recoveryUntil` sopravvive a `formatDomainError` e alla produzione (allowlist con controllo ISO in `format-domain-error.ts` e `production-errors.ts`; `production-surface.int-spec.ts`, casi HTTP e ws) |
| 8 | Contenuto delle pozioni e lore a DB; integration su prima pozione, seconda entro la ricarica, nessun effetto, soccorso, viaggio | VERIFIED (codice) / DEFERRED (contenuto) | Parte di codice come al criterio 7 (`use-item.int-spec.ts`, `item-use.plan.spec.ts`). Contenuto a DB: deferred, vedi frontmatter |

**Score:** 8/8 criteri verificati nel codice; il contenuto a DB dei criteri 4 e 8 è deferred per decisione (D-14).

### BE-HEAL-09 (aggiunto 2026-11-10, regola dell'utente)

Verificato nel codice: predicato puro unico `healHasNoEffect` (`src/quests/outcomes/injuries/heal-no-effect.ts`, `cure` assente = senza effetto, tetto `round(max × quota)`, ferite curabili via `cureInjuries`) usato sia da `QuestAcceptanceService.effectiveOrReject` (rifiuto `GameRuleException.questNoEffect()`, solo per `QuestType.heal`) sia dal field resolver `QuestNoEffectResolver` (`Quest.noEffect: Boolean!`, falso per altri tipi e senza personaggio corrente, nessuna eccezione per ruolo, vitali letti per subscriber da `ViewerVitalsService`). Prove: `heal-no-effect.spec.ts`, `viewer-vitals.service.spec.ts`, `accept-quest.resolver.int-spec.ts` (`QUEST_NO_EFFECT` sul filo), `quest-acceptance.service.int-spec.ts`, `quests.resolver.int-spec.ts` (tabella dei sei fatti, legacy), `quest-updated.subscription.int-spec.ts` (valore diverso per lo stesso subscriber fra due eventi, 40 → 60 → 40).

## Contratto FE (REPO-RULES §Contratto FE)

`git diff origin/develop -- src/schema.gql`: solo righe aggiunte (nessuna rimossa o modificata). Nomi alla lettera:

| Voce del contratto | Stato | Evidenza |
|--------------------|-------|----------|
| `QuestCure { lifePointsShare: Float!, canHeal: [InjuryType!]! }`, `QuestPrizes.cure: QuestCure` | OK | SDL |
| `QuestResult.injuriesHealed: [InjuryType!]!` | OK | SDL |
| `Quest.noEffect: Boolean!` | OK | SDL |
| `LootRecovery { time: Int!, turns: Int! }`, `LootItem.recovery: LootRecovery`, `LootItem.relatedLore: [Lore!]!` | OK | SDL |
| `CharacterStatus.potionRecoveryUntil: DateTime` | OK | SDL |
| `Mutation.useItem(itemId: ID!): UseItemResult!` | OK | SDL |
| `UseItemResult { hpAfter, hpBefore, injuriesHealed, loreUnlocked, quantityLeft, recoveryUntil }` (tipi e nullabilità come in REPO-RULES) | OK | SDL |
| Codici `QUEST_NO_EFFECT`, `ITEM_NOT_USABLE`, `POTION_RECOVERING`, `ITEM_NO_EFFECT` (+ `AWAITING_AID`, `ITEM_NOT_OWNED` esistenti) | OK | `game-rule-error-code.enum.ts`, `game-rule.exception.spec.ts` |
| `extensions.recoveryUntil` ISO | OK | formatter e produzione |

Nota di coerenza: le REPO-RULES citano `QuestCureInput`/`LootRecoveryInput` come input; esistono nei modelli ma, per D-24 e ruling B-IN-06, senza superficie SDL (nessuna mutation admin li espone). Non è uno scostamento dal contratto FE.

## Requisiti

| Requisito | Stato | Evidenza |
|-----------|-------|----------|
| BE-HEAL-01 | SATISFIED | criterio 1 |
| BE-HEAL-02 | SATISFIED | criterio 2 |
| BE-HEAL-03 | DEFERRED | contenuto a DB, script dell'orchestratore dopo la merge; resta Pending in REQUIREMENTS.md |
| BE-HEAL-04 | SATISFIED | criterio 3 |
| BE-HEAL-05 | SATISFIED | criterio 5, handoff presente |
| BE-HEAL-06 | SATISFIED | criterio 6 |
| BE-HEAL-07 | SATISFIED | criterio 7 |
| BE-HEAL-08 | codice SATISFIED, contenuto DEFERRED | lore e `recovery` a DB; resta Pending in REQUIREMENTS.md |
| BE-HEAL-09 | SATISFIED | sezione dedicata sopra |

Nessun requisito orfano: i nove BE-HEAL mappati alla Phase 18 compaiono nei piani. Stato in REQUIREMENTS.md coerente (07 spuntati, 03 e 08 aperti).

## Evidenza d'esecuzione

Nessun jest lanciato da me (`npm run test:cov` dell'orchestratore in corso sullo stesso albero). Numeri del gate dopo i fix, registrati in `18-REVIEW-FIX.md`: `tsc` 0; unit 254 suite / 3239 test; integration 136 int-spec verdi in quattro blocchi (481 + 683 + 200 + 617); boot reale `test/app.int-spec.ts` 84/84; SDL invariato dopo ogni commit. Spec citate lette e presenti nell'albero: titoli e asserzioni corrispondono a ciò che dichiarano (D-NN nei titoli, `injuriesHealed` e codici sul filo).

| Comando | Esito |
|---------|-------|
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `git diff origin/develop -- src/schema.gql` | solo righe aggiunte, nomi del contratto verificati |
| grep `TODO/FIXME/XXX` su `src/quests/outcomes/injuries`, `src/quests/no-effect`, `src/characters/items` | vuoto |

## Review

`18-REVIEW-FIX.md`: 14 finding in scope, 11 fixed (A-WR-01, A-IN-01, A-IN-02, A-IN-04, B-WR-01, B-WR-02, B-IN-01, B-IN-02, B-IN-03, B-IN-04, B-IN-07), 3 skipped per ruling (A-IN-03 chiuso dalla verifica, B-IN-05 e B-IN-06 `NOT NEEDED`). I due warning (cure malformata sul filo, filtro di scrittura di `useItem` più stretto del piano) sono corretti nel codice letto: `cureOf` in `dropOrphanCatalogRefs`, `recoveryAsRead` e `MAX_RECOVERY_VALUE`.

## Anti-Patterns

Nessun blocker, nessuno stub. Rischio residuo dichiarato e documentato (non gap): `LootItem.recovery` non è sanificata sul filo, quindi un valore oltre 2^31 − 1 scritto col driver nativo romperebbe la serializzazione delle liste che lo selezionano; lo script di contenuto lo deve validare (BACKEND-NOTES §3 c, ruling B-WR-02). N+1 dell'oste su `LootItem.relatedLore` accettato (T-18-21, §1.5).

## Verifica umana

Differita alla UAT FE 18-13 (dopo la merge e dopo il contenuto): passi e dati nel frontmatter e in BACKEND-NOTES §3 a-e. Prerequisito: PR in draft finché l'orchestratore non può applicare gli script subito dopo la merge e il riavvio del BE (finestra §3 e: heal tutte rifiutate con `QUEST_NO_EFFECT`, nessuna pozione bevibile).

## Gaps Summary

Nessun gap: ogni promessa dei piani 18-01..18-11 è mantenuta dal codice. Due voci deferred (BE-HEAL-03 e la parte di contenuto di BE-HEAL-08) per decisione D-14, e UAT su device differita alla FE 18-13.

---

_Verified: 2026-11-10T12:45:00Z_
_Verifier: Claude (gsd-verifier)_
