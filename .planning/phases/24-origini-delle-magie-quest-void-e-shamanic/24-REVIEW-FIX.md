---
phase: 24-origini-delle-magie-quest-void-e-shamanic
fixed_at: 2026-11-15T21:30:00Z
review_path: .planning/phases/24-origini-delle-magie-quest-void-e-shamanic/24-REVIEW.md
iteration: 1
findings_in_scope: 12
fixed: 7
skipped: 5
status: partial
---

# Phase 24: Code Review Fix Report

**Fixed at:** 2026-11-15
**Source review:** `.planning/phases/24-origini-delle-magie-quest-void-e-shamanic/24-REVIEW.md`
**Iteration:** 1 (ruling dell'orchestratore)

**Summary:**
- Finding in scope: 12 (4 warning, 8 info)
- Applicati: WR-02 (solo nota), WR-03, WR-04, IN-02 (nota), IN-04, IN-07, IN-08 (nota); più la citazione sbagliata del §6
- Non applicati: WR-01 (attende l'utente), IN-01, IN-03, IN-05, IN-06

Spec toccate, alla fine: unit 224/224 verdi (7 suite: `level-table`, `quest-rewards`, `spell-catalogue.reporter`, `resolution-loader.service`, `mission-prizes`, `spell-schools`, `generation-rules`); integration 55/55 verdi (`spell-fields.int-spec.ts` 9, `quest-generator.int-spec.ts` 46). `npx tsc --noEmit -p tsconfig.json` esce 0.

## Fixed Issues

### WR-03: `minLevelToLearn` senza tetto

**Commit:** `d42b6d53` (RED), `04e68d35` (GREEN)
**Files modified:** `src/quests/outcomes/progression/level-table.ts`, `src/quests/outcomes/rewards/quest-rewards.ts`, `src/models/spell.model.ts` + le sei spec
**Applied fix:** `MAX_LEVEL` esportato da `level-table.ts` e derivato dall'ultima riga di `LEVEL_TABLE` (nessun letterale 20). Usato da `isLearnLevel` (intero fra 1 e `MAX_LEVEL`), dallo schema Mongoose (`max: MAX_LEVEL`) e quindi da `isServableSpell` del reporter d'avvio (una magia sopra il tetto conta come non servibile), dal lettore delle quest e dalle opzioni dell'oste.
RED: `MAX_LEVEL` = livello massimo della tabella; `isLearnLevel` rifiuta `MAX_LEVEL + 1` e `4000`; reporter li conta come non servibili; il lettore li lascia fuori dal catalogo e dal pool; lo schema rifiuta `MAX_LEVEL + 1` e accetta `MAX_LEVEL`.
Verde al primo colpo: il caso dell'oste (`mission-prizes.spec.ts`, `MAX_LEVEL + 1` mai offerto) perché l'oste confronta già con il livello del personaggio, che non supera mai il tetto; tenuto come rete.

### WR-04: test «identico tiro per tiro» vacuo

**Commit:** `14dd4bdf`
**Files modified:** `src/quests/generation/quest-generator.int-spec.ts`
**Applied fix:** il caso che confrontava due corse del codice nuovo (entrambe senza pavimento) è sostituito da «generates a world without Necrorian draw by draw as before the floor (D-12)»: mondo di 6 città × 5 POI, seme 7, 24 quest con boss misti, confrontato (numero di tiri 284 e ogni quest: titolo, tipo, POI, rango, posti) con `RUN_BEFORE_RANK_FLOOR`, registrato eseguendo lo stesso mondo sul commit base della fase `a208ad3d` (worktree staccato temporaneo nello scratchpad, poi rimosso; nessun branch creato).
Non vacuità provata con mutazioni temporanee (annullate con `git checkout`): un filtro dei ranghi che esclude `rookie` nei mondi senza pavimento → fallisce (tiri 324 invece di 284); un tiro in più nel ramo del boss senza pavimento → fallisce.
Nota: la mutazione «togliere `floor !== null` dalla guardia del misto» NON fa fallire il test, ed è un mutante equivalente: i boss si generano solo da `adventurer` in su (`BOSS_PARTY_AVERAGE_PE` non ha voce per `rookie`, quindi `bossSeatsFor` non compone boss rookie), quindi `lowerRankOf` non è mai `null` per un boss e `allowsMixedLower(null, rank)` è sempre vero. La premessa di IN-07 («serve quando non c'è titolo inferiore») non è esatta.

### WR-02: recupero della lore d'origine (solo nota)

**Commit:** `13b994c9`
**Files modified:** `BACKEND-NOTES.md` §5
**Applied fix:** riga «Recupero per chi conosce già magie (WR-02): `$addToSet` della lore d'origine su `status.unlockedLore` dei personaggi che hanno già una magia di quell'origine negli `spellStates`». Nessun codice.

### Citazione sbagliata del §6 (BE-ORIGIN-01)

**Commit:** `13b994c9`
**Files modified:** `BACKEND-NOTES.md` §6
**Applied fix:** la fascia `city` delle due capitali nuove è provata solo dalle spec unitarie `shop-pool.rules.spec.ts` e `shop-pool.report.spec.ts`; tolta `shop-pool-report.service.int-spec.ts` (verificato: non nomina le capitali nuove). Nello stesso commit: tetto `MAX_LEVEL` nei §2 (a), (b) e §6 BE-ORIGIN-04; §2 (e) e §6 BE-ORIGIN-09 citano la corsa registrata su `a208ad3d`.

### IN-04: commento non vero in `spell-schools.ts`

**Commit:** `55791a45`
**Files modified:** `src/quests/spell-schools.ts`
**Applied fix:** il commento ora dice che la tabella la leggono il pool di lore dello studio e il sorteggio, mentre la ripetibilità elenca i tre tipi a mano in `REPEATABLE_TYPES`. Nessun cambio di comportamento (`spell-schools.spec.ts` 23/23).

### IN-07: guardia del misto senza spiegazione

**Commit:** `bcedad48`
**Files modified:** `src/quests/generation/quest-generator.service.ts`
**Applied fix:** una riga di commento: senza pavimento il cancello del misto si tira sempre, come prima della Phase 24, e i semi fissi ne dipendono. Formulazione scelta per restare vera (vedi la nota di WR-04 sulla premessa della review). Spec del generatore verdi.

### IN-02 e IN-08: note del runbook e dei compiti di contenuto

**Commit:** `d392f085`
**Files modified:** `BACKEND-NOTES.md` §4 (passo 3) e §5
**Applied fix:** IN-02: cosa contano «già a posto» e «senza corrispondenza», e cosa cercare a DB se compare il WARN `Magie: …`. IN-08: dopo la scrittura delle quest, verificare a DB che ogni quest aperta su un POI di Necrorian abbia `requirements.minTitle` in `mage` / `hero`. Nessun codice.

## Skipped Issues

### WR-01: lore d'origine anche dal tiro di lore dello studio

**File:** `src/quests/outcomes/resolution-loader.service.ts:730-744`
**Reason:** ruling dell'orchestratore: NON toccare, attende la decisione dell'utente (già fra le domande aperte del handoff §7).

### IN-01: oste sul livello prima dell'esito, quest sul livello dopo

**File:** `src/quests/guided/mission-prize-options.service.ts:164-165`, `src/quests/guided/mission-prizes.ts:152-155`
**Reason:** la simmetria cambierebbe il comportamento (non neutrale) e toccherebbe più file; la review stessa propone di lasciarlo con la nota già presente nel handoff §2 (b).

### IN-03: `isLearnLevel` nei premi delle quest

**File:** `src/quests/outcomes/rewards/quest-rewards.ts:124-126`
**Reason:** spostarla in `src/spells/learn-level.ts` tocca il file nuovo, `quest-rewards.ts`, `mission-prizes.ts`, `resolution-loader.service.ts`, il reporter e le spec: non è un cambio di un solo file.

### IN-05: costruzione di `SpellCandidate` duplicata

**File:** `src/quests/outcomes/rewards/quest-rewards.ts:214-228`, `src/quests/guided/chosen-rewards.ts:34-47`
**Reason:** il fix tocca due file (`quest-rewards.ts` e `chosen-rewards.ts`): fuori dal criterio «un file».

### IN-06: `ShopPoolViolation.size` porta la fascia

**File:** `src/shops/shop-pool.report.ts`
**Reason:** ruling dell'orchestratore: non rinominare il campo `size`.

---

_Fixed: 2026-11-15_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
