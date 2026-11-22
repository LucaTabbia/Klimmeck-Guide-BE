---
phase: 25-storie-dei-partecipanti-e-ferite-dell-oste
verified: 2026-11-21T18:45:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
---

# Phase 25: Storie dei partecipanti e ferite dell'oste — Verification Report

**Phase Goal:** L'oste legge le storie dei partecipanti prima di risolvere una story/worldMission e alla fine aggiunge a ciascuna; le ferite che infligge di suo pugno sfuggono a ogni cura tranne la sua.
**Verified:** 2026-11-21T18:45:00Z
**Status:** passed
**Re-verification:** No — initial verification
**Branch:** `feat/25-storie-dei-partecipanti-e-ferite-dell-oste` (base `e87339bb`), albero pulito prima e dopo la verifica.

Metodo: lettura del diff del codice applicativo `e87339bb..HEAD` (non dei SUMMARY), ricerca di ogni via che scrive o cura `status.injuries`, `tsc`, spec mirate unit e integration (MongoMemoryReplSet; nessun contatto col DB reale né con l'istanza sulla 3001).

## Goal Achievement

### Observable Truths (Success Criteria della ROADMAP)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | L'oste legge `infos.background` di ogni partecipante con `character(id)` prima dell'avvio e senza bozza; un giocatore che chiede il personaggio altrui è rifiutato | ✓ VERIFIED | Nessuna query nuova (`test/authz/expected-handlers.ts` invariato). `characters-ownership.int-spec.ts:478` (oste legge), `:494` (giocatore rifiutato) verdi |
| 2 | Ferita aggiunta a mano servita in `CharacterStatus.innkeeperInjuries`; heal, pozione e premio `cure` (anche dello stesso esito) non la tolgono né la elencano in `injuriesHealed`; cura che troverebbe solo ferite dell'oste = «senza effetto» | ✓ VERIFIED | `character-status.model.ts` (`@Field` + `@Prop default []`); `cureInjuries(…, untouchable)` è l'unica primitiva di cura e i suoi tre soli chiamanti passano l'origine: `outcome-plan.ts:490` (quest heal, blocco del titolo, premio guidato, con `fought.innkeeperInjuries` = anche la ferita appena inflitta), `item-use.plan.ts:237` (pozione), `heal-no-effect.ts:26` (predicato unico di `acceptQuest` e `Quest.noEffect`). Semplice: `asInnkeeperHand` in `gm-completion.service.ts:136`; guidato: `handInflictedOf` (corretto meno simulato). Int: `gm-completion…:1070,1167`, `guided-completion…:920,1059`, `use-item…:325,348`, `quest-acceptance…:790,797`, `quests.resolver…:940`, `quest-resolution…:317` |
| 3 | Le correzioni tolgono qualunque ferita con `injuriesRemoved`; togli-e-riaggiungi cambia l'origine; ferita portata e non tolta conserva la sua | ✓ VERIFIED | `ParticipantOverrideInput.injuriesRemoved` (validato, tetto); `gm-overrides.ts injuriesRemovedOf` rifiuta con `OUTCOME_OVERRIDE_INVALID` la ferita non portata; `applyWoundCorrection` (prima toglie, poi aggiunge; `fresh` esclude le ferite ancora portate). Int: `gm-completion…:1084,1098,1114,1133,1151`, `guided-completion…:956,1020,1041,1081,1097`; `QuestResult.injuriesRemoved` scritto da `planParticipant` (`fought.removed`), mai fra le guarite |
| 4 | Più scontri: ferita tolta al primo assente al secondo, inflitta a mano resta dell'oste; bozza serve `innkeeperInjuriesBefore`, `injuriesRemoved`, `innkeeperInjuries`; completamento scrive la piega in ordine | ✓ VERIFIED | `fight-state.ts afterFight` usa `applyWoundCorrection` (stato fra scontri), `fightStartOf` fotografa `innkeeperInjuriesBefore`; `guided-outcome.ts aggregateEffectsOf` usa `netWoundCorrectionOf` (piega, l'unione `new Set` è sparita); `mission-draft.mapper.ts` serve i tre campi con default sulle bozze di prima; `assertWoundCorrectionAllowed` al salvataggio e alla rivalidazione del completamento. Int: `guided-completion…:1003`, `guided-mission.resolver.int-spec.ts`, `mission-draft-save.service.int-spec.ts` verdi |
| 5 | Ultima pagina: testo facoltativo per partecipante nella bozza (passo `stories`, max 1000 grafemi, `BACKGROUND_ADDITION_TOO_LONG`); «Concludi» lo appende a `infos.background` nella transazione; il foglio porta `backgroundEntryAdded` | ✓ VERIFIED | `background-additions.ts` (trim, vuoto = nessuna voce, doppione rifiutato, `exceedsGraphemeLimit` condiviso con la creazione rimasta a 500); `MissionBackgroundAdditionInput` (`@MaxLength` 8000); `mission-draft-save.service.ts backgroundAdditionsOf` (solo partecipanti, sezione presente = sostituisce); `guided-completion.service.ts appendBackgroundAdditions` (`$push` con `session` dentro `afterSeats`, rivalidato con `additionFor`); flag dalla stessa lettura; `gm-completion` semplice non lo valorizza. Int: `guided-completion…:1167,1185,1216,1239,1267`, `gm-completion…:386` (D-10), `quest-result.resolver…:625`, `character-updated.subscription…:1029` |
| 6 | SDL solo additivo (diciotto righe) al boot reale di test; handoff `BACKEND-NOTES.md` | ✓ VERIFIED | `git diff e87339bb..HEAD -- src/schema.gql`: 18 righe aggiunte, 0 tolte; `test/app.int-spec.ts` rieseguito, `src/schema.gql` senza diff dopo la rigenerazione. `BACKEND-NOTES.md` (781 righe, sezioni 0–7: TL;DR, SDL verbatim, semantica, codici, esempi, finestra FE, comportamenti provati, compiti dell'orchestratore) |

**Score:** 6/6 truths verified

### Decisioni congiunte (FE 24-CONTEXT, parte BE)

| Decisione | Stato | Dove |
|-----------|-------|------|
| D-01, D-02 lettura prima dell'avvio, senza bozza | ✓ | `character(id)` esistente, caso d'integrazione dedicato |
| D-05, D-06 aggiunte nella bozza, per partecipante, vuoto = niente | ✓ | `background-additions.ts`, `mission-draft-save.service.ts` |
| D-07 1000 grafemi, stessa regola di conteggio, creazione a 500 | ✓ | `grapheme-count.ts exceedsGraphemeLimit`, validato a salvataggio e completamento |
| D-08 voce nuova in coda, voci esistenti intatte | ✓ | `$push 'infos.background'` in transazione |
| D-09 flag sul foglio, nessuna push dedicata | ✓ | `QuestResult.backgroundEntryAdded` |
| D-10 solo flusso guidato | ✓ | `gm-completion…:386` |
| D-11, D-14 nessuna cura tocca la ferita dell'oste; senza effetto | ✓ | `cure-injuries.ts`, `heal-no-effect.ts`, `item-use.plan.ts` |
| D-12 solo le ferite aggiunte a mano | ✓ | `asInnkeeperHand`, `handInflictedOf`; vie automatiche (`unrewarded-plan`, `guard-outcome`, `ambush-plan`) aggiungono soltanto e non toccano l'origine |
| D-13 rimozione di ogni ferita nei due completamenti | ✓ | `injuriesRemoved` in entrambi i flussi |
| D-15 origine servita al giocatore, `characterUpdated` anche se cambia solo l'origine | ✓ | `character-updated.subscription…:797,989` |
| D-16 origine additiva, togli-e-riaggiungi, nessuna migrazione | ✓ | seconda lista, `innkeeperInjuriesOf` tollerante |
| D-17 | ritirata | — |
| D-18 `QuestResult.injuriesRemoved` a parte da `injuriesHealed` | ✓ | `outcome-plan.ts:665-666` |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/quests/outcomes/injuries/innkeeper-injuries.ts` | lettura dell'origine, correzione pura, piega | ✓ VERIFIED | 129 righe, usata da piano d'esito, bozza, completamenti, pozione, senza effetto |
| `src/quests/outcomes/injuries/cure-injuries.ts` | regola delle cure in un solo posto | ✓ VERIFIED | terzo parametro `untouchable`, tre chiamanti cablati |
| `src/quests/guided/background-additions.ts` | regole pure delle aggiunte | ✓ VERIFIED | usata da save service e completion service |
| `src/quests/guided/guided-completion.service.ts` | scrittura storie e piega | ✓ VERIFIED | `afterSeats` in sessione |
| `src/quests/outcomes/gm-overrides.ts`, `gm-completion.service.ts` | rimozioni e origine nel semplice | ✓ VERIFIED | |
| `src/quests/guided/mission-draft.{model,wire,mapper,inputs}.ts` | bozza e filo | ✓ VERIFIED | campi nuovi con default per le bozze di prima |
| `src/models/…/character-status.model.ts`, `quest-result.model.ts` | campi persistiti e serviti | ✓ VERIFIED | default neutri, nessun migratore |
| `src/schema.gql` | SDL additivo | ✓ VERIFIED | +18 / −0 |
| `BACKEND-NOTES.md` | handoff FE Phase 24 | ✓ VERIFIED | sezioni 0–7 |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `acceptQuest` / `Quest.noEffect` | `healHasNoEffect` | proiezione `status.innkeeperInjuries` in `quest-acceptance.service.ts` e `viewer-vitals.service.ts` | WIRED |
| pozione (`useItem`) | `cureInjuries` | `innkeeperInjuriesOf(snapshot.status)` + guardia di scrittura sull'origine | WIRED |
| `completePendingRequest` | `planParticipant` | `validateOverrides` → `asInnkeeperHand` → `applyWoundCorrection` | WIRED |
| completamento guidato | `planParticipant` | `guidedBattleOf(…, snapshot.status)` → `netWoundCorrectionOf` | WIRED |
| `saveMissionDraft` | bozza | `backgroundAdditionsOf` → `additionEntriesOf` → `drafts.write` | WIRED |
| «Concludi» | `infos.background` | `appendBackgroundAdditions` in `afterSeats(session)` | WIRED |
| `planParticipant` | `QuestResult` | `injuriesRemoved`, `backgroundEntryAdded` nel foglio e in `unpopulatedResultOf` | WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Tipi | `npx tsc --noEmit -p tsconfig.json` | exit 0 | ✓ PASS |
| Regole pure della fase | `npx jest src/quests/outcomes/injuries src/quests/guided …outcome-plan.spec.ts …gm-overrides.spec.ts …item-use.plan.spec.ts src/characters/creation src/quests/no-effect … --selectProjects unit` | 31 suite, 889 test verdi | ✓ PASS |
| Completamenti e bozza | `npx jest guided-completion gm-completion mission-draft-save guided-mission.resolver complete-pending-request.resolver --selectProjects integration --runInBand --forceExit` | 5 suite, 176 test verdi | ✓ PASS |
| Cure, senza effetto, filo, boot di test | `npx jest use-item quest-acceptance quests.resolver characters-ownership character-updated.subscription quest-result.resolver quest-resolution test/app.int-spec.ts --selectProjects integration --runInBand --forceExit` | 8 suite, 508 test verdi; `src/schema.gql` invariato | ✓ PASS |
| SDL additivo | `git diff e87339bb..HEAD -- src/schema.gql` | 18 aggiunte, 0 rimozioni | ✓ PASS |

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| BE-WOUND-01 | ✓ SATISFIED | campo a DB e sul filo, `innkeeperInjuriesOf` unica lettura tollerante, nessun input lo scrive (solo `ParticipantOverrideInput.injuriesRemoved` è nuovo), subscription provata |
| BE-WOUND-02 | ✓ SATISFIED | `cureInjuries` + tre chiamanti; casi su heal, blocco del titolo, premio guidato, pozione, stesso esito |
| BE-WOUND-03 | ✓ SATISFIED | `healHasNoEffect` unico predicato; `QUEST_NO_EFFECT`, `Quest.noEffect`, `ITEM_NO_EFFECT` provati |
| BE-WOUND-04 | ✓ SATISFIED | `injuriesRemoved` in input e sul foglio; `completePendingRequest` estesa |
| BE-WOUND-05 | ✓ SATISFIED | `asInnkeeperHand`, `handInflictedOf`, togli-e-riaggiungi nei due flussi |
| BE-WOUND-06 | ✓ SATISFIED | piega in ordine, tre campi della bozza, tre trappole chiuse da casi dedicati (`guided-completion…:1081,1097`, `fight-state.spec.ts`) |
| BE-STORY-01 | ✓ SATISFIED | caso d'integrazione su `character(id)` |
| BE-STORY-02 | ✓ SATISFIED | sezione `backgroundAdditions`, passo `stories` |
| BE-STORY-03 | ✓ SATISFIED | predicato condiviso, tetto di forma 8000, codice proprio |
| BE-STORY-04 | ✓ SATISFIED | `$push` in transazione, rollback provato |
| BE-STORY-05 | ✓ SATISFIED | flag vero solo dal guidato, falso sui fogli di prima |
| BE-STORY-06 | ✓ SATISFIED | SDL +18/−0, handler invariati, handoff completo |

Nessun requisito orfano: i dodici ID della fase sono tutti dichiarati e coperti.

### Anti-Patterns Found

Nessun TODO/FIXME/placeholder né implementazione vuota nei file applicativi toccati. Nessun bloccante.

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/quests/guided/fight-state.ts`, `guided-outcome.ts` | due helper omonimi `removalsOf` con firma diversa | ℹ️ Info | micro-duplicazione, nessun effetto sul comportamento |

### Human Verification Required

Nessuna sul lato BE. Build, riavvio dal ramo, `test:cov` e UAT su device restano compiti dell'orchestratore e della FE Phase 24 (`BACKEND-NOTES.md` §7).

### Gaps Summary

Nessun gap. Ogni requisito e ogni decisione che tocca il BE è presente nel codice, cablata e provata da casi unit e d'integrazione rieseguiti in questa verifica.

---

_Verified: 2026-11-21T18:45:00Z_
_Verifier: Claude (gsd-verifier)_
