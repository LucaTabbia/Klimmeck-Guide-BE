---
phase: 10-hardening-trasversale
plan: 11
subsystem: graphql
tags: [graphql, introspection, landing-page, error-sanitizer, requestId, graphql-ws, D-05, D-07, C7, BE-HARD-02]
requires:
  - "10-07: RUNTIME_CONFIG / RuntimeConfig { mode, production, modeDefaulted }; createAuthTestApp({ runtime })"
  - "10-10: catalogo con soli errori codificati (NOT_FOUND), così il sanitizer non li nasconde"
provides:
  - "src/graphql/request-id.ts: REQUEST_ID_HEADER ('x-request-id'), requestIdFrom(header: unknown): string"
  - "src/graphql/production-errors.ts: INTERNAL_ERROR_MESSAGE ('Errore interno'), INTERNAL_SERVER_ERROR, sanitizeFormattedError, isInternalError, sanitizeExecutionErrors(errors, requestId, logger), logInternalError(logger, requestId, error)"
  - "src/graphql/request-id.plugin.ts: requestIdPlugin(logger = new Logger('GraphQL'))"
  - "GraphQLRequestContext.requestId: string (HTTP da header sanificato, WS sempre nuovo)"
  - "createGraphQLOptions(ws, autoSchemaFile, { production }: GraphQLSurfaceOptions)"
  - "src/graphql/production-surface.int-spec.ts; test/graphql/production-probe.resolver.ts (ProductionProbeResolver, PROBE_RAW_MESSAGE)"
affects: [10-12, 10-13, 10-14, 10-30]
tech-stack:
  added: []
  patterns:
    - "la modalità arriva come parametro della factory unica: AppModule da RUNTIME_CONFIG, l'harness da options.runtime"
    - "sanitizer puro condiviso fra formatError (HTTP) e onNext/onError (graphql-ws)"
    - "log dell'errore interno: requestId + describeError nel messaggio, stack come secondo argomento del Logger"
key-files:
  created:
    - src/graphql/request-id.ts
    - src/graphql/request-id.spec.ts
    - src/graphql/production-errors.ts
    - src/graphql/production-errors.spec.ts
    - src/graphql/request-id.plugin.ts
    - src/graphql/request-id.plugin.spec.ts
    - src/graphql/production-surface.int-spec.ts
    - test/graphql/production-probe.resolver.ts
  modified:
    - src/graphql/graphql-context.ts
    - src/graphql/graphql-context.spec.ts
    - src/graphql/graphql-options.factory.ts
    - src/graphql/graphql-options.factory.spec.ts
    - src/app.module.ts
    - test/auth/auth-test-app.ts
    - test/app.int-spec.ts
key-decisions:
  - "in produzione un errore senza codice o con INTERNAL_SERVER_ERROR diventa { message: 'Errore interno', extensions: { code: 'INTERNAL_SERVER_ERROR', requestId } }; ogni altro tiene solo message/locations/path/extensions.code (D-07)"
  - "requestId: header x-request-id se /^[A-Za-z0-9._-]{1,64}$/, altrimenti randomUUID(); su WS sempre nuovo per operazione (l'header dell'upgrade è per-socket)"
  - "su graphql-ws in produzione validate marca gli errori con GRAPHQL_VALIDATION_FAILED e toglie il «Did you mean», per parità con l'HTTP (C7)"
  - "il plugin del requestId è montato anche fuori produzione: requestId additivo sugli INTERNAL_SERVER_ERROR, messaggi grezzi invariati"
requirements-completed: []
duration: ~40 min
completed: 2026-10-29
---

# Phase 10 Plan 11: superficie GraphQL di produzione Summary

In produzione (`RUNTIME_CONFIG.production`) introspection e landing page sono spente, i suggerimenti dello schema nascosti e ogni errore imprevisto diventa `Errore interno` + `requestId` su HTTP e su graphql-ws, con il log server dell'errore intero sullo stesso `requestId`; sviluppo e test restano invariati.

## Commit

| Task | Fase | Commit | Messaggio |
|------|------|--------|-----------|
| 1 | RED | faa4dc5 | `test(graphql): expect sanitized production errors` |
| 1 | GREEN | 720c4ea | `feat(graphql): add request ids and the production error sanitizer` |
| 2 | RED | 09c016e | `test(graphql): expect the production surface over HTTP` |
| 2 | GREEN | 59f6c69 | `feat(graphql): harden the production surface over HTTP` |
| 3 | RED | 9d9e51b | `test(graphql): expect the production surface over graphql-ws` |
| 3 | GREEN | 90904d0 | `feat(graphql): harden graphql-ws in production` |

## Fallimenti RED attesi

- Task 1: `request-id.spec.ts` e `production-errors.spec.ts` non compilano (moduli assenti); `buildGraphQLContext` 3 casi rossi (`requestId` indefinito).
- Task 2: `createGraphQLOptions` 4 casi rossi (terzo argomento ignorato, chiavi e plugin diversi); `request-id.plugin.spec.ts` non compila; `production-surface.int-spec.ts` 6 rossi su 8 (introspection HTTP aperta, «Did you mean "boom"?», landing page 200, messaggio Mongo grezzo, nessun `requestId`).
- Task 3: 6 casi unit rossi (hook graphql-ws assenti); int-spec 3 rossi: l'introspection su socket autenticato restituisce `__schema` (sonda C7 riprodotta), `probeBoom` e l'iteratore della subscription consegnano `E11000 duplicate key mongodb://…` grezzo.

