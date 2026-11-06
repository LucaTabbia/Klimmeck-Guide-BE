---
phase: 15-imboscate-in-viaggio
verified: 2026-11-06T21:04:08Z
status: passed
score: 4/4 success criteria verified (7/7 requisiti BE-AMBUSH-01..07, contratto FE rispettato, nessun gap)
overrides_applied: 0
re_verification: false
gaps: []
human_verification:
  - test: "UAT su device della FE Phase 16 (differita, piano 16-08; dati e casi di `BACKEND-NOTES.md` §6)"
    expected: "Dopo la merge, build e riavvio del BE a BE fermo (nessuna migrazione né seeder; `AMBUSH_TIMEZONE` opzionale, indice `character_active_travel_ambush` creato al boot). I dati li scrive l'orchestratore a DB fuori dal repo. (a) Imboscata forzata: su un viaggio di almeno 10 km seminare l'intero sotto-documento `status.activeTravel.ambush` = `{ at: <passato fra startTime e adesso>, km: <intero 1 ≤ km < distance>, attempts: 0 }`; lo sweep la risolve entro 60 s. (b) Sconfitta forzata: togliere `assets.wearedEquipment` con `damages` e `assets.activeSpells` (potere 0, sconfitta certa); la vittoria non è mai garantita. (c) Due imboscate: seconda semina con `km` maggiore e `at` nel passato, oppure due report in `status.activeTravel.ambushReports[]` con `endTime` passato. Casi: vinto (`characterUpdated` subito, viaggio invariato, carosello d'una pagina all'arrivo); perso (push + banner «Imboscata!» con la città, pedina che riparte dal punto, corsia libera, carosello con «Portato a»); due imboscate (due pagine in ordine cronologico, un «Continua» conferma entrambe); teleport con imboscata pendente (annullata, report consegnati subito). Probe: `{ unacknowledgedQuestResults { id kind outcome resolvedAt quest { title } ambush { at nearCity { name } reachedCity { name } } } }`"
    why_human: "Esperienza di gioco sul device e dati sul DB reale; fuori dal perimetro della fase BE (nessun checkpoint umano nella fase), non bloccante"
---

# Phase 15: Imboscate in viaggio — Verification Report

**Phase Goal:** un viaggio può essere teso da una o più imboscate: sorteggio km per km alla partenza (0,2%/0,6% per km, notte 22–06 in `AMBUSH_TIMEZONE`), job che la risolve con `CombatResolver` contro nemici del POI più vicino nella fascia [Facile, Medio] del livello; vittoria → HP/ferite, monete e XP del rango, viaggio invariato e risorteggio; sconfitta → HP ≥ 1 e ferite, rotta riscritta verso la città più vicina (meta compresa), quest abbandonata, cibo non rimborsato, push; report trattenuti e consegnati all'arrivo sulla pipeline dei risultati.
**Verified:** 2026-11-06T21:04:08Z (branch `feat/15-imboscate-in-viaggio`, HEAD `36ef736`, base `develop` `b492a46`)
**Status:** passed (nessun gap; UAT su device differita alla FE Phase 16 in `human_verification`)
**Re-verification:** No — verifica iniziale

## Metodo

Lettura di codice, spec e handoff contro ROADMAP §Phase 15 (4 criteri), REQUIREMENTS BE-AMBUSH-01..07, `15-CONTEXT.md`/`15-REPO-RULES.md` (contratto FE) e `BACKEND-NOTES.md`. Nessuna scrittura, nessun accesso a `.env` né al DB reale, nessun `npm run build`. I finding della review (`15-REVIEW.md`, 0 critical / 1 warning / 8 info) e i ruling sono già registrati e affidati al fixer: non sono ripetuti come gap.

- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- Unit mirate `src/travel src/config src/push src/roads src/quests/generation src/models --selectProjects unit` → 78 suite / 818 test verdi.
- Integration, una suite con `--runInBand`: `src/travel/ambush/ambush-lifecycle.int-spec.ts` 16/16 (due vittorie con risorteggio e report in ordine, report trattenuti fino all'arrivo, ActiveTravel sul filo identico, consegna owner-only con ack, completamento che aspetta l'imboscata, trigger concorrenti → una sola risoluzione, sconfitta con quest abbandonata e deviazione, meta più vicina, push a ogni sconfitta e mai in vittoria, notte vs giorno, DST, soglia 10 km, job duplicato/anticipato/obsoleto no-op, reconciler al boot e sweep, teleport, pool non componibile).
- Gate SDL: `git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` stampa la sola riga `  quest: QuestResultQuest!` (eccezione dichiarata D-14); le restanti righe sono aggiunte (`AmbushCity`, `AmbushReport`, `QuestResultKind`, `PushEventType.ambushDefeat`, `QuestResult.ambush/kind`, `quest` nullable). `ActiveTravel`, `TravelPreview` e le operazioni non compaiono nel diff.
- `pgrep -fl 'bin/jest'` vuoto; `git status --short` pulito prima della scrittura di questo file.
- Suite completa e coverage non rilanciate: sono il gate 15-11.

## Goal Achievement — Success Criteria

| # | Criterio | Stato | Evidenza |
|---|----------|-------|----------|
| 1 | Sorteggio km per km 0,2%/0,6%, notte 22–06 in `AMBUSH_TIMEZONE`, nessun sorteggio sotto 10 km, persistenza interna, job Bull con reconciler e sweep, risorteggio dopo vittoria (mai sotto 10 km residui, mai sulla deviazione), una sola pendente, duplicato/obsoleto no-op | VERIFIED | `ambush-rules.ts` (`AMBUSH_RULES` = 0,002 / 0,006 / 22 / 6 / 10 / 10, `hazardAt`); `ambush-draw.ts` (soglia `minTravelKm` alla partenza e `minRemainingKm` dopo una vittoria, km interi fino a `⌈distance⌉ − 1`, istante `startTime + ⌊km/distance × durata⌋`, ora locale via `hourOf`); `ambush-clock.ts` (`Intl`, `hourCycle h23`); `ambush-config.ts` (fuso IANA validato al boot). Sorteggio solo in `TravelService.startTravel` e nel movimento reale dell'accettazione (`withAmbush`), fuori dal callback della transazione; le anteprime non lo chiamano. `ambush`/`ambushReports` sono `@Prop` senza `@Field` (lifecycle «keeps the wire travel identical»). Job `ambush` con `ambushJobId`, `AmbushProcessor`, `AmbushSweeper` (reconciler, single-flight, fail-open al terzo errore), indice `character_active_travel_ambush`, `AmbushModule` in `AppModule`. Dopo la sconfitta nessun sorteggio sulla deviazione. Int-spec verdi sui casi sopra |
| 2 | Nemici dal POI più vicino (zona + animali + `city`, mai leggendari, `all` di riserva) nella fascia [Facile, Medio] × `XP_SCALE` con composizione Phase 13; `CombatResolver`; transazione unica; vittoria e sconfitta come da roadmap | VERIFIED | `level-bands.ts` (`LEVEL_BANDS`, `xpBandOf`), `ambush-enemies.ts` (`composeAmbushEnemies`, pool con animali), `ambush-point.ts` (`nearestPoi`, `pointAtFraction`), `AmbushResolutionService.resolve`: composizione, risorteggio e rotta fuori dal callback, combattimento e scritture dentro `connection.transaction`, wallet via `WalletService`, premi `ambushPrizesOf` (`GENERATED_PRIZES.enemy` × `TIER_MULTIPLIER`, legend come hero, più xp dei nemici). Sconfitta: `planAmbushOutcome` con `activeTravel` riscritto `kind: free`, `startTime` = istante, `to` e `endTime` nuovi, città più vicina per strada con meta e partenza (`RoadsService.nearestByTime`), `abandonLane` con `unstartedSeatReleaseOf`, nessun rimborso del cibo né costo sulla deviazione; push `ambushDefeat` dopo il commit (`PushService.sendToUser`), mai in vittoria. Pool non componibile / catalogo vuoto / proprietario o città assenti → `skip` con risorteggio e completamento ri-accodato |
| 3 | Report trattenuti, `QuestResult` per imboscata nella stessa transazione del completamento, `kind: ambush`, `quest` null, `ambush { at, nearCity, reachedCity }`, `resolvedAt` = istante, pipeline esistente, nessun `questEnd`; `travelEnd` invariato | VERIFIED | `ambush-results.ts` (`ambushResultDraftsOf`, ordine cronologico con parità per id), `TravelCompletionService` (`completionFilter` che aspetta l'imboscata, `create(drafts, { session, ordered: true })` nella transazione), modello `QuestResult` con `kind` default `quest` e `quest` obbligatorio solo se `kind == quest`; SDL con `QuestResultKind`, `AmbushReport`, `AmbushCity`. Lifecycle: consegna owner-only e ack («delivers the reports to the owner only and acknowledges them»), due report in ordine, completamento dopo l'imboscata. Nessuna query/mutation nuova |
| 4 | Anteprime mute; teleport annulla l'imboscata e consegna i report; integration su vittoria con risorteggio, sconfitta con deviazione (meta compresa) e quest abbandonata, notte vs giorno, tratto sotto 10 km, job duplicato no-op, teleport; handoff | VERIFIED | `withAmbush` chiamato solo in `startTravel` e nel movimento reale (commento «solo il viaggio reale sorteggia, l'anteprima mai»); `TravelPreview` assente dal diff SDL. `TravelService.teleport` cancella l'imboscata (`cancelAmbush`) e inserisce i report nella transazione; lifecycle «cancels the pending ambush and delivers the reports on teleport». Int-spec in `ambush-lifecycle`, `ambush-resolution`, `ambush-sweeper`, `ambush.processor`, `travel.service`, `quest-acceptance.service`, `teleport.resolver`, `travel-completion`. `BACKEND-NOTES.md` con §0 TL;DR, §1 contratto, §2 push, §3 semantica, §4 report, §5 concorrenza, §6 dati UAT, §7 deploy, §8 deviazioni |

