---
phase: 10-hardening-trasversale
plan: 24
subsystem: coverage-gate
tags: [coverage, ci, jest, auth, eventsub, D-16, C12, BE-HARD-04]
requires:
  - "10-20: gate `npx tsc --noEmit -p tsconfig.json` e step CI `Type check`"
  - "10-13/10-14: throttling, harness `createEventSubTestApp`"
  - "10-19: `QuestResultMaintenance.maintain()` lanciato non atteso al boot"
provides:
  - "`collectCoverageFrom` solo codice di produzione; `coverageReporters` text-summary + json-summary + lcov"
  - "`test:cov` = `jest --coverage --selectProjects unit integration --runInBand`"
  - "`coverageThreshold` per cartella (7 chiavi di cartella + 1 di file) = misura − 2 arrotondata per difetto"
  - "CI: step unico `Tests with coverage` (`npm run test:cov`) al posto di `Unit tests` + `Integration tests`"
  - "test nominati di concorrenza e failure mode per auth ed EventSub (checklist F6)"
affects: [10-25, 10-29, 10-31]
tech-stack:
  added: []
  patterns:
    - "soglie Jest con chiavi di percorso (aggregate) alla radice, nessuna chiave `global`"
    - "attesa della manutenzione di boot catturando le promesse di `maintain` con `jest.spyOn(Prototype, ...)` prima del boot"
key-files:
  created:
    - src/eventsub/points-credit.service.int-spec.ts
  modified:
    - package.json
    - .github/workflows/ci.yml
    - src/quests/results/quest-result-maintenance.int-spec.ts
    - src/auth/session/session.service.int-spec.ts
    - src/auth/login-ticket/login-ticket.service.int-spec.ts
    - src/auth/twitch/http-twitch-oauth.client.spec.ts
    - src/auth/twitch/twitch-auth.controller.int-spec.ts
    - src/auth/auth-session.service.int-spec.ts
    - src/eventsub/eventsub.controller.int-spec.ts
    - src/eventsub/helix/http-twitch-helix.client.spec.ts
decisions:
  - "Soglie dalla misura nuova di questo piano (non dalla tabella del RESEARCH); `characters.service.ts` lines 96 (misura 98.13), travel branches 82 (misura 84.05)"
  - "`package.json` non passa per Prettier: lo formatta npm (2 spazi); modificato con `JSON.stringify(..., null, 2)` a formattazione invariata, nessun commit `style`"
  - "Il test instabile della manutenzione dei risultati si corregge nella spec (attesa del `maintain()` di boot), nessun codice di produzione toccato"
metrics:
  duration: "~45 min"
  completed: "2026-10-30"
  tasks: 2
  files: 11
---

# Phase 10 Plan 24: coverage come gate e test di auth/EventSub Summary

Il report di coverage conta solo il codice di produzione, `test:cov` esegue unit + integration in un solo run in banda e fallisce sotto soglie per cartella fissate a misura − 2; la CI ha un solo step `Tests with coverage`; auth ed EventSub hanno test nominati per refresh e ticket concorrenti, OAuth non-JSON o in timeout, redemption doppia concorrente, ledger fallito, Helix in errore e risposta 500 del webhook.

## Commit

| Task | Nome | Commit | Tipo |
| ---- | ---- | ------ | ---- |
| 1 | attesa della manutenzione di boot nella spec instabile (Rule 3) | 23bf27c | test |
| 1 | `collectCoverageFrom`, `test:cov`, soglie per cartella | d1c0c26 | test |
| 1 | CI con un solo step di test con coverage | 1d79dd8 | ci |
| 2 | EventSub: duplicati e failure mode | 2dfd707 | test |
| 2 | auth: concorrenza e failure mode | 96d3c97 | test |

## Task 1 — report, baseline, soglie, CI

- `package.json`: `collectCoverageFrom` = `src/**/*.ts`, `!src/**/*.spec.ts`, `!src/**/*.int-spec.ts`, `!src/main.ts`; `coverageReporters` = `text-summary`, `json-summary`, `lcov`; `test:cov` = `jest --coverage --selectProjects unit integration --runInBand`. `coverage/` è ignorata (`git check-ignore coverage` ok).
- Misura (run `npm run test:cov` senza soglie, 336 s, 271 suite / 3538 test verdi; aggregati da `coverage/coverage-summary.json` con uno script nello scratchpad). Totale `src` non-spec: statements 96.40, branches 84.41, lines 97.00.

