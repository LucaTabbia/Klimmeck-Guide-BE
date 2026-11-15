---
phase: 24-origini-delle-magie-quest-void-e-shamanic
reviewed: 2026-11-15T20:00:10Z
depth: deep
diff_base: a208ad3d
files_reviewed: 35
files_reviewed_list:
  - src/app.module.ts
  - src/characters/creation/race-traits.ts
  - src/cities/city-size.ts
  - src/lore/lore-visibility.module.ts
  - src/lore/related-lore.resolvers.ts
  - src/migrations/spell-origins/quest-type.step.ts
  - src/migrations/spell-origins/spell-fields.step.ts
  - src/migrations/spell-origins/spell-origins.boot.ts
  - src/migrations/spell-origins/spell-origins.module.ts
  - src/migrations/spell-origins/spell-origins.step.ts
  - src/models/enums/city-type.enum.ts
  - src/models/enums/quest-type.enum.ts
  - src/models/enums/spell-origin.enum.ts
  - src/models/spell.model.ts
  - src/quests/acceptance/quest-eligibility.ts
  - src/quests/generation/generation-rules.ts
  - src/quests/generation/quest-generator.service.ts
  - src/quests/guided/chosen-rewards.ts
  - src/quests/guided/mission-prize-options.service.ts
  - src/quests/guided/mission-prizes.ts
  - src/quests/outcomes/outcome-plan.ts
  - src/quests/outcomes/quest-resolution.sweeper.ts
  - src/quests/outcomes/resolution-loader.service.ts
  - src/quests/outcomes/rewards/quest-rewards.ts
  - src/quests/party/quest-start.service.ts
  - src/quests/spell-schools.ts
  - src/schema.gql
  - src/shops/shop-pool.constants.ts
  - src/shops/shop-pool.report.ts
  - src/shops/shop-pool.rules.ts
  - src/spells/spell-catalogue.reporter.ts
  - src/spells/spells.module.ts
  - src/quests/generation/quest-generator.int-spec.ts
  - src/quests/generation/generation-rules.spec.ts
  - test/app.int-spec.ts
findings:
  critical: 0
  warning: 4
  info: 8
  total: 12
status: issues_found
---

# Phase 24: Code Review Report

**Reviewed:** 2026-11-15T20:00:10Z
**Depth:** deep (diff `a208ad3d..HEAD`, `src/` e `test/`)
**Files Reviewed:** 35 (tutto il codice di produzione del diff; delle spec lette per intero solo quelle del generatore e del boot, le altre a campione)
**Status:** issues_found

## Summary

