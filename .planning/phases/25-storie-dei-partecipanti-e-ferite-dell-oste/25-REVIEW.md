---
phase: 25-storie-dei-partecipanti-e-ferite-dell-oste
reviewed: 2026-11-21T18:46:08Z
depth: standard
diff_base: e87339bb
files_reviewed: 33
files_reviewed_list:
  - src/characters/creation/create-character-input.validator.ts
  - src/characters/creation/grapheme-count.ts
  - src/characters/items/item-use.plan.ts
  - src/gameRules/game-rule-error-code.enum.ts
  - src/gameRules/game-rule.exception.ts
  - src/models/character/character-status.model.ts
  - src/models/quest-result/quest-result.model.ts
  - src/models/request/complete-pending-request.model.ts
  - src/quests/acceptance/quest-acceptance.service.ts
  - src/quests/guided/background-additions.ts
  - src/quests/guided/draft-invalidation.ts
  - src/quests/guided/fight-state.ts
  - src/quests/guided/guided-completion.service.ts
  - src/quests/guided/guided-outcome.ts
  - src/quests/guided/mission-draft-save.service.ts
  - src/quests/guided/mission-draft.inputs.ts
  - src/quests/guided/mission-draft.mapper.ts
  - src/quests/guided/mission-draft.model.ts
  - src/quests/guided/mission-draft.service.ts
  - src/quests/guided/mission-draft.wire.ts
  - src/quests/no-effect/viewer-vitals.service.ts
  - src/quests/outcomes/combat/combat-resolver.ts
  - src/quests/outcomes/gm-completion.service.ts
  - src/quests/outcomes/gm-overrides.ts
  - src/quests/outcomes/injuries/cure-injuries.ts
  - src/quests/outcomes/injuries/heal-no-effect.ts
  - src/quests/outcomes/injuries/innkeeper-injuries.ts
  - src/quests/outcomes/outcome-plan.ts
  - src/quests/results/quest-result.populate.ts
  - src/quests/guided/mission-simulation.service.ts
  - src/quests/outcomes/unrewarded-plan.ts
  - src/characters/characters.resolver.ts
  - src/quests/guided/guided-mission.resolver.ts
findings:
  critical: 0
  warning: 1
  info: 7
  total: 8
status: issues_found
---

# Phase 25: Code Review Report

**Reviewed:** 2026-11-21T18:46:08Z
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Summary

Revisione del diff `e87339bb..HEAD` sotto `src/` e `test/`. I 29 file di produzione toccati sono stati letti per intero nel diff; in più sono stati letti, senza diff o quasi, i quattro file da cui dipende il giudizio (`mission-simulation.service.ts`, `unrewarded-plan.ts`, `characters.resolver.ts`, `guided-mission.resolver.ts`). I 28 file di test del diff **non** sono stati letti riga per riga: solo i titoli dei casi, l'assenza di `only`/`skip` e di artefatti di debug. Nessuna suite Jest è stata eseguita da questa revisione (né unit né integration).

Il nucleo della fase regge. Verifiche fatte:

- **Invariante del sottoinsieme.** Gli scrittori di `status.injuries` sono cinque (`outcome-plan.ts:618`, `unrewarded-plan.ts:107`, `item-use.plan.ts:311`, `ambush-plan.ts:254`, guardia via `planUnrewarded`): tre aggiungono soltanto, due curano passando da `cureInjuries` con le ferite dell'oste come intoccabili. `CharacterStatusInput`/`CharacterInput` non sono usati da alcuna mutation. Nessuna via toglie una ferita senza aggiornare l'origine.
- **Piega in ordine.** Sonda casuale (200 000 casi, con doppioni, stringhe legacy sconosciute, `innkeeperInjuries` assente o sporca, sequenze fino a tre scontri): `applyWoundCorrection(status, netWoundCorrectionOf(status, seq))` ridà sempre lo stato finale della piega (ferite come multinsieme, origine), l'origine resta un sottoinsieme senza doppioni, una cura con ogni tipo in `canHeal` non tocca mai una ferita dell'oste né la elenca fra le guarite. Zero fallimenti.
- **Cura dello stesso esito.** `planParticipant` passa a `cureInjuries` l'origine calcolata dopo la correzione (`outcome-plan.ts:490-494`).
- **Trappole dei ruling.** `sameCorrections` confronta anche le rimozioni (via `participantEffectsOf`), `overrideInputOf` le porta alla rivalidazione, l'unione fra scontri è sostituita dalla piega; la risimulazione azzera `corrected`.
- **Concorrenza.** Completamenti: snapshot letti in sessione, `$push` del background e cancellazione della bozza con `rev` nella stessa transazione, doppio completamento fermato dalla pending quest e dalla revisione. Pozione: guardia su `status.injuries` e, ora, su `status.innkeeperInjuries` come letti.
- **Autorizzazione.** Ogni handler della bozza è `@Roles(innkeeper)`; `characters` è dell'oste, `character(id)` passa da `@OwnsCharacter`; le aggiunte accettano solo partecipanti della bozza (`participantIn`).
- **Letture tolleranti.** I campi nuovi non nulli sul filo sono coperti da casi «scritto prima del campo» nelle spec dei risultati e del personaggio.

