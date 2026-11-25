---
phase: 26-eliminazione-account-e-consenso
plan: 02
subsystem: auth, users, models
tags: [legal-consent, oauth-state, twitch-login]
requires: ["26-01"]
provides:
  - "forma della versione accettata: TERMS_VERSION_PATTERN e isTermsVersion in src/auth/twitch/terms-version.ts"
  - "OAuthStateService.sign(challenge, termsVersion) e verify(state): OAuthStateClaims | null (verifyChallenge rimosso)"
  - "TwitchLoginErrorCode.TERMS_NOT_ACCEPTED = 'terms_not_accepted'"
  - "campi interni User.acceptedTermsVersion e User.termsAcceptedAt (solo @Prop, default null)"
  - "UsersService.findOrCreateByTwitchId(twitchId, consent: LegalConsent) con scrittura del consenso in due passi"
affects: [26-06, 26-07, 26-13, 26-14]
tech-stack:
  added: []
  patterns:
    - "consenso in due passi: upsert con versione e data nel `$setOnInsert`, poi `findOneAndUpdate` condizionale su versione diversa; se il secondo passo non trova nulla si restituisce il documento dell'upsert"
key-files:
  created:
    - src/auth/twitch/terms-version.ts
    - src/auth/twitch/terms-version.spec.ts
  modified:
    - src/auth/twitch/oauth-state.service.ts
    - src/auth/twitch/oauth-state.service.spec.ts
    - src/auth/twitch/twitch-login-error-code.enum.ts
    - src/auth/twitch/twitch-login.service.ts
    - src/auth/twitch/twitch-auth.controller.ts
    - src/auth/twitch/twitch-auth.controller.int-spec.ts
    - src/models/user.model.ts
    - src/users/users.service.ts
    - src/users/users.service.int-spec.ts
    - src/users/user-updates.publisher.int-spec.ts
    - src/auth/dev/dev-auth.strategy.int-spec.ts
    - test/auth/login-flow.int-spec.ts
    - test/auth/http-guard.int-spec.ts
    - test/auth/ws-auth.int-spec.ts
decisions:
  - "Secondo passo del consenso con findOneAndUpdate (new: true) invece di updateOne: restituisce il documento aggiornato; nessuna corrispondenza (stessa versione) = documento dell'upsert, mai null (ruling dell'orchestratore)"
  - "Il servizio del login riceve termsVersion come unknown e la valida con isTermsVersion dopo la challenge; il callback la legge solo dallo state firmato"
metrics:
  duration: "25 min"
  completed: 2026-11-25
  tasks: 3
  files: 16
---

# Phase 26 Plan 02: consenso al login Summary

`termsVersion` obbligatoria su `GET /auth/twitch/start` (forma `^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$`), firmata nello state OAuth accanto alla challenge; il callback la legge solo dallo state e scrive versione e data del `Clock` del BE nell'upsert che crea l'utente, e su un utente esistente solo quando la versione cambia. Rifiuto per redirect `?error=terms_not_accepted`; bypass di sviluppo esente; `src/schema.gql` invariato (D-09, D-11, D-12, D-19).

## Task

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | forma della versione, state con due claim | `1b82f01f` |
| 1 GREEN | `terms-version.ts`, `sign`/`verify`, codice `TERMS_NOT_ACCEPTED` | `bd85ed7d` |
| 2 RED | rifiuti allo start e al callback, consenso nell'upsert, refresh e bypass | `751fddc3` |
| 2 GREEN | campi sull'utente, upsert col consenso, `Clock` nel login | `9dc4072f` |
| 3 | bookkeeping | commit `docs(phase-26): record plan 02 progress` |

## Ordine finale dei rifiuti

- Start: `twitch_not_configured` → `invalid_request` (challenge) → `terms_not_accepted` (versione assente o malformata).
- Callback: `twitch_not_configured` → `invalid_state` (state nullo o senza challenge) → `terms_not_accepted` (versione nulla nello state) → `access_denied` → `invalid_request` (codice mancante) → scambio con Twitch.

## RED attesi e osservati