Riviste le sette aree richieste seguendo le catene di chiamata oltre il diff (`planParticipant`, `ResolutionLoader`, percorso guidato dell'oste, generatore, `VisibleLoreLoader`, migratore). Nessun difetto critico e nessun problema di sicurezza: il migratore non stampa mai la causa del driver (`describeError` dà solo nome e codice), ferma il boot con un errore nuovo, è idempotente e ha la guardia di corsa; i lettori delle magie sono fail-closed; il filtro per viewer di `Spell.relatedLore` passa dallo stesso `VisibleLoreLoader` di pet e oggetti.

Verificato e trovato corretto:

- **Cancello di livello:** `levelAfter < minLevelToLearn` rifiuta, uguale impara (nessun off-by-one); premio fisso, blocco per titolo e sorteggio usano tutti `progression.level` (dopo l'esito). L'oste usa il livello PRIMA dell'esito in opzioni, salvataggio e completamento; dato che dopo ≥ prima, la rivalidazione non contraddice mai `planParticipant` (vedi IN-01 per l'asimmetria).
- **Tiri:** `spellDrawOf` consuma gli stessi due tiri; il filtro per origine agisce solo sulla query del pool. Ripetibilità, corsia, avvio e pool dello studio derivano da `laneOf` / `isRegistered` / `isSpellSchool`: parità con il vecchio `magic`.
- **Sblocco lore:** un solo `$addToSet` nello stesso update del piano (in sessione), `loreUnlocked` = sole novità rispetto allo snapshot, deduplicate; magia non imparata = nessuna lore; tiro di lore dello studio e lore della magia sono mutuamente esclusivi (`!spellLearned`).
- **Necrorian:** `minTitle` nasce solo da `composition.rank` e dal `lower` del boss misto, entrambi coperti; la aid automatica copia il `minTitle` della quest fallita; un tipo di città sconosciuto esclude la città dal mondo.
- **Copie persistite del tipo:** solo `quests.infos.type` e `questresults.quest.type` (`MissionDraft.questType` porta solo `story` / `worldMission`).
- **Conversione xp → livello:** 4 000 → 6, 12 000 → 10, 20 000 → 12, 30 000 → 15, 50 000 → 20, come D-07.
- Unit delle 22 spec toccate: 704 test verdi (`npx jest … --selectProjects unit`). Le int-spec non sono state eseguite.

Restano quattro avvisi (due di regola di gioco da far decidere all'utente, uno di validazione, uno su un test che non prova ciò che dichiara) e otto note.

## Warnings

### WR-01: La lore d'origine si sblocca anche dal tiro di lore dello studio, senza imparare alcuna magia di quell'origine

**File:** `src/quests/outcomes/resolution-loader.service.ts:730-744` (con `src/lore/study-lore-types.ts:5-13`)
**Issue:** D-24 dice «quando impari la prima magia void sblocchi la lore sul Vuoto». Le tre lore d'origine sono di tipo `knowledge` (W-8), tipo che sta in `STUDY_LORE_TYPES`: `readStudyLorePool` le mette quindi nel pool di OGNI quest `study`, `arcane`, `shamanic` e `void`. Una quest `arcane` che non insegna la magia (70 % dei casi, o personaggio sotto livello) tira la lore al 30 % e può sbloccare la lore del Vuoto. Da quel momento la prima magia void non sblocca più nulla e `QuestResult.loreUnlocked` resta vuoto proprio nel caso che la UAT (passo 4) vuole vedere. È già annotato come domanda aperta nel handoff, ma è un comportamento contrario alla lettera di D-24 e va deciso prima della UAT.
**Fix:** escludere dal pool le lore che sono `relatedLore` di una magia (nessun tiro aggiunto o spostato: cambia solo il contenuto del pool):
```ts
const spellLore = new Set(
    (await this.spellModel.distinct('relatedLore').exec()).map(String),
);
return lore
    .map(({ _id }) => _id)
    .filter((id) => !spellLore.has(id.toHexString()))
    .sort(/* come oggi */);
```
In alternativa, senza codice: dare alle tre lore un tipo fuori da `STUDY_LORE_TYPES` (la int-spec 24-08 usa già `region` per questo motivo). Serve il ruling dell'utente.

### WR-02: Nessun recupero per i personaggi che conoscono già magie: la lore d'origine arriva solo alla prossima magia imparata

**File:** `src/quests/outcomes/outcome-plan.ts:535-539`
**Issue:** lo sblocco avviene solo dentro `planParticipant`, quando una magia viene imparata DOPO il rilascio. Un mago che oggi conosce già magie arcane (82 su 96 lo sono) non ha la lore «Arcana» finché non ne impara un'altra; chi le conosce già tutte quelle alla sua portata non la avrà mai. `Spell.relatedLore` sul filo gli torna vuota per le sue stesse magie. Né il migratore né l'elenco dei compiti di contenuto (BACKEND-NOTES §5) prevedono il recupero.
**Fix:** nessun cambio al codice del piano. Aggiungere ai compiti di contenuto dell'orchestratore (dopo la scrittura di `relatedLore` sulle magie) uno script una tantum fuori dal repo: per ogni personaggio, `$addToSet: { 'status.unlockedLore': { $each: <lore delle magie in status.spellStates> } }`. Se l'utente non vuole il recupero, scriverlo come decisione nel handoff.

### WR-03: `minLevelToLearn` senza tetto: un livello sopra 20 passa schema, lettori e reporter e rende la magia inimparabile in silenzio

**File:** `src/models/spell.model.ts:42`, `src/quests/outcomes/rewards/quest-rewards.ts:125-126`, `src/spells/spell-catalogue.reporter.ts:17-22`
**Issue:** il contratto dichiarato è «intero 1..20» (BACKEND-NOTES §2 b, §5) e la tabella dei livelli finisce a 20, ma lo schema ha solo `min: 1`, `isLearnLevel` accetta ogni intero ≥ 1 e `isServableSpell` conta la magia come valida. Un refuso dello script di contenuto (`200` per `20`, o un xp lasciato al posto del livello: `4000`) produce una magia servita sul filo, mai insegnata, mai offerta dall'oste e non contata dal WARN di boot. Con circa 45 magie nuove e 96 livelli rivisti a mano il rischio è concreto; il caso «xp al posto del livello» è esattamente l'errore che questa fase rende possibile.
**Fix:** un solo tetto letto dalla tabella dei livelli:
```ts
// level-table.ts
export const MAX_LEVEL = LEVEL_TABLE[LEVEL_TABLE.length - 1].level;

// quest-rewards.ts
export const isLearnLevel = (value: unknown): value is number =>
    Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_LEVEL;

// spell.model.ts
@Prop({ type: Number, required: true, min: 1, max: MAX_LEVEL })
```
Così il reporter la conta fra le non valide e il WARN la segnala (test in RED prima: livello 21 non servibile, non insegnato, non offerto).

### WR-04: Il test «identico tiro per tiro» non esercita il pavimento: confronta due mondi entrambi senza pavimento

**File:** `src/quests/generation/quest-generator.int-spec.ts:1188-1229`
**Issue:** `runWorld()` (città 0 `drusteaCapital`) e `runWorld({ 0: ferrionCity })` sono due mondi con `poiRankFloor` vuoto e la stessa taglia: il test passerebbe anche se il codice nuovo spostasse o aggiungesse un tiro in ogni mondo, perché lo farebbe in entrambi. Dimostra solo che `drusteaCapital` e `ferrionCity` si equivalgono, non la garanzia dichiarata nel titolo e nel handoff (BE-ORIGIN-09 «mondo senza Necrorian identico tiro per tiro»). La garanzia vera oggi sta solo nelle spec a seme fisso preesistenti.
**Fix:** fissare il riferimento a valori registrati sul commit base `a208ad3d` invece che a una seconda corsa del codice nuovo:
```ts
const reference = await runWorld();
expect(reference.draws).toBe(<numero registrato su a208ad3d>);
expect(reference.quests.map(({ title, rank }) => [title, rank])).toEqual(<elenco registrato>);
```
oppure togliere il caso e citare nel handoff le spec a seme fisso come prova.

## Info

### IN-01: Cancello dell'oste sul livello prima dell'esito, cancello delle quest sul livello dopo; la magia del blocco passa sempre

**File:** `src/quests/guided/mission-prize-options.service.ts:164-165`, `src/quests/guided/mission-prizes.ts:152-155`
**Issue:** coerente e documentato (BACKEND-NOTES §2 b), ma con due effetti da conoscere: (1) l'oste non può dare una magia di livello N a chi raggiunge N proprio con l'xp di quella missione, mentre una quest la insegnerebbe; (2) la magia fissa del blocco (`block.spell`) è sempre ammessa, anche sopra il livello e anche se già nota: l'oste la sceglie, salvataggio e completamento la accettano, poi `planParticipant` non la insegna senza alcun errore. Comportamento ereditato dall'xp, non introdotto dalla fase.
**Fix:** se l'utente vuole simmetria, calcolare il livello dell'allowance su `xp + prize.xp` al salvataggio e al completamento; altrimenti lasciare e tenere la nota nel handoff.

### IN-02: `spellMigrationOf` conta «già a posto» un valore presente ma non valido

**File:** `src/migrations/spell-origins/spell-fields.step.ts:38-41`
**Issue:** scelta dichiarata (C-5: non si corregge), ma la riga di log «già a posto N» comprende magie con `origin: 'magic'` o `minLevelToLearn: 0`; l'unico segnale è il WARN del reporter, che arriva dopo e senza id. Inoltre `senza corrispondenza` somma due casi diversi (xp non convertibile e scrittura non applicata).
**Fix:** nessuno obbligatorio, il migratore esce dal repo. Nel runbook: se il WARN `Magie: …` compare dopo il boot, cercare a DB `origin` fuori dalle tre e `minLevelToLearn` non intero.

### IN-03: `isLearnLevel` vive nei premi delle quest ma è la regola del catalogo delle magie

**File:** `src/quests/outcomes/rewards/quest-rewards.ts:124-126`, importata da `src/spells/spell-catalogue.reporter.ts:8`
**Issue:** `src/spells` dipende da `src/quests/outcomes/rewards` per una regola che appartiene al modello della magia (SoC, direzione della dipendenza rovesciata).
**Fix:** spostarla in `src/spells/learn-level.ts` (con il tetto di WR-03) e importarla da quest, oste e reporter.

### IN-04: Commento di `spell-schools.ts` non vero: la ripetibilità non legge la tabella

**File:** `src/quests/spell-schools.ts:1`, `src/quests/acceptance/quest-eligibility.ts:34-36`
**Issue:** il commento dichiara «una tabella, tre consumatori (ripetibilità, pool dello studio, sorteggio)», ma `REPEATABLE_TYPES` elenca a mano i tre tipi. Una quarta scuola aggiunta alla tabella non sarebbe ripetibile.
**Fix:** `new Set([..., QuestType.study, ...SPELL_SCHOOL_TYPES, ...])` con `SPELL_SCHOOL_TYPES = Object.keys(SPELL_ORIGIN_BY_QUEST_TYPE) as QuestType[]` esportato da `spell-schools.ts`, oppure correggere il commento.

### IN-05: Stessa costruzione di `SpellCandidate` in due file

**File:** `src/quests/outcomes/rewards/quest-rewards.ts:214-228`, `src/quests/guided/chosen-rewards.ts:34-47`
**Issue:** `spellCandidateOf` e `chosenSpellOf` copiano gli stessi tre campi dal catalogo; la fase ha dovuto aggiungere `relatedLore` in entrambi (dimenticarne uno = lore mai sbloccata su una via).
**Fix:** esportare da `quest-rewards.ts` un `catalogSpellCandidateOf(spellId, catalog)` che fa `{ spellId, ...catalog.spells.get(hex) }` e usarlo in entrambi.

### IN-06: `ShopPoolViolation.size` ora porta la fascia del negozio, non la taglia

**File:** `src/shops/shop-pool.report.ts:22, 66-71, 149`
**Issue:** per Murnborim e Thengran il campo `size` e la riga di log dicono `city` mentre la taglia sul filo è `capital`: nome fuorviante (già domanda aperta nel handoff).
**Fix:** rinominare campo e variabile in `tier`.

### IN-07: La guardia `floor !== null` in `mixedOf` è portante ma non spiegata

**File:** `src/quests/generation/quest-generator.service.ts:342-343`
**Issue:** `allowsMixedLower(null, rank)` risponde già correttamente, quindi la guardia sembra ridondante; in realtà serve a far consumare il tiro di `mixedSeatsOf` nei mondi senza pavimento anche quando non c'è titolo inferiore. Chi la «semplifica» sposta i tiri delle spec a seme fisso.
**Fix:** una riga di commento sul perché, oppure estrarre `skipsMixedRolls(floor, rank)` con il nome che lo dice.

### IN-08: Il pavimento di Necrorian vale solo per le generate; nessun controllo sulle quest scritte a mano

**File:** `src/quests/generation/generation-rules.ts:132-137`
**Issue:** D-12 chiede che anche la quest `void` rispetti il pavimento; il codice non lo verifica né lo segnala al boot (scelta dichiarata in REPO-RULES). Una quest di contenuto su un POI di Necrorian con `minTitle` sotto mage o assente resta accettabile da tutti.
**Fix:** nessun codice richiesto; nel compito di contenuto verificare a DB dopo la scrittura che ogni quest aperta su marker e POI di Necrorian abbia `requirements.minTitle` in `mage` / `hero`.

---

_Reviewed: 2026-11-15T20:00:10Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
