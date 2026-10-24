---
phase: 09-combat-result-admin-outcomes
plan: 16
subsystem: quality-gate
tags: [gate, handoff, traceability, validation, docs]

# Dependency graph
requires:
  - phase: 09-combat-result-admin-outcomes (09-01..09-15)
    provides: QuestResult e consegna ibrida, ciclo di vita degli esiti, soccorso e morte, coda e completamento del GM, guard AWAITING_AID / SHOP_NOT_IN_CITY
provides:
  - gate di fase verde (unit, integration, build, lint, prettier, schema, invarianti)
  - BACKEND-NOTES.md di fase per FE Phase 9, FE Phase 10, FE Phase 7 e BE Phase 10
  - emendamento del handoff Phase 5 (questEnd con l'id del risultato, nessun combatResult)
  - traceability BE-COMBAT-01..03 e BE-ADMIN-01..02 Complete; Key Decision "Combat result ibrido" realizzata
  - 09-VALIDATION.md approved con wave_0_complete true
affects: [FE Phase 7, FE Phase 9, FE Phase 10, BE Phase 10]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/09-combat-result-admin-outcomes/BACKEND-NOTES.md
    - .planning/phases/09-combat-result-admin-outcomes/09-16-SUMMARY.md
  modified:
    - .planning/phases/09-combat-result-admin-outcomes/09-VALIDATION.md
    - .planning/phases/09-combat-result-admin-outcomes/deferred-items.md
    - .planning/phases/05-infrastruttura-push-fcm/BACKEND-NOTES.md
    - .planning/REQUIREMENTS.md
    - .planning/PROJECT.md
    - .planning/ROADMAP.md
    - .planning/STATE.md

key-decisions:
  - "Gate verde senza correzioni di codice: nessun commit nel Task 1"
  - "archiveWithin( compare una sola volta in src/quests: la morte ha un unico punto (dieWithin, 09-13) per aid fallita e timeout; l'invariante C1 è rispettato (nessun archiveCurrentCharacter in src/quests)"
  - "Handoff Phase 5 emendato anche in §8 (builder questEnd(resultId), nessun PushEventType.combatResult) per coerenza con D-20"
  - "09-VALIDATION status approved come prescritto dall'orchestratore (il piano diceva di lasciarlo)"

patterns-established: []

requirements-completed: [BE-COMBAT-01, BE-COMBAT-02, BE-COMBAT-03, BE-ADMIN-01, BE-ADMIN-02]

# Metrics
duration: 25min
completed: 2026-10-24
---

# Phase 9 Plan 16: Gate di fase e handoff Summary

**Gate di fase verde (unit 121/1765, integration 72/913, build, lint, schema solo additivo, invarianti) e `BACKEND-NOTES.md` con SDL verbatim, codici, semantica degli esiti, regole segnaposto e comandi `mongosh` per la UAT. In più: traceability dei cinque requisiti BE, emendamento della Phase 5 su `questEnd` e VALIDATION approvata.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-24T17:26:20Z
- **Completed:** 2026-10-24T17:51:00Z
- **Tasks:** 2 (2/2)
- **Files modified:** 7 file di pianificazione + SUMMARY (nessun file di codice)

## Accomplishments

- **Gate completo verde senza correzioni.** Nessun commit nel Task 1.
- **Handoff `BACKEND-NOTES.md`** (17 sezioni, §0..§16):
  - TL;DR;
  - SDL verbatim dei tipi nuovi, con le righe nuove di Query, Mutation e Subscription;
  - tabella dei codici con i messaggi esatti e l'ordine dei rifiuti di `acceptQuest`, `startTravel`/`travelPreview`, `doTransaction` e `completePendingRequest`;
  - semantica di ogni `outcome`, flusso morte → creazione personaggio, push `questEnd` con l'id del risultato;
  - ciclo di vita, soccorso e morte (C5 marcato da confermare), tabella dei 20 livelli, loot a cascata;
  - coda e completamento del GM con variabili d'esempio e audit;
  - negozio e viaggio per la FE Phase 7;
  - regole segnaposto (file, simbolo, valore attuale, come sostituirlo);
  - dati UAT con `mongosh` (solo placeholder), checklist UAT, note per la BE Phase 10, deploy, deviazioni e punti aperti.
- **Phase 5 `BACKEND-NOTES.md`:** emendati §2 (blockquote "Emendato dalla Phase 9"), §5 punto 8, l'esempio di `sendTestPush` (`<questResultId>`), §8 (builder e nessun `combatResult`) e l'intestazione dei consumatori.
- **PROJECT.md:** la Key Decision "Combat result ibrido" passa da `— Pending` a `✓ Realizzata in Phase 9 (2026-10-24)`.
- **REQUIREMENTS.md:** 5 checkbox `[x]` e 5 righe `| … | Phase 9 | Complete |`.
- **09-VALIDATION.md:**
  - `status: approved`, `wave_0_complete: true`;
  - righe 09-16 a `✅ green`;
  - checkbox W0 di 09-01 spuntata;
  - riga di sign-off dell'esecuzione e Approval compilati.

## Task Commits

| # | Task | Commit | Tipo |
|---|------|--------|------|
| 1 | gate di regressione, lint, schema e invarianti | — (tutto verde, nessuna modifica) | — |
| 2 | BACKEND-NOTES, emendamenti, traceability e VALIDATION | `d4e2cb6` | docs |

**Plan metadata:** commit `docs(phase-9): complete plan 09-16 ...` (SUMMARY, deferred-items, STATE, ROADMAP)

## Gate (Task 1), risultati

| Comando | Esito |
|---------|-------|
| `npm run test:unit` | **121 suite / 1765 test** verdi (~4,7 s); baseline 96 / 1424 |
| `npm run test:int` (foreground, `--runInBand`) | **72 suite / 913 test** verdi al primo run (160 s); baseline 57 suite |
| `npm run build` | exit 0 |
| `git diff --exit-code src/schema.gql` | pulito (dopo la suite completa e dopo i due run del boot reale) |
| lint filtrato (`npx eslint "{src,apps,libs,test}/**/*.ts" --quiet` senza prettier/prefer-const) | 0 righe |
| `npx eslint` sui 174 `.ts` toccati | exit 0 |
| `npx prettier --check` sui 174 `.ts` toccati | exit 0 |
| boot reale isolato ×2 (`test/app.int-spec.ts`) | 43/43 e 43/43; flaky 09-14 **non riprodotto** |

**Invarianti:**

- SDL vs `origin/develop`: righe rimosse **0**.
- Divieti nello schema:
  - `kind|grade|concludedAt|rescue|TravelKind|CombatResolver` **0**;
  - `approvePendingRequest|rejectPendingRequest|combatResult` **0**.
- Contratto (`grep -F`): `type AwaitingAid {`, `type QuestResult {`, `enum QuestOutcome {`, `questResult(id: String!): QuestResult!`, `questResultReceived(characterId: String!): QuestResult!`, `pendingRequests: [PendingRequest!]!`, `pendingRequestsUpdated: [PendingRequest!]!`, `completePendingRequest(input: CompletePendingRequestInput!): [QuestResult!]!` → 1 ciascuno.
  - `awaitingAid: AwaitingAid` → 2 (`CharacterStatus` e `PendingRequestCharacter`, entrambi previsti da 09-07).
  - `^  spell: Spell$` → 3 (2 preesistenti su `develop` + `QuestPrizes.spell`).
  - Nota: i primi grep con `-E` non matchavano per le parentesi e le graffe non escapate; ripetuti con `-F`.
- `@Public()`: 7 sul branch = 7 su `origin/develop`.
- `@Roles(RoleType.innkeeper)` in `src/quests/pending-requests`: 3.
- `$$NOW` in `src/quests|travel|economy`: solo nell'asserzione negativa di `quest-resolution.updates.spec.ts` (dichiarata in 09-10); nessun file non-spec.
- `characterModel.findById` nelle tre directory: vuoto.
- Scrittori di `'status.level'`/`'status.maxLifePoints'` fuori da `outcome-plan.ts` e dalle spec: vuoto.
- `PROVVISORIO|SEGNAPOSTO`:
  - `placeholder-combat-resolver.ts`, `injury-rules.ts`;
  - più `placeholder-combat-resolver.spec.ts`, che porta "PROVVISORIO" solo nel titolo del `describe`;
  - nessuna formula fuori dai due file di produzione.
- `archiveCurrentCharacter` in `src/quests`: vuoto. `archiveWithin(` in `src/quests`: **1** (il piano si aspettava ≥ 2; vedi Deviazioni).
- `PushModule` negli `imports` di acceptance, travel-planning e scheduling: 0, 0, 0.
- `$inc` in `src/quests/outcomes` e nel servizio del negozio: vuoto.
  - Fuori dal wallet restano solo gli `$inc` degli usi delle magie (`active-spell.updates.ts`), preesistenti e non sui saldi.
- `Math.random`:
  - in produzione solo `chance-source.ts`;
  - `characters/creation/random-source.ts` è preesistente su `develop` e serve alla scelta della città iniziale, non agli esiti.
- `pubSub.publish` atteso (`await …publish(`): nessuno.
- `package.json`/`package-lock.json` vs `origin/develop`: nessuna differenza.
- `jest.mock(` nei file toccati: nessuno.
- `.env.example` `QUEST_SWEEP_INTERVAL_MS=`: 1.
- Trailer `Co-Authored-By`/`Generated with` in `origin/develop..HEAD`: 0.

**File toccati dalla fase:** 174 `.ts` più schema, `.env.example` e documenti di pianificazione (`git diff --name-only origin/develop...HEAD`).

## Decisions Made

- Il Task 1 non ha prodotto commit perché ogni gate era verde al primo colpo.
- Il frammento del foglio esiti nel handoff seleziona `id name rarity` sugli item, verificati sullo schema (né `LootItem` né `EquipmentItem` hanno `imagePath`). Sull'`enemy` seleziona solo scalari: `locations` è rotto (deferred) e `relatedLore`/`spells` non sono popolati sul risultato.
- Il comando `mongosh` per gli HP dei personaggi esistenti ricalcola livello e massimo dalla tabella partendo dall'XP. Non è un secondo scrittore nel codice: è un aggiornamento manuale dei dati (D-29).

## Deviations from Plan

### Scostamenti minori

**1. Invariante `archiveWithin(` ≥ 2 → 1**
- **Found during:** Task 1.
- **Issue:** il piano si aspettava almeno due chiamate in `src/quests`, una per l'aid fallita e una per il timeout. In 09-13 la morte è stata unificata in `dieWithin`, che chiama `archiveWithin` una sola volta e serve entrambi i percorsi (registrato nel SUMMARY 09-13).
- **Fix:** nessuno. L'intento dell'invariante (C1: morte nella transazione dell'esito, nessun `archiveCurrentCharacter`) è rispettato e coperto dai test di soccorso e timeout.

**2. `09-VALIDATION.md` `status: approved`**
- Il piano diceva di lasciare `status`; l'orchestratore prescrive `approved` se tutto è verde. Applicato `approved`.

**3. Emendamento Phase 5 più ampio del minimo**
- Oltre a §2, al punto 8 di §5 e a `sendTestPush`, ho corretto anche §8 (builder `questEnd(resultId)`, nessun `PushEventType.combatResult`) e la riga dei consumatori. Lasciarle avrebbe contraddetto D-20 ("nessun tipo push nuovo").

**4. Riga W0 di 09-01 in VALIDATION**
- Era rimasta `[ ]` benché i file esistano e 09-01 sia verde: spuntata (Boy Scout).

Nessuna regola 1–4 attivata e nessuna correzione di codice.

## Issues Encountered

- **Flaky 09-14 non riprodotto:**
  - suite completa: `test/app.int-spec.ts` verde;
  - due run isolati: 43/43 ciascuno.
  - Annotato in `deferred-items.md` (sezione 09-16) e nel handoff §14.

## Known Stubs

- `src/quests/outcomes/combat/placeholder-combat-resolver.ts` e `src/quests/outcomes/injuries/injury-rules.ts` sono intenzionalmente PROVVISORI/SEGNAPOSTO (D-02). Restano provvisori anche i drop rate (`DROP_RATES`), C5 e A3. Il handoff §11 li documenta con file, simbolo e procedura di sostituzione. Non impediscono l'obiettivo della fase, che chiede proprio una porta con regole segnaposto.

## Threat Flags

Nessuna superficie nuova (solo documenti).
- **T-09-78..T-09-80:** mitigati dal gate (schema additivo, `@Public` invariato, 3 `@Roles`, formula confinata).
- **T-09-81:** il grep di accettazione su segreti e id reali nel handoff è vuoto (solo placeholder `<…>`, nessun twitchId né ObjectId reale).
- **T-09-82:** trasferito all'utente con i comandi di §12.

## User Setup Required

Dopo il deploy servono i dati a DB di `BACKEND-NOTES.md` §12 (HP alla scala nuova, nemici riscalati, 2 ref orfani, study a Valantar con `prizes.spell`). Prima della PR serve la conferma di C5/A3 da parte dell'utente (orchestratore).

## Next Phase Readiness

- Restano all'orchestratore: code review, verifier, chiusura della fase (ROADMAP Complete, STATE "phase complete"), conferma di C5 con l'utente e PR verso `develop`.
- Le FE Phase 7/9/10 hanno il contratto e gli emendamenti da riportare nel loro discuss: ADMIN-03 senza reject, ADMIN-05 senza grade.

## Self-Check: PASSED

- FOUND: `.planning/phases/09-combat-result-admin-outcomes/BACKEND-NOTES.md`, `.planning/phases/09-combat-result-admin-outcomes/09-16-SUMMARY.md`
- FOUND: commit `d4e2cb6` (nessun trailer, subject 64 caratteri)
- Repo FE invariato (`git status --short` vuoto)