Verdi al primo colpo: `keeps the domain codes in production (D-07)` (i codici di dominio e il `NOT_FOUND` del catalogo li preservava già `formatDomainError`, piano 10-10), `keeps the landing page outside production (D-05)` (comportamento già attivo), `keeps domain codes over graphql-ws in production (C7)` (graphql-js copia `originalError.extensions` = `{ code }`), la rinomina del caso del boot reale (`keeps introspection available outside production (D-05)`, stessa asserzione: il boot gira in `test`).

## Verifiche finali

- `npx jest src/graphql --selectProjects unit`: 7 suite, 59 test verdi.
- `npx jest src/graphql/production-surface.int-spec.ts --selectProjects integration --runInBand`: 13/13.
- `npx jest src/graphql test/auth test/app.int-spec.ts --selectProjects integration --runInBand`: 6 suite, 105 test verdi prima del caso di contrasto WS (poi int-spec 13/13); `src/authz/audit/admin-audit.int-spec.ts` 11/11 (unica altra spec che nomina `INTERNAL_SERVER_ERROR`).
- `npm run build` 0; `git diff --exit-code src/schema.gql` 0; nessuna riga rimossa contro `origin/develop`; `pgrep -fl jest` vuoto.
- Accettazione: nessun `introspection: true` in `src` fuori dagli spec; `introspection: !production`, `ApolloServerPluginLandingPageDisabled`, `RUNTIME_CONFIG` in `AppModule`, `NoSchemaIntrospectionCustomRule` (import + uso), `onNext:`/`onError:` 2 righe, 4 righe «over graphql-ws|subscription iterator», 13 `it('` nell'int-spec.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correttezza] `validate` di graphql-ws marca gli errori con `GRAPHQL_VALIDATION_FAILED` e toglie i suggerimenti**
- **Found during:** Task 3
- **Issue:** con il solo `validate(schema, doc, [...specifiedRules, NoSchemaIntrospectionCustomRule])` del piano gli errori di validazione WS non hanno codice: il sanitizer li trasformerebbe in `Errore interno` con un log ERROR per ogni typo, e un typo su WS mostrerebbe comunque «Did you mean …» (`hideSchemaDetailsFromClientErrors` agisce solo su Apollo HTTP, T-10-38).
- **Fix:** `validateWithoutIntrospection` ricrea ogni errore con `nodes` (quindi `locations`), messaggio senza `/ ?Did you mean(.+?)\?$/` (la stessa regex del plugin `DisableSuggestions` di Apollo) e `extensions.code = ApolloServerErrorCode.GRAPHQL_VALIDATION_FAILED`; casi unit `refuses introspection over graphql-ws with a validation code (C7)` e `suggests no schema field over graphql-ws (C7, D-07)`.
- **Commit:** 90904d0

**2. [Rule 1 - Spec] La regola di introspection segnala ogni campo introspettivo**
- **Found during:** Task 3 GREEN
- **Issue:** `NoSchemaIntrospectionCustomRule` su `{ __schema { queryType { name } } }` produce due errori (`__schema` col. 3, `queryType` col. 14); la spec RED ne attendeva uno.
- **Fix:** attese della spec unit e dell'int-spec corrette a due voci nello stesso commit GREEN.
- **Commit:** 90904d0

**3. [Accettazione] Caso di contrasto `keeps introspection over graphql-ws outside production (D-05)`**
- **Found during:** Task 3
- **Issue:** con i titoli prescritti il grep `over graphql-ws\|subscription iterator` contava 3 righe (il titolo dell'introspection dice «over an authenticated graphql-ws socket»).
- **Fix:** caso aggiunto nel blocco di sviluppo (prova che graphql-ws resta introspettabile fuori produzione) con `afterEach(clearDatabase)`; nel commit GREEN, verde al primo colpo per costruzione.
- **Commit:** 90904d0

**4. Casi in più rispetto al behavior** (verdi insieme al GREEN): `generates a different id on every call without a header`, `generates a request id for an HTTP operation without the header`, `keeps an Apollo request-level code as it is`, `keeps locations and path of a sanitized graphql-ws error`, `keeps the domain code of a graphql-ws error without logging it`, `logs the request id, the error name and the stack, never the message`, `leaves a response without errors untouched`, `adds the stack trace switch only in production`, `generates a request id when the header is unusable (D-07)` (wire), `keeps the landing page outside production (D-05)`, e i casi unit di `onNext`/`onError`.

Nessun file da formattare prima (tutti già conformi a Prettier); subject tutti ≤ 72 caratteri; schema invariato.

## Note per i piani successivi

- Il plugin `requestIdPlugin` gira anche in sviluppo/test: ogni `INTERNAL_SERVER_ERROR` HTTP riceve `extensions.requestId` (additivo); i messaggi restano grezzi fuori produzione.
- `didEncounterErrors` logga solo gli errori che `formatDomainError(error.toJSON(), error)` lascia senza codice o con `INTERNAL_SERVER_ERROR` (le `HttpException` codificate, i codici Apollo di validazione e `BAD_USER_INPUT` no); Nest continua a loggare anche il suo `[ExceptionsHandler]` grezzo.
- Il 10-12 (REST) riusa `requestIdFrom(req.headers[REQUEST_ID_HEADER])`, `INTERNAL_ERROR_MESSAGE` e `logInternalError(logger, requestId, error)`.

## Known Stubs

Nessuno.

## Self-Check: PASSED
