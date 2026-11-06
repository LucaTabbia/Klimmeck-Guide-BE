---
phase: 15-imboscate-in-viaggio
fixed: 2026-11-06
fixed_at: 2026-11-06T21:17:28Z
source: 15-REVIEW.md
review_path: .planning/phases/15-imboscate-in-viaggio/15-REVIEW.md
rulings_path: .planning/phases/15-imboscate-in-viaggio/15-REVIEW-RULINGS.md
iteration: 1
fix_scope: all
findings_total: 9
findings_in_scope: 9
fixed_count: 7
skipped_count: 0
not_needed_count: 2
deferred_count: 0
status: all_fixed
---

# Phase 15: report dei fix della code review

**Data dei fix:** 2026-11-06
**Review di partenza:** `.planning/phases/15-imboscate-in-viaggio/15-REVIEW.md` (gruppi A/B/C, dettagli in `15-REVIEW-A.md`, `15-REVIEW-B.md`, `15-REVIEW-C.md`)
**Ruling applicati:** `.planning/phases/15-imboscate-in-viaggio/15-REVIEW-RULINGS.md`
**Base:** `18cd9d4` su `feat/15-imboscate-in-viaggio`
**Iterazione:** 1

**Esito:** 9 finding (0 critical, 1 warning, 8 info) → 7 corretti (A-WR-01, A-IN-01, A-IN-03, B-IN-02, B-IN-03, C-IN-01, C-IN-02), 2 `not_needed` per ruling (A-IN-02, B-IN-01), 0 saltati, 0 rinviati. 12 commit di codice, più questo report.

## Tabella dei finding