| Cartella | Baseline RESEARCH (S / B / L) | Misura 10-24 (S / B / L) | Soglia `coverageThreshold` (S / B / L) |
| --- | --- | --- | --- |
| `./src/auth/` | 99.66 / 85.05 / 99.81 | 99.66 / 85.04 / 99.80 | 97 / 83 / 97 |
| `./src/economy/` | 99.62 / 91.84 / 99.57 | 99.62 / 91.83 / 99.56 | 97 / 89 / 97 |
| `./src/characters/spells/` | 98.53 / 88.56 / 98.89 | 98.52 / 88.55 / 98.89 | 96 / 86 / 96 |
| `./src/characters/equipment/` | 100 / 100 / 100 | 100 / 100 / 100 | 98 / 98 / 98 |
| `./src/characters/characters.service.ts` | 96.24 / 86.20 / 96.77 | 96.52 / 86.53 / 98.13 | 94 / 84 / 96 |
| `./src/quests/acceptance/` | 99.39 / 91.94 / 100 | 99.10 / 91.66 / 100 | 97 / 89 / 98 |
| `./src/eventsub/` | 98.80 / 91.64 / 99.32 | 98.79 / 91.64 / 99.32 | 96 / 89 / 97 |
| `./src/travel/` | 99.53 / 85.10 / 99.48 | 99.09 / 84.05 / 99.49 | 97 / 82 / 97 |

- Soglia = floor(misura − 2) per metrica; chiavi solo alla radice, nessuna `global`, nessun glob.
- Prova del gate (comando del piano con soglie 100 su `./src/travel/`, solo unit, `coverageDirectory` nello scratchpad): exit **1**, output `Jest: "./src/travel/" coverage threshold for statements (100%) not met: 33.71%` (branches 33.33 %, lines 33.58 %), 5 suite / 65 test verdi.
- Rerun con le soglie: il primo è fallito per due test instabili (vedi Deviazioni), il secondo **exit 0**, 271 suite / 3538, 304 s.
- `ci.yml`: `Unit tests` + `Integration tests` → `- name: Tests with coverage` / `run: npm run test:cov`; `Schema up to date` resta dopo. Nient'altro toccato (il nome del job resta `Lint + Unit + Integration`).

## Task 2 — test di auth ed EventSub

Tutti **verdi al primo colpo**: caratterizzano comportamento già corretto (rotazione atomica con ri-emissione D-35, `findOneAndDelete` del ticket, dedup per indice unico dentro la transazione, mappatura difensiva dei client HTTP). Nessun bug trovato, quindi nessun commit RED/`fix`.