- `terms-version.spec.ts`: suite rossa, modulo `src/auth/twitch/terms-version` inesistente (atteso).
- `oauth-state.service.spec.ts`: 13 rossi, `service.verify is not a function` (atteso); il caso di `sign` con la nuova firma era verde (ts-jest non blocca l'argomento in più) e il nuovo `expect(decoded.termsVersion)` era rosso.
- `test/auth/http-guard.int-spec.ts` e `test/auth/ws-auth.int-spec.ts`: solo la firma di `sign` cambiata, casi «token confusion» verdi senza altri cambi.
- `twitch-auth.controller.int-spec.ts`: rossi i due rifiuti dello start, il rifiuto del callback senza versione e i tre casi di scrittura del consenso (atteso: start accettato senza versione, campi assenti). `checks the challenge before the terms version (D-19)` **verde al primo colpo**: è una guardia d'ordine, la challenge era già controllata per prima.
- `users.service.int-spec.ts`: rossi i cinque casi nuovi (campi assenti).
- `login-flow.int-spec.ts` `refreshes a session of a user written without consent (D-11)` e `dev-auth.strategy.int-spec.ts` `lets the dev bypass in without any consent and writes none (D-19)`: **verdi al primo colpo**, sono guardie di non-regressione (refresh e bypass non leggono il consenso).
- `user-updates.publisher.int-spec.ts`: rosso per timeout (vedi deviazione 1).

## Casi esistenti riscritti con la nuova firma

- `oauth-state.service.spec.ts`: `describe('verifyChallenge')` → `describe('verify')`; `returns the challenge of a valid state` sostituito da `signs the accepted version next to the challenge (D-19)` (confronto `toEqual` delle due claim); gli altri casi (altro segreto, payload manomesso, audience dell'access token, scaduto, senza challenge, input non stringa → `null`) invariati salvo il nome del metodo; il caso di `sign` verifica anche la claim `termsVersion`.
- `twitch-auth.controller.int-spec.ts`: gli helper `startState`, `login` e tutti gli start validi mandano `START_QUERY` (challenge più `termsVersion=2026-11-24`); il caso della challenge malformata manda anche la versione; la suite «with Twitch configured» usa un `FixedClock`.
- `users.service.int-spec.ts`: i tre casi di `findOrCreateByTwitchId` passano un `LegalConsent`; «returns the existing user untouched» ha ora un utente con la stessa versione già accettata (resta vero: stessa versione = nessuna scrittura).
- `user-updates.publisher.int-spec.ts` «publishes nothing for the no-op upserts…»: l'utente riceve prima il consenso con la stessa versione (evento consumato), poi il login è davvero un no-op.
- `login-flow.int-spec.ts`: il flusso completo manda la versione; aggiunto `afterEach` con `clearDatabase`.

## Verifiche

- `npx jest src/auth/twitch/terms-version.spec.ts src/auth/twitch/oauth-state.service.spec.ts --selectProjects unit`: 29/29.
- `npx jest test/auth/http-guard.int-spec.ts test/auth/ws-auth.int-spec.ts --selectProjects integration --runInBand`: 36/36.
- `npx jest src/auth/twitch/twitch-auth.controller.int-spec.ts test/auth/login-flow.int-spec.ts src/users/users.service.int-spec.ts src/users/user-updates.publisher.int-spec.ts src/auth/dev/dev-auth.strategy.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand`: 165/166 al primo giro (solo il publisher, poi corretto), publisher rilanciato da solo 6/6.
- SDL rigenerato dal boot reale di test: `git diff --exit-code src/schema.gql` esce 0; nessuna occorrenza di `acceptedTermsVersion`, `termsAcceptedAt`, `termsVersion`.
- `git diff 9a084248 -- src/auth/dev/dev-auth.strategy.ts src/config` vuoto; nessun chiamante di `findOrCreateByTwitchId` con un solo argomento.
- `npx tsc --noEmit -p tsconfig.json` esce 0; prettier ed eslint puliti sui file toccati; `pgrep -fl 'bin/jest'` vuoto.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] barriera del publisher su un aggiornamento senza effetto**
- **Found during:** Task 2 GREEN
- **Issue:** il RED usava `flushUntilBarrier()` dopo aver scritto il consenso sull'utente del caso; il sentinella vale già `-1` dal `beforeEach`, quindi la barriera è un aggiornamento senza effetto, MongoDB non emette eventi e il caso andava in timeout anche col codice giusto.
- **Fix:** si consuma l'evento della semina del consenso (`nextEvent()` con l'id dell'utente) prima del login no-op. Incluso nel commit GREEN `9dc4072f`.

**2. [Rule 3 - Blocking] controller toccato nel Task 1**
- **Found during:** Task 1 GREEN
- **Issue:** la nuova firma di `sign` chiede la versione allo start; per compilare il controller doveva già passare `@Query('termsVersion')`.
- **Fix:** query aggiunta al controller nel Task 1 (transitorio `termsVersion ?? ''`, che firma una claim che `verify` legge come nulla); il controllo di forma è arrivato nel Task 2 come previsto.

**3. Secondo passo con `findOneAndUpdate`**
- Il piano scrive `updateOne condizionale … restituisce il documento aggiornato`: per restituirlo si usa `findOneAndUpdate` con `new: true`; se non trova nulla (stessa versione) si restituisce il documento dell'upsert (ruling dell'orchestratore), provato da `leaves the consent untouched for the same version (D-09)` sul documento RESTITUITO (non nullo, stesso id, consenso intatto) e su quello salvato.

**4. Asserzione sul personaggio con `toEqual`**
- eslint (`no-base-to-string`) segnalava `String(stored?.currentCharacter)`: confronto con `toEqual(characterId)` sull'ObjectId.

## Note per i piani successivi

- La cancellazione dell'account deve togliere anche `acceptedTermsVersion` e `termsAcceptedAt` insieme all'utente (sono sul documento utente: si cancellano con lui).
- `TwitchLoginService` ora inietta `Clock` (già fornito da `AuthModule`).
- Nelle int-spec col publisher di `users`: un `$set` sul sentinella col valore che ha già non emette eventi.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- `src/auth/twitch/terms-version.ts` e `src/auth/twitch/terms-version.spec.ts` presenti; commit `1b82f01f`, `bd85ed7d`, `751fddc3`, `9dc4072f` nel log.