| Finding | Esito | Commit | Note |
| --- | --- | --- | --- |
| A-WR-01 | fixed | `59ddf54` (RED), `cb5e86d` (GREEN) | `AmbushSweeper.runOnce` chiama `recordFailureSafely`: `recordFailure` sta in un proprio try/catch che logga ERROR `Imboscata <jobId>: registrazione del fallimento non riuscita: <describeError>` e prosegue col personaggio successivo. `$inc` mantenuto come da ruling (nessun `$set`). RED in `ambush-sweeper.int-spec.ts` `keeps sweeping when recording a failure throws (D-18)`: due imboscate scadute, il combattimento lancia solo per la prima e `updateOne` con `AMBUSH_ATTEMPT_UPDATE` rifiuta («driver down»); prima `sweep()` rifiutava, ora risolve 1 e la seconda ha il suo report. Handoff §5 aggiornato. |
| A-IN-01 | fixed | `f9736df` (RED), `533a8f9` (GREEN) | `skip(..., reason: string)`: il log finale è `Imboscata <jobId> risolta: skipped (<motivo>)` con `pool non componibile`, `nessuna città vicina`, `catalogo vuoto`, `personaggio senza proprietario` (il ramo `!composed \|\| !place.nearCity` è diviso in due per dare il motivo, stesso esito). Il warn del ramo senza proprietario resta. RED: le spec `skips a non composable ambush and redraws (D-08)` e `skips an ownerless traveller without any redraw (D-08)` ora leggono il log (helper `skippedLogsOf`). Nessun cambio di comportamento. Handoff §5 aggiornato. |
| A-IN-02 | not_needed | — | Estrarre la geografia da `ambush-resolution.service.ts` è un refactor strutturale fuori dallo scope della review di fase (CLAUDE.md: refactor massivi in PR separata); servizio coperto al 97 %/81 %/99 %, nessun difetto trovato. Segnato nel handoff (§8, punti aperti) come follow-up facoltativo. |
| A-IN-03 | fixed (refactor) | `7cc5855` | `planAmbushOutcome` in forma lineare: `if (!won) { if (!input.detour) throw …; return defeatPlanOf(…); }`, niente ramo ridondante né `!`. Refactor senza RED: `ambush-plan.spec.ts` 14/14 verde. Il controllo del `detour` ora avviene dopo `foughtOutcomeOf`/`reportOf`, funzioni pure: stesso errore, stesso esito. |
| B-IN-01 | not_needed | — | La «duplicazione» è una guardia più una `create(ambushResultDraftsOf(reports, id), { session, ordered: true })` in due transazioni diverse (completamento, teleport); un helper riceverebbe modello e sessione e porterebbe l'invariante `ordered: true` fuori dai servizi dove i gate del piano 09 lo pinnano. Resta così. |
| B-IN-02 | fixed | `5e870d6` (RED), `90c228b` (GREEN) | `compareIds(a, b)` esportata da `src/roads/road-route.ts` (confronto per unità di codice), usata da `RoadsService.nearestByTime`, `nearestPoi` (`ambush-point.ts`) e dall'ordinamento dei report (`ambush-results.ts`) al posto di `localeCompare`. RED in `road-route.spec.ts`: tre casi `(D-06, D-11)` (ordine con `'B' < 'a'`, uguaglianza, cifre prima delle lettere), rossi per export assente (TS2305, come le RED a modulo assente dei piani 15-0x; `tsc` a 0 dal commit GREEN). Le spec di parità esistenti restano verdi (`roads.service.int-spec.ts` 16/16). Gli altri `localeCompare` del repo sono fuori fase e non toccati. |
| B-IN-03 | fixed | `897d647` (RED), `02a7de8` (GREEN) | `dueTravelsFilter` richiede `'status.activeTravel.ambush': null` come `completionFilter` (D-13). RED: `travel.updates.spec.ts` `dueTravelsFilter matches the due travels without a pending ambush (D-13)` e `travel-completion.int-spec.ts` (blocco dello sweep) `leaves an expired travel with a pending ambush to the ambush sweep (D-13)`: prima lo sweep chiamava `complete` (1 chiamata, esito `stale`), ora non lo chiama, documento invariato, nessun push. Handoff §5 aggiornato. |
| C-IN-01 | fixed (solo commento) | `d41aa12` | Commenti in `quest-outcomes.module.ts` e `travel-planning.module.ts`: due binding di `ChanceSource` (il secondo per `AmbushPlanner`, non importabile senza ciclo), stessa classe senza stato, gli harness li sovrascrivono per token in tutti i moduli. Nessun codice, nessuna spec. |
| C-IN-02 | fixed | `e949758` (RED), `9b1ae20` (GREEN) | `parseAmbushConfig` rifiuta un fuso canonico che inizia con `+`/`-` (offset fisso, ignora l'ora legale) con lo stesso messaggio, che non ripete il valore; la canonicalizzazione via `Intl` è estratta in `canonicalTimeZoneOf`. RED in `ambush-config.spec.ts` `rejects a fixed offset time zone (D-04)` (`+02:00`, `-0530`); guardia `keeps accepting the IANA zones with a sign in the name (D-04)` (`Etc/GMT+2`) verde dal primo colpo; `Europe/Rome` e `UTC` restano coperti dalle spec esistenti. Handoff §7 aggiornato. `.env.example` invariato (dice già «fuso orario IANA»). |

Prettier ed eslint puliti su ogni file `.ts` toccato, uno per uno (l'unico warning, `no-unsafe-return` a `roads.service.ts:142`, esisteva già a `18cd9d4`). `tsc` a 0 su ogni commit tranne la RED `5e870d6` (export assente, per costruzione).

## Gate finale

| Controllo | Esito |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx jest src/travel src/quests src/models src/gameRules src/roads src/config --selectProjects unit` | 110 suite / 1401 test verdi |
| `npx jest src/travel/ambush/ambush-sweeper.int-spec.ts --selectProjects integration --runInBand` | 5/5 |
| `npx jest src/travel/ambush/ambush-resolution.int-spec.ts --selectProjects integration --runInBand` | 24/24 |
| `npx jest src/travel/travel-completion.int-spec.ts --selectProjects integration --runInBand` | 35/35 |
| `npx jest src/roads/roads.service.int-spec.ts --selectProjects integration --runInBand` | 16/16 |
| `npx jest src/travel/ambush/ambush-lifecycle.int-spec.ts --selectProjects integration --runInBand` | 16/16 |
| `npx jest src/travel/ambush/ambush.processor.int-spec.ts --selectProjects integration --runInBand` | 2/2 |
| `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | 76/76 |
| `git diff --exit-code src/schema.gql` | exit 0 |
| `git diff origin/develop -- src/schema.gql`, righe tolte | solo `  quest: QuestResultQuest!` |
| `Math.random` / `process.env.` aggiunti sotto `src/` | 0 |
| trailer vietati in `18cd9d4..HEAD` | 0 (controllato dopo ogni commit) |
| `git status --short` / `pgrep -fl 'bin/jest'` a fine lavoro | vuoti |
| processo BE dell'utente (pid 97078) | vivo, `dist/` non toccato (nessuna build) |

Nessun test instabile osservato, nessuna int-spec appesa.

## Note per il handoff FE

- **Contratto FE:** nessun cambio di SDL, di nomi né di payload; `src/schema.gql` invariato.
- **A-WR-01 (solo BE):** un errore nel registrare il tentativo fallito non ferma più lo sweep delle imboscate; nuovo log ERROR descritto in `BACKEND-NOTES.md` §5.
- **A-IN-01 (solo log):** il log `risolta: skipped` porta il motivo fra parentesi; `BACKEND-NOTES.md` §5 aggiornato.
- **B-IN-03 (nessun effetto sul filo):** lo sweep dei viaggi ignora i viaggi scaduti con un'imboscata pendente; prima li selezionava e li scartava come `stale`. Arrivo e push `travelEnd` restano come prima (li ri-accoda l'imboscata risolta o annullata). `BACKEND-NOTES.md` §5 aggiornato.
- **C-IN-02 (config del deploy):** `AMBUSH_TIMEZONE` con un offset fisso (`+02:00`) ora **rifiuta il boot** come un fuso non valido; i nomi IANA (`Europe/Rome`, `UTC`, `Etc/GMT+2`) restano ammessi. `BACKEND-NOTES.md` §7 aggiornato.
- **B-IN-02:** parità per id con confronto per unità di codice: con gli id esadecimali minuscoli di Mongo l'ordine è identico a prima.
- **A-IN-02:** registrato in `BACKEND-NOTES.md` §8 come follow-up facoltativo (PR separata).
- A-IN-03 e C-IN-01 sono interni (refactor e commenti): nessun effetto.

---

_Fixed: 2026-11-06T21:17:28Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