Resta un difetto vero sulle aggiunte ai background (tetto di lista più sostituzione dell'intera sezione) e sette note minori. Nessun problema di sicurezza trovato.

**Giudizio sui due punti aperti del handoff**

- **Q1 (la sezione presente sostituisce l'intera lista):** da sola sarebbe una scelta accettabile, ma combinata col tetto di 50 voci diventa un limite duro: vedi WR-01. Consiglio la fusione per personaggio, che per la FE di oggi dà lo stesso risultato.
- **Q4 (ferita simulata già portata, rifiutata solo se lo scontro è corretto):** accettabile così per questa fase, non riproducibile con la simulazione di oggi; il rimedio è piccolo e allinea i due rami: vedi IN-01.

## Warnings

### WR-01: Le aggiunte ai background hanno un tetto di 50 voci e la sezione si sostituisce per intero

**File:** `src/quests/guided/mission-draft.inputs.ts:216` (con `src/quests/guided/mission-draft-save.service.ts:279-284` e `:344-356`)

**Issue:** `backgroundAdditions` porta `@ArrayMaxSize(MAX_OVERRIDE_ENTRIES)` (50) e, a differenza dei premi, non fonde per personaggio: la sezione presente rimpiazza tutta la lista. I premi, per la stessa bozza, non hanno tetto di lista («limitata dai partecipanti della bozza, nessun tetto di lista (D-22)», riga 203) e fondono (`mergedPrizes`). Ne seguono due effetti:

1. Una `worldMission` con più di 50 partecipanti non può salvare le storie: la FE manda una voce per partecipante (testi vuoti compresi) e riceve `BAD_USER_INPUT`. Mandarle a blocchi non aiuta, perché ogni blocco cancella le aggiunte degli altri. Non ho trovato nel codice un tetto alle registrazioni di una `worldMission` (ricerca per nome, non provato a runtime): se un tetto ≤ 50 esiste altrove, questo punto cade e resta solo il secondo.
2. Qualunque chiamante che mandi una lista parziale (com'è lecito per `prizes`) cancella in silenzio le aggiunte già salvate degli omessi; nessun errore, il testo va riscritto.

**Fix:** fondere per personaggio come i premi, lasciando al testo vuoto il significato «cancella la mia»; il tetto resta un limite per chiamata e la FE di oggi non cambia comportamento.

```ts
// mission-draft-save.service.ts
private backgroundAdditionsOf(request, draft, incoming) {
    const characters = this.draftCharactersOf(request, draft);
    const sent = incoming.map(({ characterId, text }) => ({
        character: participantIn(characters, characterId)._id,
        text,
    }));
    return mergedAdditions(draft.backgroundAdditions ?? [], sent);
}

// background-additions.ts: le voci inviate sostituiscono quelle del loro personaggio, le altre restano
export function mergedAdditions(saved, sent) {
    assertOneEntryPerCharacter(sent);
    const resent = new Set(sent.map(({ character }) => hexOf(character)));
    return [
        ...saved.filter(({ character }) => !resent.has(hexOf(character))),
        ...presentOnly(sent.map(cleanEntryOf)),
    ];
}
```

In alternativa, se la sostituzione intera resta un ruling fermo: togliere `@ArrayMaxSize` come per `prizes` (la lista è già limitata dai partecipanti e dal controllo dei doppioni) e dichiarare nel handoff che una lista parziale cancella.

## Info

### IN-01: Q4 — una ferita simulata già portata rifiuta lo scontro corretto e passa in quello non corretto

**File:** `src/quests/guided/fight-state.ts:150-162` (chiamata da `mission-draft-save.service.ts:409` e `guided-completion.service.ts:101-105`)

**Issue:** `assertWoundCorrectionAllowed` rifiuta ogni `injuriesAdded` ancora portata, anche quando la ferita viene dal simulato e non dalla mano dell'oste. Nella bozza salvata il caso non esiste (la simulazione sceglie solo ferite non portate, `placeholder-combat-resolver.ts:89-91`). Può nascere solo alla rivalidazione del completamento, se lo stato reale del personaggio è cambiato dopo la simulazione: lo scontro non corretto passa, lo stesso scontro con una correzione qualunque (anche solo della vita) fa rifiutare l'intero completamento con `OUTCOME_OVERRIDE_INVALID`. Il rifiuto è coerente con le altre rivalidazioni (consumi, magie), quindi non è un difetto di questa fase.

**Fix:** quando lo si vorrà chiudere, lato BE e non lato FE: il divieto riguardi solo le ferite di pugno dell'oste. Una ferita simulata già portata è comunque ignorata da `applyWoundCorrection` e conserva l'origine.

```ts
export function assertWoundCorrectionAllowed(injuriesBefore, effects, simulatedAdded) {
    // ... controllo delle rimozioni invariato
    const byHand = handInflictedOf(effects, simulatedAdded);
    if (byHand.some((injury) => stillCarried.includes(injury)))
        throw GameRuleException.outcomeOverrideInvalid();
}
```

### IN-02: Il foglio del risultato tace quando una ferita cambia solo origine

**File:** `src/quests/outcomes/injuries/innkeeper-injuries.ts:70-71`

**Issue:** un togli-e-riaggiungi (D-16) non compare né in `injuriesAdded` né in `injuriesRemoved`: il `QuestResult` del giocatore non dice che una sua ferita è diventata incurabile; lo scopre solo da `status.innkeeperInjuries`. Vale anche per il netto fra scontri. È conforme alle definizioni («tipi assenti prima e presenti dopo»), ma va deciso consapevolmente.

**Fix:** nessuno se il silenzio è voluto; altrimenti dichiararlo nel handoff perché la FE confronti `innkeeperInjuries` prima e dopo, oppure aggiungere un campo additivo al foglio in una fase successiva.

### IN-03: Una lista `innkeeperInjuries` sporca a DB non viene mai riparata

**File:** `src/quests/outcomes/outcome-plan.ts:495-498`

**Issue:** `originChanged` confronta l'origine finale con quella **normalizzata** in lettura, non col campo grezzo. Se a DB finisse una voce che non è fra le ferite (oggi nessuna via la produce: solo una scrittura a mano), resterebbe lì; il campo GraphQL `CharacterStatus.innkeeperInjuries` la servirebbe grezza e, se il personaggio prendesse poi quella ferita in modo normale, la ferita nascerebbe incurabile.

**Fix:** confrontare col campo grezzo, così la prima risoluzione ripulisce: `!sameWounds(fought.innkeeperInjuries, snapshot.status.innkeeperInjuries ?? [])`. Costa una scrittura in più solo sui documenti sporchi.

### IN-04: «Chiave assente se la lista è vuota» scritta quattro volte

**File:** `src/quests/guided/fight-state.ts:165-170`, `src/quests/guided/guided-outcome.ts:188-197`, `src/quests/guided/guided-outcome.ts:229-237`, `src/quests/outcomes/injuries/innkeeper-injuries.ts:126-127`

**Issue:** due funzioni `removalsOf` con lo stesso nome e firme diverse più due spread in linea fanno la stessa cosa. Duplicazione nuova di questa fase.

**Fix:** una sola `removalsOf(list)` esportata da `innkeeper-injuries.ts` (il modulo che per ruling conosce le rimozioni) e usata nei quattro punti.

### IN-05: Il tetto di 1000 è ripetuto a mano nel messaggio d'errore

**File:** `src/gameRules/game-rule.exception.ts:355`

**Issue:** il messaggio porta `1000` scritto a mano mentre la regola vive in `BACKGROUND_ADDITION_MAX_GRAPHEMES` (`background-additions.ts:10`); gli altri messaggi della classe interpolano le costanti (per esempio i limiti del nome).

**Fix:** spostare la costante accanto a `exceedsGraphemeLimit` (`grapheme-count.ts`, già importato da entrambe le parti, così non nasce un ciclo fra `gameRules` e `quests/guided`) e interpolarla nel messaggio.

### IN-06: Due responsabilità fuori posto nel flusso guidato

**File:** `src/quests/guided/draft-invalidation.ts:21-37`, `src/quests/guided/guided-completion.service.ts:276-292`

**Issue:** `effectiveParticipantEffectsOf` (origine delle ferite di uno scontro) vive nel modulo dell'invalidazione della bozza; `spellsUsedBy` deve passare lo stato delle ferite ad `aggregateEffectsOf` e calcolare il netto delle ferite solo per leggere gli usi delle magie.

**Fix:** spostare `effectiveParticipantEffectsOf` in `fight-state.ts` (o in `guided-outcome.ts`); far leggere a `spellsUsedBy` gli usi da `effectiveSequenceOf(draft.fights, hex)` senza passare dall'aggregato.

### IN-07: Un `infos.background` non a lista blocca il completamento con un errore opaco

**File:** `src/quests/guided/guided-completion.service.ts:188-194`

**Issue:** `$push` su un `infos.background` rimasto stringa fa fallire la transazione con un errore del driver (500 non tipizzato) e il completamento resta impossibile finché l'oste non svuota quell'aggiunta. L'assunzione A1 è dichiarata sciolta per il DB reale; il rischio riguarda solo database non migrati (staging, copie locali).

**Fix:** al riavvio dal ramo l'orchestratore conti i documenti con `infos.background` di tipo stringa sul DB di destinazione; in alternativa una riga nel handoff. Nessuna modifica di codice necessaria.

---

_Reviewed: 2026-11-21T18:46:08Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
