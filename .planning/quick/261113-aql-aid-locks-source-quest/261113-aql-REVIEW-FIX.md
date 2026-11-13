---
quick: 261113-aql
fixed_at: 2026-11-13
review_path: .planning/quick/261113-aql-aid-locks-source-quest/261113-aql-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 10
not_needed: 0
skipped: 0
status: all_fixed
---

# Quick 261113-aql (BE): fix della code review

**Fixed at:** 2026-11-13
**Source review:** `261113-aql-REVIEW.md` (ruling dell'orchestratore in fondo al file)
**Ramo:** `feat/quick-aid-locks-source-quest`, da `d7f3c9d2`

**Riepilogo:** 10 finding in scope (2 warning, 8 info), tutti chiusi secondo i ruling. Una sola parte chiusa `not_needed`, come da ruling: in IN-08 la divergenza teorica di `rescue.failedQuest` scritto come stringa (dato non valido per lo schema), documentata per la UAT nei limiti noti del handoff.

## Esiti

| Id | Esito | Commit | Prova |
|----|-------|--------|-------|
| WR-01 | fixed | `30746ccf` (RED), `00d40e60` (GREEN) | RED 3/15 nella unit del publisher. `touchesConclusion` ripubblica la quest d'origine se `concludedAt` è tra gli `updatedFields` con qualunque valore (`null` compreso), se è tra i `removedFields`, e su ogni `replace`; `removedFields` aggiunto a `ChangeStreamEvent`. Sonde: senza il ramo `replace` → rosso «…when its aid is replaced»; senza i `removedFields` → rosso «…is removed»; con `!= null` al posto di `in` → rosso «…reopened with a null conclusion». La cancellazione a mano resta un limite dichiarato. |
| WR-02 | fixed (solo test) | `d7f564a8` | Sul filo (`quest-updated.subscription.int-spec.ts`): l'aid A si chiude con `$set` e B nasce dalla stessa hunt nella stessa `connection.transaction`; da 1 a 2 eventi, l'ultimo è `{ id, awaitingRescue: true }`. Nella unit (`quests.publisher.spec.ts`): conclusione e nascita nello stesso tick, la prima lettura della quest d'origine resta in sospeso con lo stato vecchio → 2 letture, l'ultimo publish è quello nuovo. Verde sul codice di oggi (il contratto c'era già). Sonde: `republish` che salta il single-flight (`void this.publishUpdated`) → unit rossa, filo verde; publisher senza ripubblicazione all'insert → filo verde (la lettura fatta alla conclusione vede già B, perché le due scritture fanno commit insieme); publisher senza nessuna ripubblicazione della quest d'origine → filo rosso. Sul filo il contratto regge per costruzione (le letture partono dopo il commit): il morso sul single-flight lo dà la unit. |
| IN-01 | fixed (documenti) | `fa8a1778` | SUMMARY (Deviazioni e note) e handoff (Semantica per la FE): `awaitingRescue` è affidabile solo su `quests`, `quest(id)` e `questUpdated`; sulle quest annidate servite col solo `_id` risponde `false`. |
| IN-02 | fixed (documenti) | `fa8a1778` | SUMMARY e handoff: chi ha già la quest in corsia la gioca e la riceve con `awaitingRescue: true`; per la FE «in corso» ha la precedenza sul foglio strappato; due aid aperte dalla stessa quest tengono il blocco finché si chiudono entrambe. |
| IN-03 | fixed (documenti) | `fa8a1778` | Frase della corsa residua riscritta in modo esatto nel SUMMARY e nei limiti noti del handoff: un'accettazione può fare commit dopo la nascita dell'aid se la sua lettura in sessione l'ha preceduta. |
| IN-04 | fixed | `76f34d40` (RED), `fd3e02c7` (GREEN) | RED 13/70: `buildAidQuest` scriveva 60 479 999 per 86 400 000 a 7/10 e 25 919 999 per la catena 34 560 000 × (3/10)/(4/10). Ora una sola quota, `RescueShare` (numeratore e denominatore interi: `rescueFractionOf`, `shareRatioOf`); `sharedTimeOf` calcola `(tempo × num − resto) / den`, senza tolleranza. Casi pinnati: 86 400 000 a 7/10 → 60 480 000; 3 600 000 a 2/8 → 900 000; catena → 25 920 000. I premi restano come prima (`shareValueOf` della stessa quota + tolleranza): valori pinnati invariati, spec dei premi verdi. Sonde: `sharedTimeOf` tornato alla virgola mobile → 2 rossi (86 400 000 a 7/10, nella unit di `rescue-share` e in `buildAidQuest`); `aidShareOf` che ignora la quota della sorgente → 4 rossi (le due catene della durata e le due dei premi). |
| IN-05 | fixed | `cbae3cad` | `rescue-share.ts` importa `isPositiveInteger` da `../outcome-numbers`, copia locale tolta; spec unit di `aid` verdi (116). |
| IN-06 | fixed (solo test) | `ce356a23` | `quests.resolver.int-spec.ts` «serves every other field of the infos of a dungeon aid as the aid without a turn (quick 261113-aql, IN-06)»: seleziona `timeToComplete title type description markerLocation { id } relatedLore { id } enemies`; ogni campo salvo `enemies` è uguale a quello della stessa aid senza turno e ai valori salvati. Sonde (un campo rotto alla volta nel resolver: `title`, `markerLocation`, `relatedLore`, `description`, `timeToComplete`) → 5 su 5 rossi. |
| IN-07 | fixed (solo test) | `e7b27fa0` | Il caso «rejects from the read in the transaction an aid born after the pre-check» ora pretende che la sola lettura con filtro su `rescue.failedQuest` porti la sessione stessa della transazione (spy passante su `Query.prototype.session` con `mock.contexts`, sessione catturata dal wrapper di `connection.transaction`). Deterministico. Sonde: `.session(null)` in `rescue-lock.ts` → rosso; `session` non passata da `notAwaitingRescueOrReject` → rosso. |
| IN-08 | fixed (commenti) + parte `not_needed` | `98482a07` | Commento dell'indice `quest_forming_parties` (lettura delle aid aperte dell'accettazione e del filo, report al boot) e della subscription `questUpdated` (eventi alla nascita e al cambio della conclusione di un'aid) riallineati. `rescue.failedQuest` come stringa: `not_needed` da ruling (lo schema lo tipizza come ObjectId e il codice lo scrive sempre così), segnalato nei limiti noti del handoff per chi semina aid a mano in UAT. |

## Gate (dopo i fix)

- `npx tsc --noEmit -p tsconfig.json`: 0; `-p tsconfig.build.json`: 0.
- `npx jest --selectProjects unit`: 283 suite / 3819 test verdi.
- `npx jest src/quests/outcomes --selectProjects integration --runInBand`: 14 suite / 205 test.
- `npx jest src/quests --selectProjects integration --runInBand --testPathIgnorePatterns '/node_modules/' 'src/quests/outcomes/'`: 25 suite / 435 test.
- `npx jest src/characters --selectProjects integration --runInBand`: 23 suite / 390 test.
- `npx jest test/ --selectProjects integration --runInBand`: 17 suite / 275 test.
- Coverage di `./src/quests/acceptance/` (unit + integration, report nello scratchpad): statements 99.09 %, branches 92.95 %, lines 99.74 % (soglia 97 / 91 / 98).
- `git diff develop -- src/schema.gql | grep -cE '^[+-][^+-]'`: 1. Nessuna variabile d'ambiente nuova, nessun tiro nuovo, valori dei premi pinnati invariati.
- prettier ed eslint puliti sui 12 file `.ts` toccati; subject fra 55 e 70 caratteri, nessun trailer (`grep -ciE` = 0 su tutti i commit da `d7f3c9d2`); `git status --short` vuoto; `pgrep -fl 'Klimmeck-Guide-BE.*bin/jest'` vuoto.

## Documenti aggiornati

`261113-aql-SUMMARY.md` (corsa residua riscritta, limiti IN-01 e IN-02, sezione «Fix della code review») e la sezione «Aggiornamento 2026-11-13 — quick 261113-aql» di `.planning/phases/21-premi-per-rango-e-soccorsi/BACKEND-NOTES.md` (semantica per la FE, ripubblicazione WR-01, prova WR-02, limiti noti, durata in aritmetica intera, spec nuove), commit `fa8a1778`.

---

_Fixed: 2026-11-13_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