- EventSub (`2dfd707`): `points-credit.service.int-spec.ts` (nuovo, 3) `credits a redemption once when Twitch delivers it twice concurrently`, `leaves no delivery record when the ledger write fails, so the retry can credit`, `rethrows a failure of the delivery record without crediting`; `eventsub.controller.int-spec.ts` `answers 500 to ask for a retry when the ledger write fails` (copre il ramo `retryLater` del controller); `http-twitch-helix.client.spec.ts` describe `failure modes`: `rejects a non-JSON answer as invalid JSON without its body`, `rejects a %i answer with its status only` (400, 503), `reports a Twitch timeout by its error name only`, `reports %s network failure as UnknownError` (non-oggetto, errore senza nome), `maps a list whose data is not an array to no subscriptions`, `drops non-object entries and blanks fields of the wrong type`.
- Auth (`96d3c97`): `session.service.int-spec.ts` `lets only one of five concurrent refreshes rotate the same refresh token, the others get its token (D-35)`, `revokes the session once when two concurrent refreshes reuse a token retired past the grace`; `login-ticket.service.int-spec.ts` `accepts a login ticket only once under concurrent exchanges`; `http-twitch-oauth.client.spec.ts` describe `failure modes and defensive mapping`: `fails the OAuth exchange on a non-JSON Twitch answer`, `fails the token validation on a non-JSON Twitch answer`, `fails the OAuth exchange on a Twitch timeout, bounded by an abort signal`, `fails the token validation on a Twitch timeout`, `maps a token answer without refresh_token or a numeric expires_in`, `keeps only string scopes and blanks a missing login`; `twitch-auth.controller.int-spec.ts` `redirects with invalid_state on a forged or expired state (%s) before any exchange` (scaduto, firmato per l'audience dell'access token), `redirects with invalid_state on a state without a challenge`, `redirects with twitch_exchange_failed and logs only unknown on a non-Error failure`; `auth-session.service.int-spec.ts` `issues a single session when concurrent exchanges redeem the same login ticket`, `leaves the session revoked when a logout races concurrent refreshes, refusing every token`.
- Il throttling di `exchangeLoginTicket`/`refreshSession` (`TOO_MANY_REQUESTS`) era già coperto da `src/throttling/throttling.int-spec.ts` (10-13).
- Conteggi mirati: unit Helix 24/24, OAuth client 19/19; integration delle 6 spec toccate 110/110 (due run consecutivi).
- `npm run test:cov` finale: **exit 0**, 272 suite / **3565** test, 307 s, tutte le soglie rispettate. Nuove percentuali: `./src/auth/` 99.83 / 86.71 / 100 (S / B / L), `./src/eventsub/` 99.39 / 94.02 / 99.49. I rami restanti di auth sono quasi tutti metadati dei decoratori (costruttori, `@Inject`), più `ws-connection-authenticator`, `access-token.service` e `auth.guard` (per il 10-25).
- `npx tsc --noEmit -p tsconfig.json` 0; `npm run build` 0; `src/schema.gql` invariato; nessun file di produzione toccato.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test instabile della manutenzione dei risultati**
- **Found during:** Task 1 (primo rerun di `test:cov` con le soglie)
- **Issue:** `quest-result-maintenance.int-spec.ts` «marks every legacy result as confirmed…» ha ricevuto 2 invece di 3: il `maintain()` lanciato non atteso al boot (10-19) marcava un risultato seminato dal test. Riprodotto 1 volta su 2 rilanciando la spec da sola.
- **Fix:** nella spec, `jest.spyOn(QuestResultMaintenance.prototype, 'maintain')` prima del boot e attesa delle promesse registrate (`settleBootMaintenance`) prima di seminare; 4 run consecutivi verdi.
- **Files modified:** `src/quests/results/quest-result-maintenance.int-spec.ts`
- **Commit:** 23bf27c

**2. Nessun commit `style` per `package.json`**
- `npx prettier --check package.json` fallisce già oggi perché il `.prettierrc` (tabWidth 4) riformatterebbe tutto il file, che npm scrive a 2 spazi. Modificato con `JSON.stringify(..., null, 2)` (identico all'originale prima della modifica), nessuna riformattazione.

**3. Nessun RED nel Task 2**
- I test caratterizzano comportamento corretto e sono verdi al primo colpo (vedi sopra): un commit `test(...)` per area, nessun `fix`.

**4. Titoli dei test leggermente diversi dal piano**
- `lets only one of five concurrent refreshes …` (cinque invece di due: il caso a due esisteva già, `concurrent: two rotations …`); `redirects with invalid_state on a forged or expired state (%s) before any exchange` come `it.each`; `answers 500 to ask for a retry when the ledger write fails`. I grep di accettazione passano.

## Deferred Issues

- **Test instabile osservato, non corretto:** `test/app.int-spec.ts` › `global auth guard` › «rejects an existing mutation without a bearer» (codice `undefined`) e «keeps introspection available outside production (D-05)» (`Parse Error: Expected HTTP/, RTSP/ or ICE/` da supertest) sono falliti una volta su tre run di `test:cov`; verdi negli altri due run e due volte su due rilanciati da soli. Sembra un problema a livello di socket (supertest apre una porta effimera per richiesta) sotto il carico del run completo con coverage. Ora che `test:cov` è un gate di CI va indagato (10-25 o 10-29).

## Known Stubs

Nessuno.

## Threat Flags

Nessuno: solo configurazione di test, CI e spec.

## Self-Check: PASSED

- File: `package.json` (`coverageThreshold` presente), `.github/workflows/ci.yml` (`npm run test:cov`), `src/eventsub/points-credit.service.int-spec.ts` presenti.
- Commit 23bf27c, d1c0c26, 1d79dd8, 2dfd707, 96d3c97 presenti in `git log`.
