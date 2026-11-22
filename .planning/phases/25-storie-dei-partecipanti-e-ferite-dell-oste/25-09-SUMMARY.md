---
phase: 25-storie-dei-partecipanti-e-ferite-dell-oste
plan: 09
subsystem: gm
tags: [injuries, innkeeper, guided-mission, completion, fold]
requires:
  - "effectiveSequenceOf con injuriesRemoved e innkeeperInjuries per scontro (25-07)"
  - "applyWoundCorrection e la protezione della cura in planParticipant (25-04)"
provides:
  - "netWoundCorrectionOf(status, sequence) in innkeeper-injuries.ts"
  - "aggregateEffectsOf / guidedBattleOf con lo stato riletto in sessione: ferite dal netto della piega in ordine"
  - "overrideInputOf con le rimozioni"
affects: [25-13, 25-14]
tech-stack:
  added: []
  patterns:
    - "il netto di una sequenza di correzioni è costruito sopra applyWoundCorrection: nessuna regola dell'origine duplicata"
key-files:
  created: []
  modified:
    - src/quests/outcomes/injuries/innkeeper-injuries.ts
    - src/quests/outcomes/injuries/innkeeper-injuries.spec.ts
    - src/quests/guided/guided-outcome.ts
    - src/quests/guided/guided-outcome.spec.ts
    - src/quests/guided/guided-completion.service.ts
    - src/quests/guided/guided-completion.service.int-spec.ts
key-decisions:
  - "il netto conta fra le tolte anche una ferita il cui numero di copie cambia (doppioni legacy tolti e riaggiunti con la stessa origine): senza, il netto non ridà lo stato della piega"
  - "task 2 chiuso col solo commit di test: nessuna modifica al servizio oltre ai due siti di chiamata del task 1"
requirements: [BE-WOUND-05, BE-WOUND-06]
metrics:
  tasks: 3
  files: 6
  completed: 2026-11-21
---

# Phase 25 Plan 09: Completamento guidato con la piega in ordine Summary

Il completamento guidato scrive ferite, rimozioni e origine dal netto di una piega IN ORDINE sugli scontri (`netWoundCorrectionOf` sullo stato riletto in sessione) al posto dell'unione delle ferite; `overrideInputOf` porta le rimozioni alla rivalidazione (D-12, D-13, D-14, D-16).

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | 760ff414 | test(gm): expect the guided wounds to fold in order |
| 1 GREEN | e87d9efb | feat(gm): fold the wounds of the guided fights in order |
| 2 (solo test) | 9e09fcf4 | test(gm): expect the guided completion to write wound origins |
| 3 | (questo commit) | docs(phase-25): record plan 09 progress |

## Cosa cambia

- **`netWoundCorrectionOf(status, sequence)`**: piega `applyWoundCorrection` scontro per scontro e confronta lo stato iniziale con quello finale. Tolte = tipi noti di prima spariti, con un'altra origine o con un numero di copie diverso; aggiunte = tipi noti finali, nell'ordine finale, non rimasti dopo le tolte; a mano = aggiunte che alla fine sono dell'oste. `injuriesAdded` sempre presente, le altre due chiavi solo se non vuote.
- **`aggregateEffectsOf(fights, hex, status)` / `guidedBattleOf(fights, hex, enemyXp, status)`**: le tre chiavi delle ferite vengono dal netto; vita, consumi, magie e compagno come prima. `new Set<InjuryType>` sparito dal file.
- **`overrideInputOf`**: `injuriesRemoved` copiata dagli effetti, chiave assente se vuota.
- **`guided-completion.service.ts`**: `seatOutcomeOf` passa `snapshot.status`; `spellsUsedBy` riceve i personaggi della richiesta. Il file non nomina `innkeeperInjuries`.

## Fallimenti RED attesi e osservati

**Task 1** — 19 rossi: i 13 casi di `netWoundCorrectionOf` (`is not a function`) e in `guided-outcome.spec.ts` sei casi: i cinque nuovi più l'esistente «aggregates the corrected effects of every fight (D-08)», la cui attesa ora porta `innkeeperInjuries: [blackEye]` (la ferita del primo scontro corretto è di pugno dell'oste). Il caso «folds the wounds…» era rosso proprio perché l'unione riportava la ferita tolta.

**Task 2** — eseguiti prima di toccare il servizio: **tutti verdi al primo colpo**, perché la piega e le rimozioni alla rivalidazione sono del task 1 e la protezione della cura è del piano 04. Nessun GREEN, nessun commit `fix`. Per provare che i casi mordono, due mutazioni temporanee (poi annullate con `git checkout`):

- `overrideInputOf` senza le rimozioni → rosso «refuses at completion a removal stored on an uncorrected fight the character no longer carries (D-13)»;
- unione delle ferite al posto del netto → 7 rossi su 10 (restano verdi i due rifiuti e «leaves a simulated wound…»).

Una prima stesura aveva 4 rossi per colpa della semina, non del codice: la bozza nasce col premio del blocco del rango e la cura del blocco guariva `sprain`; ora il blocco ha la cura solo nel caso che la prova.

## Casi nuovi