**Score:** 4/4.

## Requisiti

| Requisito | Stato | Evidenza |
|-----------|-------|----------|
| BE-AMBUSH-01 | SATISFIED | SC1 (`AMBUSH_RULES`, `drawAmbush`, `AMBUSH_TIMEZONE`, persistenza interna) |
| BE-AMBUSH-02 | SATISFIED | SC1/SC4 (job, processor, sweeper con reconciler, no-op duplicati, teleport) |
| BE-AMBUSH-03 | SATISFIED | SC2 (`level-bands`, `ambush-enemies`, `nearestPoi`, `CombatResolver`) |
| BE-AMBUSH-04 | SATISFIED | SC2 (vittoria: HP/ferite, `ambushPrizesOf`, viaggio invariato) |
| BE-AMBUSH-05 | SATISFIED | SC2 (sconfitta: deviazione, abbandono, push, nessun soccorso) |
| BE-AMBUSH-06 | SATISFIED | SC3 (`QuestResult` `kind: ambush`, `ordered: true`, pipeline esistente) |
| BE-AMBUSH-07 | SATISFIED | SC4 (int-spec e handoff) |

Nessun requisito orfano: REQUIREMENTS.md mappa sulla Phase 15 solo BE-AMBUSH-01..07 (già `[x]`).

## Contratto FE (15-REPO-RULES §Schema)

Rispettato: `enum QuestResultKind { ambush quest }`, `QuestResult.kind: QuestResultKind!`, `quest` nullable, `AmbushCity { id, name }`, `AmbushReport { at, nearCity, reachedCity }`, `QuestResult.ambush: AmbushReport`, `PushEventType.ambushDefeat`; `ActiveTravel`, `TravelPreview`, `startTravel`, `acceptQuest`, `travelEnd` invariati. Diff SDL: una sola riga tolta (`  quest: QuestResultQuest!`), come dichiarato.

## Anti-pattern e note

Nessun blocker. I finding della review (sweeper `recordFailure` non protetto, log del motivo di `skip`, ramo ridondante in `planAmbushOutcome`, `localeCompare` → `compareIds`, filtro `dueTravelsFilter`, commento del binding `ChanceSource`, offset fisso in `AMBUSH_TIMEZONE`) sono nel perimetro del fixer e non sono gap della fase. Punti aperti già nell'handoff §8: pedina che può retrocedere dopo una sconfitta (aggancio al grafo), lore dei nemici battuti in imboscata (BE Phase 16), refactor facoltativo di `ambush-resolution.service.ts` (532 righe).

## Gaps Summary

Nessun gap. La fase consegna ciò che prometteva; resta la UAT su device, differita alla FE Phase 16-08 con i dati di `BACKEND-NOTES.md` §6.

---

_Verified: 2026-11-06T21:04:08Z_
_Verifier: Claude (gsd-verifier)_
