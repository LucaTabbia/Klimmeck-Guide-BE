---
phase: 23
slug: sconfitta-riposo-recupero-compagni
fixed_at: 2026-11-14T22:22:16Z
review_path: .planning/phases/23-sconfitta-riposo-recupero-compagni/23-REVIEW.md
iteration: 1
findings_total: 19
fixed: 14
not_needed: 2
deferred: 3
status: all_fixed
sdl_changed: false
---

# Phase 23 — Correzioni della code review

`status: all_fixed` vuol dire che ogni finding ha ricevuto il trattamento previsto dal suo ruling (correzione, conferma o rinvio). HEAD di partenza `f9524391` (`docs(phase-23): add the code review report`). TDD: un commit RED `test(...)` che fallisce per il motivo del finding, poi il GREEN `fix(...)`. Fanno eccezione A-09 e B-06, che sono refactor senza effetto osservabile (un solo commit `refactor`, coperto dalle spec esistenti), e B-08, che aggiunge solo test e li vede verdi al primo colpo perché i filtri d'identità del viaggio reggevano già. SDL invariato: `git diff --exit-code src/schema.gql` dà 0 dopo il boot reale, e rispetto a `2c462cbe` l'unica riga tolta resta quella di `useItem`.

## Esito per finding

| Id | Verdetto | Commit | Nota |
|----|----------|--------|------|
| A-01 | fixed | 216fb059, 1e68485a | `companionHealOf`: `Math.floor(lifePoints + power)` come la pozione del personaggio. Con `power` 12.5 su 50 dà 62; 0.5 → `ITEM_NO_EFFECT` |
| A-02 | fixed | 3cedb437, cf3e1ec5 | `companionLifeAt`: `elapsed = Math.max(0, now − asOf)`. Un'ancora nel futuro tiene la vita dell'ancora, quindi la vita non va mai sotto 1 né viene scritta a 0 (prima: −79 con l'ancora avanti di T) |
| A-03 | fixed | f9932b0f, 5c0ecad1 | `PetRecoveryService.release`: proprietario (`ownerIdOf`) e specie si leggono PRIMA dei claim. Se una lettura fallisce, il marcatore resta e lo sweep seguente riprova. Prova: `findOne`/`find` che lancia una volta, poi la push parte al secondo sweep |
| A-04 | fixed | 9b225dfc, ed5cf8fd | `RenamePetRequest.name`: `@ValidateIf(name !== null)` al posto di `@IsOptional()`. Un nome omesso dà `BAD_USER_INPUT` e la voce non cambia; `null` esplicito toglie ancora il nome. SDL invariato |
| A-05 | not_needed | — | Confermato dal ruling (D-11): la push «di nuovo in forze» parte alla scadenza della sconfitta anche per un compagno già riequipaggiato. Lo fissa `pet-recovery.int-spec.ts` («still pushes for a companion equipped again…»). Riga per l'handoff qui sotto |
| A-06 | not_needed | — | Ruling: livello salvato che resta indietro se cambia `Pet.maxXp` a DB. Si riallinea al primo premio di xp (D-39). Riga per l'handoff |
| A-07 | fixed | 44b00ba4, 3ad87580 | `companionLevelThresholds`: dal livello 2 la soglia vale almeno 1 xp. Test sui tetti 1, 5, 10, 22, 23: livello 1 a xp 0, mai decrescente, mai oltre 10, 10 al tetto (prima: livello 7/3/2/2 a xp 0). Soglie invariate dai 23 xp in su (pin del tetto 100 verde) |
| A-08 | deferred | — | Analisi qui sotto: `hpAfter` omesso NON ricade sul simulato. Il ruling dice di fermarsi |
| A-09 | fixed | b274a60c | Refactor: il messaggio di `PET_NAME_INVALID` usa `CHARACTER_NAME_MIN_LENGTH`/`MAX_LENGTH`, il `@Prop` di `OwnedPet.level` usa `COMPANION_LEVELS`. Testo e schema identici |
| A-10 | deferred | — | Ruling: sweeper senza paginazione, stesso limite dello sweeper della prigione |
| B-01 | fixed | 851b4790, 068d2b79 | Dopo il commit: prima i job del viaggio (`moveTravelJobs`/`afterCommit`), poi `deliverAndNotify` (consegna + push), sia nella vittoria sia in `afterDefeat`. Prova deterministica: trasporto FCM che non risponde finché il test non lo lascia andare, coda fotografata all'invio (vinta: job della prossima imboscata già accodato; persa: job vecchio rimosso e nuovo accodato). Nessuno sleep |
| B-02 | fixed | 521d1d0c, 416abf92 | Regola unica: `woundsSlowdownOf` = fattore di velocità prima / dopo lo scontro. Allunga la strada a piedi (`OnFootTravelInput.woundsSlowdown`) e il ripiego residuo della sconfitta; il piano del cibo segue la durata nuova. Con la gamba rotta: × 1.25 |
| B-03 | fixed | 0c4f5065, 09ec4a95 | `mountFallenInDefeat`: in una sconfitta `onFoot` è true solo se cade la cavalcatura della partenza (`activeTravel.mount`). Sui viaggi senza mount vale il compagno equipaggiato con `detour.petSpeed > BASE_SPEED`. Quando il compagno cade, la deviazione resta a passo di marcia |
| B-04 | fixed | e413cb03, d709ea01 | Nuovo predicato `isMountFactor` (fattore finito > 1) in `travel-timing.ts`, usato da `mountOf`, `isMountFallen` e `paceFactorOf`. Un pet con fattore 1 o più lento non dà mount, ricalcolo né `onFoot` |
| B-05 | fixed | c738d852, 0d378a13 | `onFootPlanOf` ridirige per fame solo se `detour.baseHours != null` (città raggiungibile per strada). Sul ripiego: quest tenuta, `reachedCity` null, nessun «la fame ti porta verso», meta invariata a piedi (piano 13). Test unit e int (strade cancellate) |
| B-06 | fixed | f6a95c7c | Refactor: rimosso `AmbushOutcomePlan.onFootFood` (scritto, mai letto) |
| B-07 | fixed | afc9dc8f, e0461d2a | `defeatPlanOf`: `travelAfter.rewritten: true`; `afterDefeat` passa da `moveTravelJobs` (stesso cancel+schedule, nessuna imboscata sulla deviazione) |
| B-08 | fixed (parziale) | 92ef7499 | Aggiunte (a) job di completamento della camminata dopo che il viaggiatore è uscito dalla strada → `stale`, nessuna push `travelEnd`; (c) job di completamento del viaggio a cavallo dopo la riscrittura → `stale`; (d) WriteConflict vero (scrittura rivale fra snapshot e scrittura) → callback rieseguito 2 volte, un solo risultato e una sola push. **(b) deferred**: seconda imboscata già scaduta risolta dallo sweeper prima del riallineamento della prima (serve un'interleaving fra sweep e risoluzione che oggi non si pilota senza timer) |
| B-09 | deferred | — | Ruling: la pedina salta indietro se l'imboscata si risolve in ritardo (limite dello sweep, da guardare in UAT). Riga per l'handoff |

## A-08: perché `deferred`

In una correzione dell'oste, `hpAfter` omesso NON ricade sul valore simulato. `gm-overrides.ts` → `hpAfterOf`: con `hpAfter` `undefined`/`null` restituisce `participant.currentLifePoints`, cioè la vita del partecipante all'INIZIO dello scontro (stato prima dello scontro costruito da `stateBeforeFight` in `mission-draft-save.service.ts` → `corrected`). Gli altri effetti omessi seguono la stessa regola: `injuriesAdded` → `[]`, `consumablesUsed`/`spellsUsed` → `[]`. Una correzione elencata sostituisce per intero gli effetti di quel partecipante. Solo i partecipanti NON elencati tornano al simulato (commento D-06 su `corrected`). `companionLifeAfter` omesso (chiave assente → vita d'inizio scontro) è quindi coerente con `hpAfter`. Allineare solo il compagno al simulato renderebbe la semantica diversa da quella di `hpAfter`. Per l'istruzione del ruling mi sono fermato: nessuna modifica. Se si vuole «omesso = simulato», va cambiato per tutti gli effetti insieme (hp, ferite, consumabili, magie, compagno), è una decisione di contratto. Fino ad allora la FE deve rimandare sempre `companionLifeAfter` (e `hpAfter`) col valore simulato quando corregge un partecipante.

## Pin dei piani precedenti cambiati

- **Piano 13/14, `src/travel/ambush/ambush-plan.spec.ts`**
  - «rewrites the travel from the ambush point towards the reached city» (piano 05/13, rinominato «…, a new travel identity (D-11, Pitfall 5)»): `travelAfter.rewritten` da `false` a `true` (B-07, RED `afc9dc8f`).
  - «writes onFoot false on every other ambush (D-28)»: `rewritten` ora atteso `true` sul solo caso di sconfitta (B-07, nel GREEN `e0461d2a`). Dallo stesso caso è sparita l'asserzione su `onFootFood` (B-06).
- **Piano 13, `ambush-plan.spec.ts`**: «exposes whether the character would arrive alive on foot (D-16)» sostituito da «writes the food plan of the walk whether it suffices or not, without a detour (D-16)» (B-06). Tolte le altre 4 asserzioni su `onFootFood` nei casi del piano 13/14.
- **Piano 14 (B-03)**: nessun pin esistente ha cambiato valore. I casi di sconfitta già fissati usano tutti la cavalcatura della partenza (onFoot true) o un compagno in piedi (false). La regola nuova è fissata dal caso aggiunto «lights onFoot in a defeat only when the fallen companion is a mount».
- **Piano 12 (B-04)**: nessun pin esistente con fattore ≤ 1. Aggiunto «takes no mount from a pet not faster than walking» e il caso a fattore 1 / 0.5 in `isMountFallen`.
- **Piano 13 (B-05)**: nessun pin cambiato. I casi di ridirezionamento usano tutti una città raggiungibile.
- **`ambush-on-foot.spec.ts`**: l'helper `onFootWith` passa `woundsSlowdown: 1` (campo nuovo obbligatorio, B-02). Nessuna attesa cambiata.
- **Piano 08 (A-04)**: nessun pin cambiato. `null` esplicito toglie ancora il nome («renames and clears the name of a companion»).

## Righe per l'handoff (piano 18, `BACKEND-NOTES.md`)

- A-05: la push «di nuovo in forze» parte alla scadenza della sconfitta anche se il compagno è già stato riequipaggiato e ferito di nuovo (D-11).
- A-06: se cambia `Pet.maxXp` a DB, il livello salvato di un compagno resta quello vecchio finché non riceve un premio di xp (D-39).
- A-08: correzione dell'oste = sostituzione completa degli effetti del partecipante elencato. `hpAfter` e `companionLifeAfter` omessi valgono la vita d'INIZIO scontro, non il simulato: la FE rimanda sempre il valore simulato.
- B-09: la pedina può saltare indietro al punto dell'imboscata se lo sweep la risolve in ritardo (D-13: `startTime` = istante dell'imboscata). Da guardare in UAT.
- B-02 (nuovo comportamento): le ferite prese nello scontro allungano anche la strada residua a piedi e il ripiego della sconfitta, come la deviazione.
- B-03/B-04/B-05 (nuovo comportamento): «Prosegui a piedi» solo se cade una cavalcatura (fattore > 1). Nessun ridirezionamento per fame senza una città raggiungibile per strada.

## Verifica finale

- `npx tsc --noEmit -p tsconfig.json`: 0.
- Unit completa: 304 suite / 4 206 test verdi (gate 23-17: 304 / 4 195; +11 casi nuovi).
- Integration `--runInBand`: `src/characters` 30 / 475; `src/travel` 13 / 277; `src/quests/outcomes` 16 / 222; `src/quests/guided` 5 / 93; boot reale `test/app.int-spec.ts` 1 / 102. Tutti verdi.
- SDL: `git diff --exit-code src/schema.gql` dà 0 dopo il boot; rispetto a `2c462cbe` l'unica riga tolta è `useItem(itemId: ID!): UseItemResult!`.
- `pgrep -fl 'bin/jest'` vuoto a fine di ogni finding e alla fine.