`innkeeper-injuries.spec.ts`, `describe('netWoundCorrectionOf')`: proprietà «gives back the folded state…» su nove sequenze (le otto del piano più i doppioni tolti e riaggiunti con la stessa origine); «drops a wound added by a fight and removed by a later one (D-13)»; «removes and adds again a wound whose origin changed (D-16)» (nei due versi); «carries no removal nor origin key… (D-13)»; «does not mutate what it reads (D-13)».

`guided-outcome.spec.ts`: «folds the wounds of the fights in order instead of joining them (D-13)»; «removes in the aggregate a wound carried before the mission (D-13)»; «marks in the aggregate a wound hand-inflicted in any fight (D-12)»; «leaves out of the aggregate a simulated wound the character already carries (D-13)»; «carries the removals into the override input (D-13)».

`guided-completion.service.int-spec.ts`, `describe('innkeeper wounds')`: i nove casi del piano più il rifiuto su uno scontro non corretto. Le bozze passano dal salvataggio vero (`simulate` + `saver.save` con le correzioni), non da una semina diretta; solo il caso in più scrive a DB `simulated.injuriesRemoved`.

## Casi esistenti toccati per lo stato in più

In `guided-outcome.spec.ts` ricevono `UNHURT` (`{}`): «aggregates the corrected effects of every fight (D-08)» (anche l'attesa, vedi sopra), «aggregates the companion life of the last fight that had it (D-17, D-26)», «has no battle without fights (D-24)». `guidedBattleOf` non ha casi unit: è coperto dall'integrazione. I due casi «(D-14)» della spec d'integrazione sono intatti.

## Dove sono provate le tre trappole

| Trappola | Prova |
|----------|-------|
| 1. `sameCorrections` scarta una correzione di sole rimozioni | piano 07 (spec del salvataggio); qui la percorrono i casi che salvano `{ injuriesRemoved }` da solo |
| 2. `overrideInputOf` perde le rimozioni alla rivalidazione | unit «carries the removals into the override input (D-13)»; int «refuses at completion a removal stored on an uncorrected fight…» (rosso sotto mutazione) |
| 3. unione delle ferite fra scontri | unit «folds the wounds of the fights in order…» e la proprietà del netto; int «drops in the second fight a wound the first one added (D-13)» |

## Deviations from Plan

**1. [Rule 1 - Bug] Il netto conta anche il cambio del numero di copie.** Con l'algoritmo alla lettera, una ferita presente in doppia copia (dato legacy), tolta in uno scontro e riaggiunta in un altro con la stessa origine, non entrava né fra le tolte né fra le aggiunte: il netto lasciava due copie, la piega una. La condizione «origine cambiata» è estesa a «copie o origine cambiate»; coperto dalla nona sequenza. Sul foglio non cambia nulla (togli-e-riaggiungi non compare). Commit e87d9efb.

**2. Il caso del piano per la trappola 2 non la distingue.** «completes a draft with a wound removed and added again (D-16)» resta verde anche se `overrideInputOf` perde le rimozioni: `validateOverrides` ignora in silenzio una ferita già portata e, sugli scontri corretti, `assertWoundCorrectionAllowed` riceve gli effetti interi. Le rimozioni nell'input contano solo dove quel secondo controllo non gira (scontro non corretto): aggiunto il decimo caso, che semina uno stato che il salvataggio non produce (rimozione sul simulato). È una difesa su una bozza manomessa, non un percorso dell'app.

**3. Bozze dal salvataggio vero** invece che seminate a DB (il piano diceva «seminate»): stessa copertura, percorso reale.

## Verifica

- Unit, intero progetto: 4656 verdi (312 suite). Integrazione del piano (4 spec): 134 verdi; larga (`src/quests src/gm test/app test/authz`): 1133 verdi (49 suite).
- `npx tsc --noEmit -p tsconfig.json` esce 0; `src/schema.gql` senza diff.
- Accettazione: `export function netWoundCorrectionOf` 1; `netWoundCorrectionOf(` 1 in `guided-outcome.ts`; `innkeeperInjuries` 0 in `guided-completion.service.ts`; `D-13)` 6 nella spec unit del guidato; nella spec d'integrazione `D-12)` 2, `D-13)` 7, `D-16)` 2; nessun `chance.next(` toccato.
- Prettier ed eslint sui file toccati puliti. Nessun `npm run build`, nessun riavvio del BE, nessuna lettura di `.env`.
- La suite larga ha superato i 180 s ed è stata spostata in background dall'ambiente: attesa fino alla fine, nessun jest rimasto vivo.

## Threat Flags

Nessuna superficie nuova. T-25-25..28 mitigate come da piano.

## Per i piani successivi

- **12:** la scrittura delle aggiunte al background entra nella stessa transazione; `aggregateEffectsOf` e `guidedBattleOf` vogliono lo stato del personaggio come ultimo argomento.
- **13 (gate):** un `status.injuries` con doppioni viene ripulito dal completamento solo per le ferite toccate da una correzione.
- **14 (handoff):** dichiarare che il foglio non elenca una ferita tolta e riaggiunta (né fra le aggiunte né fra le tolte) e che la cura scelta salta le ferite dell'oste.

## Known Stubs

Nessuno.

## Self-Check: PASSED

File modificati presenti e commit 760ff414, e87d9efb, 9e09fcf4 nel log.
